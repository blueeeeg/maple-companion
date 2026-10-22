export const MAX_LEVEL = 300;

/** 자리에 앉아 활동한 1초가 경험치 1 */
export const XP_PER_ACTIVE_SECOND = 1;

// 하루 4시간 쓰는 사람이 6차(Lv.260)까지 대략 5~6주 걸리도록 맞춘 값
const CURVE_SCALE = 1.667;
const CURVE_POWER = 1.5;

export function xpToNextLevel(level: number): number {
  return Math.ceil(CURVE_SCALE * level ** CURVE_POWER);
}

/** CUMULATIVE_XP[n] = Lv.n 에 도달하는 데 필요한 누적 경험치 */
const CUMULATIVE_XP: number[] = (() => {
  const table = [0, 0];
  for (let level = 1; level < MAX_LEVEL; level += 1) {
    table.push(table[level] + xpToNextLevel(level));
  }
  return table;
})();

export function totalXpForLevel(level: number): number {
  return CUMULATIVE_XP[Math.min(Math.max(level, 1), MAX_LEVEL)];
}

export interface LevelInfo {
  level: number;
  xpIntoLevel: number;
  xpForLevel: number;
  /** 0~1. 만렙이면 1 */
  ratio: number;
}

export function levelInfo(totalXp: number): LevelInfo {
  let low = 1;
  let high = MAX_LEVEL;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (CUMULATIVE_XP[mid] <= totalXp) low = mid;
    else high = mid - 1;
  }
  const level = low;
  if (level >= MAX_LEVEL) {
    return { level, xpIntoLevel: 0, xpForLevel: 0, ratio: 1 };
  }
  const xpForLevel = xpToNextLevel(level);
  const xpIntoLevel = totalXp - CUMULATIVE_XP[level];
  return { level, xpIntoLevel, xpForLevel, ratio: xpIntoLevel / xpForLevel };
}
