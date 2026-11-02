// 서버 없이 온라인 흐름을 시험하는 가짜 연결. 테스트는 메모리 버스로, 개발 서버(VITE_ONLINE_FAKE=1)는 브라우저 탭끼리 잇는다.
// 서버 규칙(비밀번호·10초 5개·120자)을 흉내만 낸다. 진짜 권한 확인은 Supabase 쪽이다
import { CHAT_MAX_LENGTH } from './throttle';
import {
  type ChatMessage,
  type MapHandlers,
  OnlineError,
  type OnlineTransport,
  type PeerMove,
  type PeerState,
  type RoomHandlers,
} from './transport';

export type BusMessage =
  | { kind: 'map-hello'; topic: string; from: string }
  | { kind: 'map-track'; topic: string; from: string; state: PeerState }
  | { kind: 'map-move'; topic: string; from: string; move: PeerMove }
  | { kind: 'map-leave'; topic: string; from: string }
  | { kind: 'room-here'; from: string; reply: boolean }
  | { kind: 'room-leave'; from: string }
  | { kind: 'chat'; message: ChatMessage };

/** 내가 보낸 것은 나에게 오지 않는다 */
export interface Bus {
  post(message: BusMessage): void;
  listen(handler: (message: BusMessage) => void): void;
}

/** 같은 프로세스 안의 버스. 실제 네트워크처럼 다음 틱에 전한다 */
export function createMemoryBus(): { connect(): Bus } {
  const handlers = new Set<{ handler: (message: BusMessage) => void }>();
  return {
    connect() {
      const self = { handler: (_: BusMessage) => {} };
      handlers.add(self);
      return {
        post(message) {
          const copy = JSON.parse(JSON.stringify(message)) as BusMessage;
          queueMicrotask(() => handlers.forEach((each) => each !== self && each.handler(copy)));
        },
        listen(handler) {
          self.handler = handler;
        },
      };
    },
  };
}

/** 개발 서버용. 시험 도구가 window.__onlineBus 를 넣어 두면 그것을, 아니면 같은 브라우저 탭끼리 BroadcastChannel 로 잇는다 */
export function browserBus(): Bus {
  const injected = (window as { __onlineBus?: Bus }).__onlineBus;
  if (injected) return injected;
  const channel = new BroadcastChannel('maple-companion-online-fake');
  return {
    post: (message) => channel.postMessage(message),
    listen: (handler) => channel.addEventListener('message', (event: MessageEvent<BusMessage>) => handler(event.data)),
  };
}

export interface FakeOptions {
  password: string;
  userId?: string;
  member?: boolean;
  /** 서버 rate limit 흉내. 10초에 이만큼 */
  rateLimit?: number;
}

export function createBusTransport(bus: Bus, options: FakeOptions): OnlineTransport {
  const userId = options.userId ?? `fake-${Math.random().toString(36).slice(2, 10)}`;
  let member = options.member ?? false;
  const maps = new Map<string, { handlers: MapHandlers; peers: Map<string, PeerState>; state: PeerState | null }>();
  let room: { handlers: RoomHandlers; here: Set<string> } | null = null;
  const history: ChatMessage[] = [];
  const sentAt: number[] = [];
  let nextId = 0;

  bus.listen((message) => {
    if (message.kind === 'chat') {
      history.push(message.message);
      room?.handlers.onMessage(message.message);
      return;
    }
    if (message.kind === 'room-here' || message.kind === 'room-leave') {
      if (!room) return;
      if (message.kind === 'room-here') {
        room.here.add(message.from);
        if (!message.reply) bus.post({ kind: 'room-here', from: userId, reply: true });
      } else room.here.delete(message.from);
      room.handlers.onCount(room.here.size + 1);
      return;
    }
    const map = maps.get(message.topic);
    if (!map) return;
    if (message.kind === 'map-hello') {
      if (map.state) bus.post({ kind: 'map-track', topic: message.topic, from: userId, state: map.state });
    } else if (message.kind === 'map-track') {
      map.peers.set(message.from, message.state);
      map.handlers.onPeers(new Map(map.peers));
    } else if (message.kind === 'map-move') {
      const peer = map.peers.get(message.from);
      if (peer) Object.assign(peer, message.move);
      map.handlers.onMove(message.from, message.move);
    } else if (map.peers.delete(message.from)) {
      map.handlers.onPeers(new Map(map.peers));
    }
  });

  const requireMember = () => {
    if (!member) throw new OnlineError('denied');
  };

  return {
    async signIn() {
      return userId;
    },
    async isMember() {
      return member;
    },
    async join(password) {
      if (password !== options.password) return 'wrong';
      member = true;
      return 'ok';
    },
    openRoom(handlers) {
      requireMember();
      room = { handlers, here: new Set() };
      queueMicrotask(() => {
        handlers.onStatus('online');
        handlers.onCount(1);
        bus.post({ kind: 'room-here', from: userId, reply: false });
      });
      return {
        leave() {
          room = null;
          bus.post({ kind: 'room-leave', from: userId });
        },
      };
    },
    joinMap(topic, handlers) {
      requireMember();
      const map = { handlers, peers: new Map<string, PeerState>(), state: null as PeerState | null };
      maps.set(topic, map);
      bus.post({ kind: 'map-hello', topic, from: userId });
      return {
        track(state) {
          map.state = state;
          bus.post({ kind: 'map-track', topic, from: userId, state });
        },
        move(move) {
          if (map.state) Object.assign(map.state, move);
          bus.post({ kind: 'map-move', topic, from: userId, move });
        },
        leave() {
          if (maps.get(topic) === map) maps.delete(topic);
          bus.post({ kind: 'map-leave', topic, from: userId });
        },
      };
    },
    async sendChat({ name, era, mapId, text }) {
      requireMember();
      const now = Date.now();
      while (sentAt.length > 0 && now - sentAt[0] >= 10_000) sentAt.shift();
      if (sentAt.length >= (options.rateLimit ?? 5)) throw new OnlineError('rate');
      const trimmed = text.trim();
      if (!trimmed || Array.from(trimmed).length > CHAT_MAX_LENGTH) throw new OnlineError('failed');
      sentAt.push(now);
      nextId += 1;
      const message: ChatMessage = {
        id: `${userId}-${nextId}`,
        userId,
        name,
        era,
        mapId,
        text: trimmed,
        createdAt: new Date(now).toISOString(),
      };
      history.push(message);
      // 서버처럼 보낸 사람에게도 방 채널로 다시 온다
      queueMicrotask(() => room?.handlers.onMessage(message));
      bus.post({ kind: 'chat', message });
      return message;
    },
    async recentChat() {
      requireMember();
      const since = Date.now() - 24 * 60 * 60 * 1000;
      return history.filter((message) => Date.parse(message.createdAt) > since);
    },
  };
}
