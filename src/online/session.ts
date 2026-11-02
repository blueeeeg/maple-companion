import type { Era } from '../maple/api';
import type { ActorLook, ActorPose, Scene } from '../scene/scene';
import { createPublisher, type Publisher } from './presence';
import { chatText, CHAT_MAX_LENGTH, createThrottle } from './throttle';
import {
  type ChatMessage,
  type JoinResult,
  type MapLink,
  OnlineError,
  type OnlineTransport,
  type PeerState,
  type RoomLink,
} from './transport';

/** 화면에 보이는 연결 상태. locked 는 방 비밀번호를 아직 안 넣었다 */
export type OnlineStatus = 'connecting' | 'online' | 'offline' | 'locked';

export interface SelfLook {
  name: string;
  era: Era;
  look: number[];
  standAction: string;
  walkAction: string;
  mount: number | null;
  chair: number | null;
}

export interface OnlineHost {
  /** 창이 보이고 맵 화면이다. 아니면 위치를 보내지 않는다 */
  isActive(): boolean;
  /** 지금 캐릭터. 고른 캐릭터가 없으면 null */
  self(): SelfLook | null;
  scene: Pick<Scene, 'heroPose' | 'addRemoteActor' | 'updateRemoteActor' | 'removeRemoteActor' | 'showBalloon'>;
}

export interface OnlineView {
  status(status: OnlineStatus, count: number): void;
  message(message: ChatMessage, mine: boolean): void;
  /** 방 비밀번호를 묻는다. 「나중에」면 null. failed 는 앞 시도가 틀렸는지 */
  askPassword(failed: JoinResult | null): Promise<string | null>;
}

export const mapTopic = (era: Era, mapId: number) => `map:${era}:${mapId}`;
/** 못 붙었으면 이만큼 쉬었다 다시 붙는다 */
export const RETRY_MS = 30_000;
const MEMBER_KEY = 'maple-companion:online-member';

const lookOf = (state: PeerState): ActorLook => ({
  name: state.name,
  look: state.look,
  era: state.era,
  standAction: state.standAction,
  walkAction: state.walkAction,
});
const poseOf = (state: Pick<PeerState, 'mapId' | 'x' | 'y' | 'facing' | 'action'>): ActorPose => ({
  mapId: state.mapId,
  x: state.x,
  y: state.y,
  facing: state.facing,
  action: state.action,
});

const ACTIONS = new Set(['stand', 'walk', 'attack', 'jump', 'ladder', 'rope', 'prone', 'sit']);
/** 캐릭터 그림 주소에 들어가는 동작 이름 */
const ACTION_NAME = /^[a-z0-9]{1,20}$/i;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** 다른 사람이 보낸 위치. 모양이 틀리면 null 이라 버린다 */
export function cleanMove(raw: unknown): Pick<PeerState, 'x' | 'y' | 'facing' | 'action'> | null {
  const move = raw as Partial<PeerState> | null;
  if (!move || !finite(move.x) || !finite(move.y) || (move.facing !== 1 && move.facing !== -1)) return null;
  if (typeof move.action !== 'string' || !ACTIONS.has(move.action)) return null;
  return { x: move.x, y: move.y, facing: move.facing, action: move.action };
}

/** 다른 사람이 알린 캐릭터. 이름·그림 주소에 들어가는 값만 받는다 */
export function cleanPeer(raw: unknown): PeerState | null {
  const state = raw as Partial<PeerState> | null;
  const move = cleanMove(state);
  if (!state || !move || typeof state.name !== 'string' || !state.name.trim() || Array.from(state.name).length > 12) return null;
  if (state.era !== 'current' && state.era !== 'classic') return null;
  if (!Array.isArray(state.look) || state.look.length > 40 || !state.look.every((id) => Number.isInteger(id) && id > 0)) return null;
  if (typeof state.standAction !== 'string' || !ACTION_NAME.test(state.standAction)) return null;
  if (typeof state.walkAction !== 'string' || !ACTION_NAME.test(state.walkAction)) return null;
  if (!Number.isInteger(state.mapId)) return null;
  const optionalId = (value: unknown) => (Number.isInteger(value) ? (value as number) : null);
  return {
    name: state.name.trim(),
    era: state.era,
    look: state.look,
    standAction: state.standAction,
    walkAction: state.walkAction,
    mount: optionalId(state.mount),
    chair: optionalId(state.chair),
    mapId: state.mapId!,
    ...move,
  };
}

function readMember(): string | null {
  try {
    return localStorage.getItem(MEMBER_KEY);
  } catch {
    return null;
  }
}

function writeMember(userId: string | null): void {
  try {
    if (userId) localStorage.setItem(MEMBER_KEY, userId);
    else localStorage.removeItem(MEMBER_KEY);
  } catch {
    // 저장소가 막혀 있으면 다음 실행에 서버에 다시 묻는다
  }
}

export interface OnlineSession {
  /** 익명 로그인 → 멤버 확인 → 방 채널. 처음 열 때 멤버가 아니면 비밀번호를 묻는다 */
  connect(): Promise<void>;
  /** 비밀번호를 다시 묻는다(「나중에」로 닫은 뒤 HUD 표시를 눌렀을 때) */
  unlock(): Promise<void>;
  /** 맵 채널을 맞추고 내 자리를 알린다. 1초에 5번 부른다 */
  tick(): void;
  /** 보낸 글을 돌려받지 못했으면 화면에 띄울 까닭 */
  send(raw: string): Promise<string | null>;
  /** 아직 안 띄운 지난 24시간 글 */
  recent(): Promise<{ message: ChatMessage; mine: boolean }[]>;
  readonly status: OnlineStatus;
}

export function createOnlineSession(
  transport: OnlineTransport,
  host: OnlineHost,
  view: OnlineView,
  now: () => number = () => performance.now(),
): OnlineSession {
  let status: OnlineStatus = 'connecting';
  let count = 0;
  let userId: string | null = null;
  let room: RoomLink | null = null;
  let map: { topic: string; link: MapLink; publisher: Publisher; peers: Map<string, PeerState> } | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const throttle = createThrottle();
  /** 내가 보낸 글은 보내자마자 띄우고 방 채널로 다시 오는 것은 버린다. 지난 글을 받을 때도 겹치지 않게 한다 */
  const seen = new Set<string>();

  function setStatus(next: OnlineStatus): void {
    status = next;
    if (next !== 'online') count = 0;
    view.status(status, count);
  }

  function retryLater(): void {
    if (retryTimer !== null) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, RETRY_MS);
  }

  function leaveMap(): void {
    if (!map) return;
    map.link.leave();
    map.peers.forEach((_, id) => host.scene.removeRemoteActor(id));
    map = null;
  }

  function closeRoom(): void {
    leaveMap();
    room?.leave();
    room = null;
  }

  function openRoom(): void {
    closeRoom();
    room = transport.openRoom({
      onStatus(link) {
        if (link === 'online') setStatus('online');
        else if (link === 'connecting') setStatus('connecting');
        else {
          // 채널이 끊기면 다음에 붙을 때 멤버인지 서버에 다시 묻는다(비밀번호가 바뀌어 내보내졌을 수 있다)
          writeMember(null);
          closeRoom();
          setStatus('offline');
          retryLater();
        }
      },
      onCount(next) {
        count = next;
        if (status === 'online') view.status(status, count);
      },
      onMessage: (message) => receive(message, true),
    });
  }

  async function connect(): Promise<void> {
    setStatus('connecting');
    try {
      userId = await transport.signIn();
      // 이 기기가 이미 들어온 계정이면 서버에 묻지 않고 바로 붙는다
      const member = readMember() === userId || (await transport.isMember());
      if (member) {
        writeMember(userId);
        openRoom();
        return;
      }
      setStatus('locked');
      await unlock();
    } catch (error) {
      console.warn('[online] 연결하지 못했다', error);
      setStatus('offline');
      retryLater();
    }
  }

  async function unlock(): Promise<void> {
    let failed: JoinResult | null = null;
    for (;;) {
      const password = await view.askPassword(failed);
      if (password === null) {
        setStatus('locked');
        return;
      }
      try {
        failed = await transport.join(password);
      } catch (error) {
        failed = error instanceof OnlineError && error.code === 'limited' ? 'limited' : null;
        if (!failed) {
          console.warn('[online] 입장하지 못했다', error);
          setStatus('offline');
          retryLater();
          return;
        }
      }
      if (failed === 'ok') {
        writeMember(userId);
        openRoom();
        return;
      }
    }
  }

  function syncPeers(peers: Map<string, PeerState>): void {
    if (!map) return;
    const before = map.peers;
    const next = new Map<string, PeerState>();
    peers.forEach((raw, id) => {
      const state = cleanPeer(raw);
      if (id === userId || !state) return;
      next.set(id, state);
      const old = before.get(id);
      if (!old) host.scene.addRemoteActor(id, lookOf(state), poseOf(state));
      else host.scene.updateRemoteActor(id, { look: lookOf(state), pose: poseOf(state) });
    });
    before.forEach((_, id) => {
      if (!next.has(id)) host.scene.removeRemoteActor(id);
    });
    map.peers = next;
  }

  function joinMap(topic: string): void {
    leaveMap();
    let current: typeof map = null;
    const link = transport.joinMap(topic, {
      onPeers(peers) {
        if (current && map === current) syncPeers(peers);
      },
      onMove(id, raw) {
        const peer = current?.peers.get(id);
        const move = cleanMove(raw);
        if (!peer || !move || map !== current) return;
        Object.assign(peer, move);
        host.scene.updateRemoteActor(id, { pose: poseOf(peer) });
      },
    });
    current = { topic, link, publisher: createPublisher(link), peers: new Map() };
    map = current;
  }

  function tick(): void {
    if (status !== 'online' || !host.isActive()) return;
    const self = host.self();
    const pose = host.scene.heroPose();
    if (!self || !pose) return;
    const topic = mapTopic(self.era, pose.mapId);
    if (map?.topic !== topic) joinMap(topic);
    map!.publisher.update({ ...self, ...pose }, now());
  }

  function receive(message: ChatMessage, live: boolean): void {
    if (seen.has(message.id)) return;
    seen.add(message.id);
    const mine = message.userId === userId;
    view.message(message, mine);
    if (!live) return;
    // 같은 맵에 서 있는 사람(나 포함)이 한 말만 말풍선으로 띄운다
    const pose = host.scene.heroPose();
    if (mine) {
      if (pose?.mapId === message.mapId) host.scene.showBalloon(null, message.text);
      return;
    }
    const peer = map?.peers.get(message.userId);
    if (peer && peer.mapId === message.mapId && peer.era === message.era) host.scene.showBalloon(message.userId, message.text);
  }

  async function send(raw: string): Promise<string | null> {
    const text = chatText(raw);
    if (!text) return raw.trim() ? `${CHAT_MAX_LENGTH}자까지 쓸 수 있어요` : null;
    if (status !== 'online') return '연결 안 됨';
    const self = host.self();
    if (!self) return '캐릭터를 고른 뒤에 쓸 수 있어요';
    const wait = throttle.wait(now());
    if (wait > 0) return `조금 천천히 · ${Math.ceil(wait / 1000)}초 뒤에 보낼 수 있어요`;
    throttle.record(now());
    try {
      const message = await transport.sendChat({ name: self.name, era: self.era, mapId: host.scene.heroPose()?.mapId ?? 0, text });
      receive(message, true);
      return null;
    } catch (error) {
      if (error instanceof OnlineError && error.code === 'rate') return '너무 빨라요. 10초에 5개까지 보낼 수 있어요';
      console.warn('[online] 채팅을 보내지 못했다', error);
      return '보내지 못했어요';
    }
  }

  async function recent(): Promise<{ message: ChatMessage; mine: boolean }[]> {
    if (status !== 'online') throw new OnlineError('failed', '연결 안 됨');
    const messages = await transport.recentChat();
    return messages
      .filter((message) => {
        if (seen.has(message.id)) return false;
        seen.add(message.id);
        return true;
      })
      .map((message) => ({ message, mine: message.userId === userId }));
  }

  return {
    connect,
    unlock,
    tick,
    send,
    recent,
    get status() {
      return status;
    },
  };
}
