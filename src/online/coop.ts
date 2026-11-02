// 같이 도전(보스 협동)의 규칙. 화면·채널 없이 시험할 수 있게 값만 다룬다
import { type BossSpec, bossesOf } from '../game/bosses';
import type { Era } from '../maple/api';

/** 초대에 들어올 수 있는 시간 */
export const INVITE_MS = 30_000;
/** 들어간 사람은 초대가 끝난 뒤 시작 신호를 이만큼 더 기다린다 */
export const START_GRACE_MS = 10_000;
/** 방장이 HP 를 알리는 간격. 1초에 10번까지 */
export const HP_BROADCAST_MS = 100;
/** 때린 몫을 모아 보내는 간격 */
export const HIT_FLUSH_MS = 200;
/** 한 사람이 1초에 깎을 수 있는 HP. 자동 공격은 1초에 1, 보스를 누르면 한 번에 2 라 빠르게 눌러도 이 안이다 */
export const MAX_POINTS_PER_SECOND = 10;
/** 한 번에 띄우는 남의 대미지 숫자 */
export const MAX_DAMAGE_NUMBERS = 12;
const MAX_DAMAGE = 99_999_999;
/** 보스 HP. bossHits(최대 32) × 사람 수라 이 안이다 */
const MAX_BOSS_HP = 10_000;

const INVITE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Supabase 는 uuid, 가짜 연결은 fake-xxxx */
const USER_ID = /^[A-Za-z0-9-]{1,64}$/;

export const bossTopic = (inviteId: string) => `boss:${inviteId}`;

export interface Invite {
  id: string;
  host: string;
  /** 방장 캐릭터 이름 */
  name: string;
  era: Era;
  bossId: number;
  /** 받은 쪽 시계로 끝나는 때 */
  expiresAt: number;
}

/** room:events 로 오가는 것 */
export type RoomEvent =
  | { t: 'invite'; id: string; host: string; name: string; era: Era; bossId: number; ttl: number }
  | { t: 'close'; id: string; host: string };

/** boss:{id} 로 오가는 것. from 은 보낸 사람이 적는다 */
export type BossEvent =
  | { t: 'start'; from: string; bossId: number; era: Era; max: number; hp: number }
  | { t: 'hit'; from: string; n: number; d: number[]; c: boolean }
  | { t: 'hp'; from: string; hp: number; max: number }
  | { t: 'kill'; from: string }
  | { t: 'cancel'; from: string };

const isInt = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const isEra = (value: unknown): value is Era => value === 'current' || value === 'classic';
const isUser = (value: unknown): value is string => typeof value === 'string' && USER_ID.test(value);
const bossOf = (era: Era, bossId: number): BossSpec | undefined => bossesOf(era).find((boss) => boss.id === bossId);

/** 남이 보낸 방 알림. 모양이 틀리거나 그 시대에 없는 보스면 null */
export function cleanRoomEvent(raw: unknown): RoomEvent | null {
  const event = raw as Record<string, unknown> | null;
  if (!event || typeof event !== 'object' || typeof event.id !== 'string' || !INVITE_ID.test(event.id) || !isUser(event.host)) return null;
  if (event.t === 'close') return { t: 'close', id: event.id, host: event.host };
  if (event.t !== 'invite' || !isEra(event.era) || !isInt(event.bossId, 1, 99_999_999) || !isInt(event.ttl, 0, INVITE_MS)) return null;
  if (typeof event.name !== 'string' || !event.name.trim() || Array.from(event.name).length > 12) return null;
  if (!bossOf(event.era, event.bossId)) return null;
  return { t: 'invite', id: event.id, host: event.host, name: event.name.trim(), era: event.era, bossId: event.bossId, ttl: event.ttl };
}

/** 남이 보낸 보스 채널 알림. 숫자는 범위까지 본다 */
export function cleanBossEvent(raw: unknown): BossEvent | null {
  const event = raw as Record<string, unknown> | null;
  if (!event || typeof event !== 'object' || !isUser(event.from)) return null;
  const from = event.from;
  switch (event.t) {
    case 'start':
      if (!isEra(event.era) || !isInt(event.bossId, 1, 99_999_999) || !isInt(event.max, 1, MAX_BOSS_HP)) return null;
      if (!isInt(event.hp, 1, event.max)) return null;
      return { t: 'start', from, bossId: event.bossId, era: event.era, max: event.max, hp: event.hp };
    case 'hit': {
      if (!isInt(event.n, 0, MAX_BOSS_HP) || typeof event.c !== 'boolean' || !Array.isArray(event.d)) return null;
      if (event.d.length > MAX_DAMAGE_NUMBERS || !event.d.every((each) => isInt(each, 1, MAX_DAMAGE))) return null;
      return { t: 'hit', from, n: event.n, d: event.d as number[], c: event.c };
    }
    case 'hp':
      if (!isInt(event.max, 1, MAX_BOSS_HP) || !isInt(event.hp, 0, event.max)) return null;
      return { t: 'hp', from, hp: event.hp, max: event.max };
    case 'kill':
    case 'cancel':
      return { t: event.t, from };
    default:
      return null;
  }
}

export interface InviteViewer {
  userId: string;
  era: Era;
  level: number;
}

/** 받은 초대. 남는 시간은 보낸 쪽 시계를 믿지 않고 받은 때부터 센다 */
export function inviteFrom(event: Extract<RoomEvent, { t: 'invite' }>, now: number): Invite {
  return { id: event.id, host: event.host, name: event.name, era: event.era, bossId: event.bossId, expiresAt: now + Math.min(event.ttl, INVITE_MS) };
}

/** 이 초대를 띄울지. 내 초대가 아니고, 같은 시대이고, 보스 레벨이 되고, 아직 안 끝났어야 한다 */
export function canSeeInvite(invite: Invite, viewer: InviteViewer | null, now: number): boolean {
  if (!viewer || invite.host === viewer.userId || invite.era !== viewer.era || now >= invite.expiresAt) return false;
  const boss = bossOf(invite.era, invite.bossId);
  return boss !== undefined && viewer.level >= boss.minLevel;
}

/** 한 번에 받는 HP. 보스 HP 의 1/4 과 1초 몫 가운데 작은 것 */
export const hitCap = (maxHp: number) => Math.max(2, Math.min(MAX_POINTS_PER_SECOND, Math.ceil(maxHp / 4)));

export interface BossHp {
  readonly hp: number;
  readonly max: number;
  /** from 이 깎은 HP 를 적용한다. 한 번 몫과 1초 몫을 넘는 것은 버린다. 실제로 깎은 값 */
  apply(from: string, points: number, now: number): number;
}

/** 방장이 들고 있는 보스 HP. 사람마다 1초에 MAX_POINTS_PER_SECOND 씩 차는 통으로 막는다 */
export function createBossHp(max: number, hp: number): BossHp {
  const cap = hitCap(max);
  const buckets = new Map<string, { tokens: number; at: number }>();
  let left = Math.max(0, Math.min(max, hp));
  return {
    get hp() {
      return left;
    },
    max,
    apply(from, points, now) {
      const bucket = buckets.get(from) ?? { tokens: cap, at: now };
      bucket.tokens = Math.min(cap, bucket.tokens + (Math.max(0, now - bucket.at) / 1000) * MAX_POINTS_PER_SECOND);
      bucket.at = now;
      buckets.set(from, bucket);
      const wanted = Number.isFinite(points) ? Math.floor(points) : 0;
      const applied = Math.max(0, Math.min(wanted, cap, Math.floor(bucket.tokens), left));
      bucket.tokens -= applied;
      left -= applied;
      return applied;
    },
  };
}

/** HP 알림 간격을 지킨다. 0 이 되면 바로 알린다 */
export function createHpTicker(intervalMs = HP_BROADCAST_MS) {
  let sent: number | null = null;
  let sentAt = -Infinity;
  return {
    due(hp: number, now: number): boolean {
      if (hp === sent) return false;
      return hp === 0 || now - sentAt >= intervalMs;
    },
    mark(hp: number, now: number): void {
      sent = hp;
      sentAt = now;
    },
    /** 새 방장이 되면 지금 HP 를 바로 다시 알린다 */
    reset(): void {
      sent = null;
      sentAt = -Infinity;
    },
  };
}

/** 내가 때린 몫을 모아 둔다. 대미지 숫자는 보여 주기용이라 넘치면 앞의 것을 버린다 */
export function createHitBatch(intervalMs = HIT_FLUSH_MS) {
  let points = 0;
  let damages: number[] = [];
  let critical = false;
  let sentAt = -Infinity;
  return {
    add(n: number, d: number[], c: boolean): void {
      points += n;
      damages = [...damages, ...d].slice(-MAX_DAMAGE_NUMBERS);
      critical ||= c;
    },
    take(now: number): { n: number; d: number[]; c: boolean } | null {
      if (points === 0 && damages.length === 0) return null;
      if (now - sentAt < intervalMs) return null;
      const batch = { n: points, d: damages, c: critical };
      points = 0;
      damages = [];
      critical = false;
      sentAt = now;
      return batch;
    },
  };
}

/** 방장이 나가면 남은 사람 가운데 user id 가 가장 작은 사람이 맡는다. 모두가 같은 답을 낸다 */
export function pickHost(ids: Iterable<string>, current: string): string {
  const list = [...ids];
  if (list.includes(current)) return current;
  return list.sort()[0] ?? current;
}

/** 같이 싸우는 보스 HP. 한 사람 몫 HP 에 사람 수를 곱해 혼자 싸울 때와 비슷하게 걸린다 */
export const coopHp = (hits: number, people: number) => Math.min(MAX_BOSS_HP, hits * Math.max(1, people));

export const coopBossName = (era: Era, bossId: number) => bossOf(era, bossId)?.name ?? '보스';
