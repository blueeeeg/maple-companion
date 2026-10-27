import { DEFAULT_PACE, type HuntPace, type HuntProgress, settleHunt } from './bosses';
import { encountersDue, killXp, mesoDrop } from './encounters';
import type { Town } from './towns';

/**
 * 직접 조작으로 잡은 몬스터의 보상 규칙.
 * huntClock: 자동 사냥과 같은 사냥 시계에서 한 마리 몫씩 꺼낸다. 직접 잡아도 시간당 EXP·메소가 자동과 같다.
 *   시계가 비었으면 잡히기는 하고 몬스터 기록에도 남지만 EXP·메소·보스 몫은 없다
 * perKill: 잡을 때마다 보통 한 마리 보상을 따로 준다. 사냥 시계는 건드리지 않아 직접 놀수록 더 받는다
 */
export type ManualRewardPolicy = 'huntClock' | 'perKill';
export const MANUAL_REWARD_POLICY: ManualRewardPolicy = 'huntClock';

/** 보상을 받을 수 있는 남은 마리 수. 몬스터를 꺼 뒀으면(pace 가 null) 사냥 시계가 안 쌓여 0 이다 */
export function manualRewardBudget(progress: HuntProgress, pace: HuntPace | null, policy = MANUAL_REWARD_POLICY): number {
  if (policy === 'perKill') return Infinity;
  return pace ? encountersDue(progress, pace.encounterSeconds) : 0;
}

/** 한 마리 보상. 보상이 없으면 null */
export function settleManualKill(
  progress: HuntProgress,
  pace: HuntPace | null,
  town: Town,
  policy = MANUAL_REWARD_POLICY,
  random = Math.random,
): { xp: number; meso: number } | null {
  if (policy === 'perKill') {
    const seconds = (pace ?? DEFAULT_PACE).encounterSeconds;
    return { xp: killXp(seconds), meso: mesoDrop(town, random, seconds) };
  }
  if (!pace || manualRewardBudget(progress, pace, policy) < 1) return null;
  return settleHunt(progress, pace, town, false, random);
}
