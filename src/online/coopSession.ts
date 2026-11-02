// 같이 도전 흐름: 초대 → 대기 → 같이 싸우기(방장이 HP 를 정한다) → 방장 넘기기·혼자 이어 싸우기
import { bossHits } from '../game/bosses';
import type { Era } from '../maple/api';
import type { CoopBossLink, Scene } from '../scene/scene';
import {
  type BossHp,
  type Invite,
  INVITE_MS,
  START_GRACE_MS,
  bossTopic,
  canSeeInvite,
  cleanBossEvent,
  cleanRoomEvent,
  coopBossName,
  coopHp,
  createBossHp,
  createHitBatch,
  createHpTicker,
  inviteFrom,
  pickHost,
} from './coop';
import type { BossLink, EventLink, OnlineTransport } from './transport';

export interface CoopHost {
  /** 지금 캐릭터. 고른 캐릭터가 없으면 null */
  me(): { name: string; era: Era; level: number } | null;
  /** 보스 차례·직접 조작·싸우는 중 등으로 보상 받는 싸움을 못 하면 그 까닭 */
  check(bossId: number): string | null;
  /** 보스전을 시작한다. 마을로 돌아오면 끝난다. link 가 null 이면 혼자 싸운다. 시작하지 못하면 그 까닭 */
  fight(bossId: number, maxHp: number, link: CoopBossLink | null): Promise<void> | string;
  /** 같이 도전을 기다리는 동안 자동 사냥·이동·보스 차례를 쉬게 한다. null 이면 다시 돈다 */
  setWaiting(reason: string | null): void;
  notify(text: string): void;
  scene: Pick<Scene, 'setBossHp' | 'showBossDamage' | 'endCoop'>;
}

export type CoopViewState =
  | { kind: 'invite'; id: string; name: string; bossName: string; seconds: number }
  | { kind: 'host'; bossName: string; seconds: number; count: number }
  | { kind: 'guest'; bossName: string; hostName: string }
  | { kind: 'fight'; bossName: string; count: number }
  | null;

export interface Coop {
  /** 방에 들어오면 user id, 끊기면 null */
  setUser(userId: string | null): void;
  /** 보스 도전 창 「같이 도전」. 못 하면 그 까닭 */
  invite(bossId: number): string | null;
  join(inviteId: string): void;
  /** 방장의 「바로 시작」 */
  startNow(): void;
  /** 기다리다 그만두기 */
  cancel(): void;
  /** 시간이 걸린 일(대기 끝·HP 알림·때린 몫 보내기). 0.1초마다 부른다 */
  tick(): void;
  readonly view: CoopViewState;
}

interface Lobby {
  kind: 'lobby';
  role: 'host' | 'guest';
  invite: Invite;
  link: BossLink;
  peers: Set<string>;
  until: number;
  sawHost: boolean;
}

interface Fight {
  kind: 'fight';
  invite: Invite;
  link: BossLink;
  peers: Set<string>;
  host: string;
  hp: number;
  max: number;
  /** 내가 방장일 때만 있다 */
  authority: BossHp | null;
  batch: ReturnType<typeof createHitBatch>;
  ticker: ReturnType<typeof createHpTicker>;
  /** 혼자 이어 싸운다. 채널을 떠났다 */
  solo: boolean;
}

type Phase = { kind: 'idle' } | Lobby | Fight;

const WAIT_HOST = '같이 도전할 사람을 기다리는 중이에요';
const WAIT_GUEST = '같이 도전 시작을 기다리는 중이에요';

export function createCoop(
  transport: OnlineTransport,
  host: CoopHost,
  onView: (state: CoopViewState) => void,
  now: () => number = () => Date.now(),
  hits: () => number = bossHits,
): Coop {
  let userId: string | null = null;
  let events: EventLink | null = null;
  const invites = new Map<string, Invite>();
  let phase: Phase = { kind: 'idle' };
  let drawn = '';
  let view: CoopViewState = null;

  function render(): void {
    view = viewOf();
    const key = JSON.stringify(view);
    if (key === drawn) return;
    drawn = key;
    onView(view);
  }

  function viewOf(): CoopViewState {
    const at = now();
    const seconds = (until: number) => Math.max(0, Math.ceil((until - at) / 1000));
    if (phase.kind === 'lobby') {
      const bossName = coopBossName(phase.invite.era, phase.invite.bossId);
      return phase.role === 'host'
        ? { kind: 'host', bossName, seconds: seconds(phase.until), count: phase.peers.size }
        : { kind: 'guest', bossName, hostName: phase.invite.name };
    }
    if (phase.kind === 'fight') {
      return phase.solo ? null : { kind: 'fight', bossName: coopBossName(phase.invite.era, phase.invite.bossId), count: phase.peers.size };
    }
    const viewer = viewerOf();
    const shown = [...invites.values()].filter((invite) => canSeeInvite(invite, viewer, at)).pop();
    if (!shown) return null;
    return { kind: 'invite', id: shown.id, name: shown.name, bossName: coopBossName(shown.era, shown.bossId), seconds: seconds(shown.expiresAt) };
  }

  function viewerOf() {
    const me = host.me();
    return userId && me ? { userId, era: me.era, level: me.level } : null;
  }

  function toIdle(): void {
    phase = { kind: 'idle' };
    host.setWaiting(null);
    render();
  }

  function onRoomEvent(raw: unknown): void {
    const event = cleanRoomEvent(raw);
    if (!event || event.host === userId) return;
    if (event.t === 'close') {
      if (invites.get(event.id)?.host === event.host) invites.delete(event.id);
    } else {
      invites.set(event.id, inviteFrom(event, now()));
    }
    render();
  }

  function openBoss(invite: Invite): BossLink {
    let link: BossLink | null = null;
    const mine = () => (phase.kind === 'lobby' || phase.kind === 'fight') && phase.link === link;
    link = transport.joinBoss(bossTopic(invite.id), {
      onStatus(status) {
        if (!mine() || status !== 'offline') return;
        if (phase.kind === 'fight') goSolo('연결이 끊겨 혼자 이어서 싸워요');
        else leaveLobby('연결이 끊겨 같이 도전을 그만뒀어요');
      },
      onPeers(ids) {
        if (!mine() || !userId) return;
        const current = phase as Lobby | Fight;
        current.peers = new Set([...ids, userId]);
        if (current.kind === 'lobby') {
          if (current.role === 'guest') {
            if (ids.includes(current.invite.host)) current.sawHost = true;
            else if (current.sawHost) return leaveLobby(`${current.invite.name}님이 나가 같이 도전을 그만뒀어요`);
          }
          render();
          return;
        }
        migrate(current);
        render();
      },
      onEvent(raw) {
        if (mine()) onBossEvent(raw);
      },
    });
    return link;
  }

  function onBossEvent(raw: unknown): void {
    const event = cleanBossEvent(raw);
    if (!event || event.from === userId) return;
    if (phase.kind === 'lobby') {
      const lobby = phase;
      if (lobby.role !== 'guest' || event.from !== lobby.invite.host) return;
      if (event.t === 'cancel') leaveLobby(`${lobby.invite.name}님이 같이 도전을 그만뒀어요`);
      else if (event.t === 'start' && event.bossId === lobby.invite.bossId && event.era === lobby.invite.era) {
        begin(lobby, event.from, event.max, event.hp);
      }
      return;
    }
    if (phase.kind !== 'fight' || phase.solo) return;
    const fight = phase;
    if (event.t === 'hit') {
      if (!fight.peers.has(event.from)) return;
      host.scene.showBossDamage(event.d, event.c);
      if (fight.authority) {
        fight.authority.apply(event.from, event.n, now());
        setHp(fight, fight.authority.hp);
      }
    } else if ((event.t === 'hp' || event.t === 'kill') && event.from === fight.host && !fight.authority) {
      // 늦게 온 알림이 HP 를 되돌리지 않게 줄어드는 쪽만 받는다
      setHp(fight, event.t === 'kill' ? 0 : Math.min(fight.hp, event.hp));
    }
  }

  function setHp(fight: Fight, hp: number): void {
    fight.hp = hp;
    host.scene.setBossHp(hp, fight.max);
  }

  function leaveLobby(reason: string | null): void {
    if (phase.kind !== 'lobby') return;
    phase.link.leave();
    if (reason) host.notify(reason);
    toIdle();
  }

  /** 방장이 나갔으면 다음 방장을 정한다. 남은 사람이 없으면 혼자 싸움으로 바뀐다 */
  function migrate(fight: Fight): void {
    if (fight.solo || fight.hp <= 0 || !userId) return;
    if (fight.peers.size <= 1) return goSolo('다른 사람이 모두 나가 혼자 이어서 싸워요');
    const next = pickHost(fight.peers, fight.host);
    if (next === fight.host) return;
    fight.host = next;
    if (next !== userId) return;
    fight.authority = createBossHp(fight.max, fight.hp);
    fight.ticker.reset();
    host.notify('방장이 나가 내가 보스 HP 를 이어 맡아요');
  }

  function goSolo(reason: string): void {
    if (phase.kind !== 'fight' || phase.solo) return;
    phase.solo = true;
    phase.link.leave();
    host.scene.endCoop();
    if (phase.hp > 0) host.notify(reason);
    render();
  }

  function begin(lobby: Lobby, hostId: string, max: number, hp: number): void {
    if (!userId) return;
    host.setWaiting(null);
    const fight: Fight = {
      kind: 'fight',
      invite: lobby.invite,
      link: lobby.link,
      peers: lobby.peers,
      host: hostId,
      hp,
      max,
      authority: hostId === userId ? createBossHp(max, hp) : null,
      batch: createHitBatch(),
      ticker: createHpTicker(),
      solo: false,
    };
    phase = fight;
    const slot = Math.max(0, [...fight.peers].sort().indexOf(userId));
    const link: CoopBossLink = {
      slot,
      onHit(points, damages, critical) {
        if (phase !== fight || fight.solo) return;
        fight.batch.add(fight.authority ? 0 : points, damages, critical);
        if (fight.authority) {
          fight.authority.apply(userId!, points, now());
          setHp(fight, fight.authority.hp);
          flush(fight);
        }
      },
      ready: () => host.scene.setBossHp(fight.hp, fight.max),
    };
    const started = host.fight(lobby.invite.bossId, max, link);
    if (typeof started === 'string') {
      host.notify(`같이 도전에 못 들어갔어요 · ${started}`);
      fight.link.leave();
      toIdle();
      return;
    }
    render();
    const done = () => {
      if (phase !== fight) return;
      if (!fight.solo) fight.link.leave();
      toIdle();
    };
    started.then(done, done);
  }

  /** 방장은 HP 를, 모두 때린 몫(대미지 숫자)을 보낸다 */
  function flush(fight: Fight): void {
    if (fight.solo || !userId) return;
    const at = now();
    const batch = fight.batch.take(at);
    if (batch) fight.link.send({ t: 'hit', from: userId, ...batch });
    if (fight.authority && fight.ticker.due(fight.authority.hp, at)) {
      fight.ticker.mark(fight.authority.hp, at);
      fight.link.send({ t: 'hp', from: userId, hp: fight.authority.hp, max: fight.max });
      if (fight.authority.hp === 0) fight.link.send({ t: 'kill', from: userId });
    }
  }

  function start(lobby: Lobby): void {
    if (!userId || lobby.role !== 'host') return;
    events?.send({ t: 'close', id: lobby.invite.id, host: userId });
    const others = [...lobby.peers].filter((id) => id !== userId);
    if (others.length === 0) {
      lobby.link.leave();
      toIdle();
      const started = host.fight(lobby.invite.bossId, hits(), null);
      host.notify(typeof started === 'string' ? started : '아무도 안 들어와 혼자 도전해요');
      return;
    }
    const max = coopHp(hits(), lobby.peers.size);
    lobby.link.send({ t: 'start', from: userId, bossId: lobby.invite.bossId, era: lobby.invite.era, max, hp: max });
    begin(lobby, userId, max, max);
  }

  return {
    setUser(next) {
      if (next === userId && (next === null || events)) return;
      events?.leave();
      events = null;
      userId = next;
      if (!next) {
        invites.clear();
        if (phase.kind === 'lobby') leaveLobby('연결이 끊겨 같이 도전을 그만뒀어요');
        else if (phase.kind === 'fight') goSolo('연결이 끊겨 혼자 이어서 싸워요');
        render();
        return;
      }
      events = transport.openEvents(onRoomEvent);
    },
    invite(bossId) {
      const me = host.me();
      if (!userId || !events || !me) return '연결 안 됨';
      if (phase.kind !== 'idle') return '이미 같이 도전 중이에요';
      const problem = host.check(bossId);
      if (problem) return problem;
      const invite: Invite = { id: crypto.randomUUID(), host: userId, name: me.name, era: me.era, bossId, expiresAt: now() + INVITE_MS };
      const lobby: Lobby = {
        kind: 'lobby',
        role: 'host',
        invite,
        link: null as unknown as BossLink,
        peers: new Set([userId]),
        until: invite.expiresAt,
        sawHost: true,
      };
      phase = lobby;
      lobby.link = openBoss(invite);
      events.send({ t: 'invite', id: invite.id, host: userId, name: me.name, era: me.era, bossId, ttl: INVITE_MS });
      host.setWaiting(WAIT_HOST);
      render();
      return null;
    },
    join(inviteId) {
      const invite = invites.get(inviteId);
      if (!userId || !invite || !canSeeInvite(invite, viewerOf(), now())) {
        host.notify('끝난 초대예요');
        invites.delete(inviteId);
        render();
        return;
      }
      if (phase.kind !== 'idle') return host.notify('이미 같이 도전 중이에요');
      const problem = host.check(invite.bossId);
      if (problem) return host.notify(problem);
      invites.delete(inviteId);
      const lobby: Lobby = {
        kind: 'lobby',
        role: 'guest',
        invite,
        link: null as unknown as BossLink,
        peers: new Set([userId]),
        until: invite.expiresAt + START_GRACE_MS,
        sawHost: false,
      };
      phase = lobby;
      lobby.link = openBoss(invite);
      host.setWaiting(WAIT_GUEST);
      render();
    },
    startNow() {
      if (phase.kind === 'lobby') start(phase);
    },
    cancel() {
      if (phase.kind !== 'lobby') return;
      if (phase.role === 'host' && userId) {
        phase.link.send({ t: 'cancel', from: userId });
        events?.send({ t: 'close', id: phase.invite.id, host: userId });
      }
      leaveLobby(null);
    },
    tick() {
      const at = now();
      invites.forEach((invite, id) => {
        if (at >= invite.expiresAt) invites.delete(id);
      });
      if (phase.kind === 'lobby' && at >= phase.until) {
        if (phase.role === 'host') start(phase);
        else leaveLobby('같이 도전이 시작되지 않았어요');
      } else if (phase.kind === 'fight') flush(phase);
      render();
    },
    get view() {
      return view;
    },
  };
}
