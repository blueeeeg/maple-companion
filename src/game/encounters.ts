import type { MonsterSpec, Town } from './towns';

/**
 * 기본 몬스터 주기(활동 3분마다 한 마리). 보상은 이 주기일 때 값을 1배로 잡고, 설정에서 주기를 바꾸면
 * 한 마리 보상을 주기에 비례해 늘리고 줄인다. 그래서 주기를 바꿔도 시간당 EXP·메소는 같다
 */
export const ENCOUNTER_EVERY_ACTIVE_SECONDS = 180;
/** 기본 주기일 때 한 마리 경험치 */
export const KILL_XP = 60;

/** 사냥 seconds 초 몫의 보상이 기본 주기 한 마리 보상의 몇 배인지 */
export function rewardScale(seconds: number): number {
  return seconds / ENCOUNTER_EVERY_ACTIVE_SECONDS;
}

/** 사냥 seconds 초 몫의 경험치. 보통 몬스터 한 마리면 seconds 가 몬스터 주기다 */
export function killXp(seconds: number): number {
  return KILL_XP * rewardScale(seconds);
}

/**
 * 캐릭터의 사냥 진행. 몇 마리 잡았는지가 아니라 사냥으로 바꾼 활동 시간(초)으로 센다.
 * 마리 수로 세면 주기를 바꾸는 순간 「활동 시간 ÷ 새 주기」 가 확 늘거나 줄어 한꺼번에 몰리거나 한참 안 나온다
 */
export interface HuntClock {
  activeSeconds: number;
  /** 사냥으로 바꾼 활동 시간 */
  huntSeconds: number;
  /** 주기를 줄일 때 한 마리로 합쳐 둔 몫. 다음 사냥 보상에 보통 몬스터 비율로 얹는다 */
  huntBonusSeconds: number;
}

export function encountersDue(clock: HuntClock, encounterSeconds: number): number {
  return Math.max(0, Math.floor((clock.activeSeconds - clock.huntSeconds) / encounterSeconds));
}

/** 사냥 count 번을 치른 만큼 시계를 넘기고, 합쳐 둔 몫(초)을 꺼내 돌려준다. 받는 쪽이 그 몫을 보상에 얹는다 */
export function spendHunts(clock: HuntClock, count: number, encounterSeconds: number): number {
  clock.huntSeconds += count * encounterSeconds;
  const bonus = clock.huntBonusSeconds;
  clock.huntBonusSeconds = 0;
  return bonus;
}

/**
 * 몬스터 주기를 바꾼 직후 부른다. 쌓인 진행은 초 단위로 그대로 이어지니 주기를 오가도 보상이 늘거나 줄지 않는다.
 * 주기를 줄이면 이미 쌓인 진행이 새 주기 여러 번 몫이 될 수 있는데, 그러면 한 마리만 바로 나오게 하고
 * 나머지 몫은 그 한 마리 보상에 얹는다
 */
export function retimeHunts(clock: HuntClock, encounterSeconds: number): void {
  const due = encountersDue(clock, encounterSeconds);
  if (due < 2) return;
  const merged = (due - 1) * encounterSeconds;
  clock.huntSeconds += merged;
  clock.huntBonusSeconds += merged;
}

/** 몬스터를 끈 동안 쌓인 활동 시간은 사냥으로 치지 않는다. 다시 켜면 끄기 전 진행에서 이어진다 */
export function skipHunts(clock: HuntClock, seconds: number): void {
  clock.huntSeconds += seconds;
}

export function pickMonster(town: Town, random = Math.random): MonsterSpec {
  return town.monsters[Math.floor(random() * town.monsters.length)];
}

// 몬스터 한 마리 메소는 (기본 + 마을 레벨 × 계수) 의 ±1/3 안에서 정한다. 고레벨일수록 늘지만 레벨에 비례하지는 않게
// 기본값을 크게 뒀다. 보스 메소(bosses.ts)도 이 값의 배수다. 캐시샵 가격과 짝이라 바꾸면 cashShop.test.ts 의 「메소 벌이」 도 같이 본다
export const MESO_BASE = 130;
export const MESO_PER_TOWN_LEVEL = 1.75;
const MESO_SPREAD = 1 / 3;

/** 기본 주기 한 마리의 평균 메소 */
export function averageMesoDrop(town: Town): number {
  return MESO_BASE + MESO_PER_TOWN_LEVEL * town.minLevel;
}

/** seconds: 이 메소가 몇 초 몫의 사냥인지. 보통 몬스터 한 마리면 몬스터 주기다 */
export function mesoDrop(town: Town, random = Math.random, seconds = ENCOUNTER_EVERY_ACTIVE_SECONDS): number {
  return Math.round(averageMesoDrop(town) * rewardScale(seconds) * (1 - MESO_SPREAD + random() * 2 * MESO_SPREAD));
}
