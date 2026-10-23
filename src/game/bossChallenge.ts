import { BOSSES, type BossSpec, type HuntPace, type HuntProgress, bossDue, settleHunt } from './bosses';
import type { Character } from './characters';
import type { Town } from './towns';

/** 저장에서 읽은 보스 지정. 지금 BOSSES 에 없는 보스면 지정 없음이다 */
export function normalizeReservedBoss(value: unknown): number | null {
  return typeof value === 'number' && BOSSES.some((boss) => boss.id === value) ? value : null;
}

/**
 * 보스 차례 상태. 보스 도전 창의 「지금 도전」 이 보스 차례를 쓰는 진짜 싸움인지 연습전인지 정한다.
 * off: 보스나 몬스터를 꺼 둬서 보스 차례가 오지 않는다
 */
export type BossTurn =
  | { kind: 'ready' }
  | { kind: 'waiting'; seconds: number }
  | { kind: 'off'; reason: 'bosses' | 'monsters' };

/**
 * 다음 보스가 나오기까지 남은 활동 시간(초). 보스 몫이 차기까지 남은 보통 사냥 수에 보스 한 번을 더해,
 * 그 차례가 지금 사냥 시계(활동 시간 − 사냥으로 바꾼 시간)로 언제 오는지 센다
 */
export function bossWaitSeconds(progress: HuntProgress, pace: HuntPace): number | null {
  if (pace.bossEvery === null) return null;
  const every = pace.encounterSeconds;
  const normalLeft = Math.max(0, Math.ceil((every * (pace.bossEvery - 1) - progress.bossChargeSeconds) / every));
  const banked = progress.activeSeconds - progress.huntSeconds;
  return Math.max(0, (normalLeft + 1) * every - banked);
}

export function bossTurn(progress: HuntProgress, pace: HuntPace | null): BossTurn {
  if (!pace) return { kind: 'off', reason: 'monsters' };
  const seconds = bossWaitSeconds(progress, pace);
  if (seconds === null) return { kind: 'off', reason: 'bosses' };
  return bossDue(progress, pace) ? { kind: 'ready' } : { kind: 'waiting', seconds };
}

/** 「약 23분」·「약 1시간 5분」. 남은 시간이 1분이 안 돼도 「약 1분」 이다 */
export function formatBossWait(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `약 ${rest}분`;
  return rest === 0 ? `약 ${hours}시간` : `약 ${hours}시간 ${rest}분`;
}

/**
 * 보스를 잡은 뒤 정산한다. 연습전은 경험치·메소·처치 기록이 없고 사냥 진행(보스 몫·사냥 시계)도 건드리지 않는다.
 * 진짜 싸움은 어느 보스든 보스 차례 한 번으로 똑같이 정산하고, 지정해 둔 그 보스였으면 지정을 지운다
 */
export function settleBossFight(
  character: Character,
  pace: HuntPace,
  town: Town,
  boss: BossSpec,
  practice: boolean,
  random = Math.random,
): { xp: number; meso: number } {
  if (practice) return { xp: 0, meso: 0 };
  const reward = settleHunt(character, pace, town, true, random);
  character.killXp += reward.xp;
  character.meso += reward.meso;
  character.monsterBook[boss.name] = (character.monsterBook[boss.name] ?? 0) + 1;
  if (character.reservedBossId === boss.id) character.reservedBossId = null;
  return reward;
}
