import type { Era } from '../maple/api';
import { BOSSES, type BossSpec, bossesOf } from './bosses';

/** 1~6차 */
export type AdvancementTierNumber = 1 | 2 | 3 | 4 | 5 | 6;
const TIERS: AdvancementTierNumber[] = [1, 2, 3, 4, 5, 6];

/**
 * 차수 → 전직한 시각(ms). null 은 기록을 시작하기 전에 이미 한 전직이라 날짜를 모른다.
 * 저장 파일에서는 키가 문자열("1")이 되지만 읽을 때는 숫자 키로 그대로 꺼낸다
 */
export type AdvancementLog = Partial<Record<AdvancementTierNumber, number | null>>;

/** 활동 초를 「123시간 45분」으로. 1분이 안 되면 「1분 미만」 */
export function formatTogetherTime(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  if (minutes === 0) return '1분 미만';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}분`;
  return `${hours.toLocaleString()}시간 ${rest}분`;
}

/** 「2026.10.22」 */
export function formatDay(ms: number): string {
  const date = new Date(ms);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}.${two(date.getMonth() + 1)}.${two(date.getDate())}`;
}

/** 「10-27」 */
export function formatMonthDay(ms: number): string {
  const date = new Date(ms);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** 지금까지 한 전직은 날짜를 모른다(null)로 채운다. 기록 칸이 없던 저장을 처음 읽을 때 쓴다 */
export function baselineAdvancements(reachedTier: number): AdvancementLog {
  return Object.fromEntries(TIERS.filter((tier) => tier <= reachedTier).map((tier) => [tier, null]));
}

/** 저장에서 읽은 전직 기록. 칸이 아예 없던 예전 저장이면 지금 차수까지를 「날짜 모름」으로 둔다 */
export function normalizeAdvancements(saved: unknown, reachedTier: number): AdvancementLog {
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return baselineAdvancements(reachedTier);
  const raw = saved as Record<string, unknown>;
  const log: AdvancementLog = {};
  TIERS.forEach((tier) => {
    const value = raw[tier];
    if (value === null) log[tier] = null;
    else if (typeof value === 'number' && Number.isFinite(value) && value > 0) log[tier] = value;
  });
  return log;
}

/** 지금 차수를 넘는 기록을 뺀다. 차수가 줄어든 저장(클래식 차수로 다시 센 1단계 클래식 캐릭터)에 쓴다 */
export function keepReachedAdvancements(log: AdvancementLog, reachedTier: number): AdvancementLog {
  return Object.fromEntries(TIERS.filter((tier) => tier <= reachedTier && tier in log).map((tier) => [tier, log[tier]]));
}

/**
 * 지금 차수까지 아직 안 적은 전직을 now 로 적는다. 적은 차수를 돌려준다.
 * 직업을 늦게 골라 한 번에 2차까지 오르면 둘 다 그 시각이다
 */
export function noteAdvancements(log: AdvancementLog, reachedTier: number, now: number): AdvancementTierNumber[] {
  const added = TIERS.filter((tier) => tier <= reachedTier && !(tier in log));
  added.forEach((tier) => (log[tier] = now));
  return added;
}

/** 두 저장을 합칠 때. 날짜가 있는 쪽을 쓰고, 둘 다 있으면 이른 쪽이 실제로 전직한 때다 */
export function mergeAdvancements(a: AdvancementLog, b: AdvancementLog): AdvancementLog {
  const log: AdvancementLog = {};
  TIERS.forEach((tier) => {
    if (!(tier in a) && !(tier in b)) return;
    const dates = [a[tier], b[tier]].filter((value): value is number => typeof value === 'number');
    log[tier] = dates.length > 0 ? Math.min(...dates) : null;
  });
  return log;
}

export interface BossRecord {
  total: number;
  /** 잡은 보스 중 가장 늦게 나오는(센) 보스 */
  strongest: BossSpec | null;
}

/**
 * 보스도 몬스터 기록(이름 → 잡은 수)에 같이 쌓여 왔다. 보스 이름은 마을 몬스터와 겹치지 않는다(records.test.ts).
 * 클래식 캐릭터는 1단계 때 지금 시대 보스와 싸웠어서 그 기록도 센다
 */
export function bossRecord(monsterBook: Record<string, number>, era: Era = 'current'): BossRecord {
  const own = bossesOf(era);
  const names = new Set(own.map((boss) => boss.name));
  const bosses = era === 'classic' ? [...own, ...BOSSES.filter((boss) => !names.has(boss.name))] : own;
  const defeated = bosses.filter((boss) => (monsterBook[boss.name] ?? 0) > 0);
  return {
    total: defeated.reduce((sum, boss) => sum + monsterBook[boss.name], 0),
    strongest: defeated.reduce<BossSpec | null>((best, boss) => (!best || boss.minLevel > best.minLevel ? boss : best), null),
  };
}
