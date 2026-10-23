import { ENCOUNTER_EVERY_ACTIVE_SECONDS, type HuntClock, killXp, mesoDrop, pickMonster, spendHunts } from './encounters';
import type { Town } from './towns';

export interface BossSpec {
  /** 메이플 몹 ID */
  id: number;
  name: string;
  /** 이 레벨부터 나온다. 몹 레벨(Mob.wz info/level)을 그대로 쓴다 */
  minLevel: number;
  /** 원작에서 이 보스를 잡는 맵. 배경·발판·BGM 을 이 맵에서 가져온다 */
  mapId: number;
  /** 맵 렌더에는 하늘 배경이 빠져 있어서 뒤에 까는 색 */
  sky: [top: number, bottom: number];
}

function shuffleArray<T>(arr: T[], random: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** 기본값은 사냥 20번째마다(활동 약 1시간) 보스가 나온다. 설정에서 바꾼다 */
export const BOSS_EVERY_ENCOUNTERS = 20;
/** 기본 보스 간격일 때 보통 몬스터 한 마리 경험치의 몇 배를 주는지 */
export const BOSS_XP_MULTIPLIER = 20;
/** 기본 보스 간격일 때 보통 몬스터 한 마리 메소(mesoDrop)의 몇 배를 떨어뜨리는지 */
export const BOSS_MESO_MULTIPLIER = 10;
/** 스킬 사용 횟수. 한 번에 1초 남짓이라 20~40초쯤 싸운다 */
export const BOSS_HITS_MIN = 18;
export const BOSS_HITS_MAX = 32;

// 몹·맵 ID 는 KMS 389 에서 이름·애니메이션(stand·hit1·die1)·렌더·BGM 이 모두 받아지는 것을 확인한 값이다.
// 여러 부위로 나뉜 보스(자쿰·혼테일 등)와 die1 이 빈 그림인 보스(데미안)는 뺐다
export const BOSSES: BossSpec[] = [
  { id: 2220000, name: '마노', minLevel: 10, mapId: 104010200, sky: [0x7ec8ff, 0xd9f2ff] },
  { id: 6130101, name: '머쉬맘', minLevel: 18, mapId: 100020101, sky: [0x8fd3ff, 0xe6f7ff] },
  { id: 3220000, name: '스텀피', minLevel: 25, mapId: 102020500, sky: [0xe8a466, 0xffe0b0] },
  { id: 6220000, name: '다일', minLevel: 50, mapId: 103030400, sky: [0x3d5a3a, 0x9fbf8a] },
  { id: 6300005, name: '좀비 머쉬맘', minLevel: 66, mapId: 910090210, sky: [0x3a3550, 0x8c86a8] },
  { id: 8130100, name: '주니어 발록', minLevel: 70, mapId: 105030500, sky: [0x1a1420, 0x4a3a4a] },
  { id: 8150000, name: '크림슨 발록', minLevel: 100, mapId: 200090010, sky: [0x5aa8f0, 0xdff1ff] },
  { id: 8510000, name: '피아누스', minLevel: 110, mapId: 230040420, sky: [0x0c2a55, 0x2f78b8] },
  { id: 8500002, name: '파풀라투스', minLevel: 125, mapId: 220080001, sky: [0x2a1f3d, 0x6b5a8a] },
  { id: 8220003, name: '레비아탄', minLevel: 145, mapId: 240040401, sky: [0x5a4a3a, 0xc8b08a] },
  { id: 8860000, name: '아카이럼', minLevel: 170, mapId: 272020200, sky: [0x150f2a, 0x4a3a7a] },
  { id: 8820001, name: '핑크빈', minLevel: 180, mapId: 270050100, sky: [0x2a2040, 0x8a6aa8] },
  { id: 8880000, name: '매그너스', minLevel: 190, mapId: 401060100, sky: [0x2a1a1a, 0x7a4a3a] },
  { id: 8880405, name: '진 힐라', minLevel: 250, mapId: 450010500, sky: [0x1a0a1a, 0x5a1a3a] },
];

/** 사냥 속도 설정. 몬스터를 끄면 이 값 자체가 없다(null) */
export interface HuntPace {
  /** 활동 시간 몇 초마다 몬스터가 나오는지 */
  encounterSeconds: number;
  /** 사냥 몇 번마다 보스가 나오는지. null 이면 보스가 안 나온다 */
  bossEvery: number | null;
}

export const DEFAULT_PACE: HuntPace = { encounterSeconds: ENCOUNTER_EVERY_ACTIVE_SECONDS, bossEvery: BOSS_EVERY_ENCOUNTERS };

/** 레벨에 맞는 보스 전부에서 고른다. 여러 보스를 보는 재미를 위해 센 보스만으로 좁히지 않는다. 맞는 보스가 없으면 null */
export function pickBoss(level: number, random = Math.random): BossSpec | null {
  const pool = BOSSES.filter((boss) => boss.minLevel <= level);
  if (pool.length === 0) return null;
  return pool[Math.floor(random() * pool.length)];
}

/**
 * 셔플 백에서 보스를 한 마리 꺼낸다. 자격 없는 ID 를 제거하고, 비었으면 자격 있는 보스를 섞어 새 주기로 채운다.
 * 새 주기 첫 보스가 직전 보스와 같으면(2마리 이상일 때) 한 칸 뒤로 밀어 연속을 막는다.
 * 자격 있는 보스가 없으면 null
 */
export function drawFromBag(
  bag: number[],
  lastBossId: number | null,
  level: number,
  random = Math.random,
): { boss: BossSpec; bag: number[]; lastBossId: number } | null {
  const eligible = BOSSES.filter((b) => b.minLevel <= level);
  if (eligible.length === 0) return null;
  const eligibleIds = new Set(eligible.map((b) => b.id));
  let remaining = bag.filter((id) => eligibleIds.has(id));
  if (remaining.length === 0) {
    remaining = shuffleArray(eligible.map((b) => b.id), random);
    // 새 주기 첫 보스가 직전 보스와 겹치지 않도록
    if (eligible.length >= 2 && remaining[0] === lastBossId) {
      remaining.push(remaining.shift()!);
    }
  }
  const id = remaining[0];
  const boss = BOSSES.find((b) => b.id === id)!;
  return { boss, bag: remaining.slice(1), lastBossId: id };
}

/** 보스 도전 창에서 다음 보스로 지정해 둔 보스. 지정이 없거나, 없는 보스거나, 아직 레벨이 모자라면 null */
export function reservedBoss(level: number, reservedBossId: number | null): BossSpec | null {
  const boss = BOSSES.find((each) => each.id === reservedBossId);
  return boss && boss.minLevel <= level ? boss : null;
}

/** 보스 차례에 나올 보스. 지정해 둔 보스가 있으면 그 보스다. 어느 보스든 보상은 같다(settleHunt) */
export function scheduledBoss(level: number, reservedBossId: number | null, random = Math.random): BossSpec | null {
  return reservedBoss(level, reservedBossId) ?? pickBoss(level, random);
}

export function bossHits(random = Math.random): number {
  return BOSS_HITS_MIN + Math.floor(random() * (BOSS_HITS_MAX - BOSS_HITS_MIN + 1));
}

/**
 * 보스 몫(보통 몬스터보다 더 주는 경험치·메소)은 지난 보스 뒤로 사냥한 시간만큼의 보통 몬스터 보상에 이 비율을 곱한다.
 * 기본 설정(3분 · 20마리마다)이면 보스가 보통 몬스터의 20배 경험치, 10배 메소를 주는 값이다
 */
const BOSS_XP_BONUS_RATE = (BOSS_XP_MULTIPLIER - 1) / BOSS_EVERY_ENCOUNTERS;
const BOSS_MESO_BONUS_RATE = (BOSS_MESO_MULTIPLIER - 1) / BOSS_EVERY_ENCOUNTERS;

/**
 * 사냥 진행. 보스 차례도 「몇 번째 사냥」 이 아니라 지난 보스 뒤로 사냥에 쓴 활동 시간(bossChargeSeconds)으로 센다.
 * 보스는 그동안 모인 몫을 한 번에 준다. 그래서 몬스터 주기나 보스 간격을 언제 바꿔도 보스 몫이 늘거나 줄지 않고,
 * 보스가 자주 나오면 한 번에 덜, 드물게 나오면 한 번에 더 준다
 */
export interface HuntProgress extends HuntClock {
  /** 지금까지 치른 사냥 수(보스 포함) */
  encountersResolved: number;
  bossChargeSeconds: number;
  /** 셔플 백: 이번 주기에 아직 나오지 않은 보스 ID. 없으면 pickBoss 폴백(테스트·구버전 호환) */
  bossBag?: number[];
  /** 직전에 잡은 보스 ID. 새 주기 첫 보스 연속 방지에 쓴다 */
  lastBossId?: number | null;
}

/** 다음 사냥이 보스 차례인지. 사냥 bossEvery 번 몫의 시간이 모이면 그 마지막 사냥이 보스다 */
export function bossDue(progress: HuntProgress, pace: HuntPace): boolean {
  if (pace.bossEvery === null) return false;
  return progress.bossChargeSeconds + pace.encounterSeconds >= pace.encounterSeconds * pace.bossEvery;
}

/** 보스가 정해진 간격으로 계속 나올 때 한 번에 주는 경험치 */
export function bossXp(pace: HuntPace = DEFAULT_PACE): number {
  const charge = pace.encounterSeconds * (pace.bossEvery ?? BOSS_EVERY_ENCOUNTERS);
  return killXp(pace.encounterSeconds) + killXp(charge) * BOSS_XP_BONUS_RATE;
}

/** 기본 설정일 때 보스 경험치 */
export const BOSS_XP = bossXp();

/** 보스가 정해진 간격으로 계속 나올 때 한 번에 주는 메소 */
export function bossMeso(town: Town, random = Math.random, pace: HuntPace = DEFAULT_PACE): number {
  const charge = pace.encounterSeconds * (pace.bossEvery ?? BOSS_EVERY_ENCOUNTERS);
  return mesoDrop(town, random, pace.encounterSeconds) + Math.round(mesoDrop(town, random, charge) * BOSS_MESO_BONUS_RATE);
}

/**
 * 사냥 한 번을 치르고 보상을 돌려준다. 주기를 줄일 때 합쳐 둔 몫(spendHunts)도 여기서 준다.
 * boss 면 모아 둔 보스 몫을 다 주고 비운다. 보스 차례였어도 레벨에 맞는 보스가 없어 보통 몬스터로 치렀으면
 * 몫이 남아 다음 사냥이 다시 보스 차례가 된다. 보스를 끈 동안에는 몫이 모이지 않는다
 */
export function settleHunt(
  progress: HuntProgress,
  pace: HuntPace,
  town: Town,
  boss: boolean,
  random = Math.random,
): { xp: number; meso: number } {
  const seconds = pace.encounterSeconds + spendHunts(progress, 1, pace.encounterSeconds);
  progress.encountersResolved += 1;
  let xp = killXp(seconds);
  let meso = mesoDrop(town, random, seconds);
  if (boss) {
    const charge = progress.bossChargeSeconds + seconds;
    progress.bossChargeSeconds = 0;
    xp += killXp(charge) * BOSS_XP_BONUS_RATE;
    meso += Math.round(mesoDrop(town, random, charge) * BOSS_MESO_BONUS_RATE);
  } else if (pace.bossEvery !== null) {
    progress.bossChargeSeconds += seconds;
  }
  return { xp, meso };
}

export interface HuntResult {
  /** 몬스터·보스 이름 → 잡은 수 */
  kills: Record<string, number>;
  /** 잡은 보스 이름 → 잡은 수 */
  bosses: Record<string, number>;
  xp: number;
  meso: number;
  /** 지정해 둔 보스가 이번에 나왔는지. 나왔으면 받는 쪽이 지정을 지운다 */
  reservationUsed: boolean;
}

/**
 * 창이 안 보이는 동안 쌓인 사냥 count 번을 애니메이션 없이 한 번에 치른다. 보스 차례면 레벨에 맞는 보스로 친다.
 * 지정해 둔 보스(reservedBossId)는 첫 보스 차례에 한 번만 나온다
 */
export function resolveHunts(
  progress: HuntProgress,
  pace: HuntPace,
  level: number,
  town: Town,
  count: number,
  random = Math.random,
  reservedBossId: number | null = null,
): HuntResult {
  const result: HuntResult = { kills: {}, bosses: {}, xp: 0, meso: 0, reservationUsed: false };
  for (let index = 0; index < count; index += 1) {
    const due = bossDue(progress, pace);
    const reserved = due && !result.reservationUsed ? reservedBoss(level, reservedBossId) : null;
    if (reserved) result.reservationUsed = true;
    let boss: BossSpec | null = null;
    if (due) {
      if (reserved) {
        boss = reserved;
      } else if (progress.bossBag !== undefined) {
        const drawn = drawFromBag(progress.bossBag, progress.lastBossId ?? null, level, random);
        if (drawn) {
          progress.bossBag = drawn.bag;
          progress.lastBossId = drawn.lastBossId;
          boss = drawn.boss;
        }
      } else {
        boss = pickBoss(level, random);
      }
    }
    const name = boss ? boss.name : pickMonster(town, random).name;
    const reward = settleHunt(progress, pace, town, boss !== null, random);
    result.kills[name] = (result.kills[name] ?? 0) + 1;
    if (boss) result.bosses[name] = (result.bosses[name] ?? 0) + 1;
    result.xp += reward.xp;
    result.meso += reward.meso;
  }
  return result;
}
