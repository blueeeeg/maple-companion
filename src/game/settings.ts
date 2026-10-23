import { BOSS_EVERY_ENCOUNTERS, BOSS_MESO_MULTIPLIER, BOSS_XP_MULTIPLIER, type HuntPace } from './bosses';
import { ENCOUNTER_EVERY_ACTIVE_SECONDS, KILL_XP } from './encounters';
import { XP_PER_ACTIVE_SECOND } from './progression';
import { TOWNS, type Town, unlockedTowns } from './towns';

// 설정은 캐릭터마다가 아니라 앱 전체에 하나다. 소리 끄기만 예전부터 캐릭터 목록(Roster.muted)에 있어서 그대로 둔다
const STORAGE_KEY = 'maple-companion:settings';
const SETTINGS_VERSION = 1;

export const ENCOUNTER_MINUTE_OPTIONS = [1, 3, 5, 10] as const;
export const BOSS_EVERY_OPTIONS = [10, 20, 40] as const;
export const TOWN_ROTATE_MINUTE_OPTIONS = [4, 8, 15, 30] as const;
export const IDLE_MINUTE_OPTIONS = [1, 2, 5, 10] as const;
export const LEVEL_UP_EFFECT_OPTIONS = ['original', 'small'] as const;
/** 「작게」 일 때 레벨업 이펙트 배율. 전직 이펙트는 늘 원본 크기다 */
export const LEVEL_UP_SMALL_SCALE = 0.65;
export const BGM_VOLUME_MAX = 100;

export type LevelUpEffect = (typeof LEVEL_UP_EFFECT_OPTIONS)[number];

export interface Settings {
  version: typeof SETTINGS_VERSION;
  /** 활동 몇 분마다 몬스터가 나오는지. null 이면 몬스터(보스 포함)가 안 나온다 */
  encounterMinutes: (typeof ENCOUNTER_MINUTE_OPTIONS)[number] | null;
  /** 몇 번째 사냥마다 보스인지. null 이면 보스가 안 나온다 */
  bossEvery: (typeof BOSS_EVERY_OPTIONS)[number] | null;
  damageNumbers: boolean;
  /** 마을을 돌 때 몇 분마다 옮기는지. 한 곳에 머무는 동안에도 값은 남겨 둔다 */
  townRotateMinutes: (typeof TOWN_ROTATE_MINUTE_OPTIONS)[number];
  /** null 이면 마을을 돈다. 값이 있으면 그 마을(과 그 사냥터)에 머문다. 지금 캐릭터에게 아직 안 열린 마을이면 돈다 */
  pinnedTownId: string | null;
  /** 0~100 */
  bgmVolume: number;
  levelUpEffect: LevelUpEffect;
  /** 입력이 이만큼 없으면 자리 비움으로 보고 활동 시간을 멈춘다 */
  idleMinutes: (typeof IDLE_MINUTE_OPTIONS)[number];
  /** 창이 숨었거나 다른 앱을 보는 동안 전직이 오면 OS 알림을 띄운다 */
  jobAlerts: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  encounterMinutes: 3,
  bossEvery: BOSS_EVERY_ENCOUNTERS,
  damageNumbers: true,
  townRotateMinutes: 8,
  pinnedTownId: null,
  bgmVolume: 35,
  levelUpEffect: 'original',
  idleMinutes: 2,
  jobAlerts: true,
};

function oneOf<T>(options: readonly T[], value: unknown, fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function optional<T>(options: readonly T[], value: unknown, fallback: T | null): T | null {
  return value === null ? null : oneOf<T | null>(options, value, fallback);
}

/**
 * 예전 판은 「자동」 체크를 끄면 그때 있던 마을에 머물렀다. 그 마을은 저장하지 않았고 켤 때마다 최근 마을 중에서 골랐으니
 * 지금 캐릭터에게 가장 최근에 열린 마을에 머무는 것으로 옮긴다. 고정한 마을이 있었으면 그 마을이 먼저다
 */
function legacyPinnedTownId(saved: Record<string, unknown>, level: number): string | null {
  if (TOWNS.some((town) => town.id === saved.pinnedTownId)) return saved.pinnedTownId as string;
  if (saved.townRotate !== false) return null;
  const towns = unlockedTowns(level);
  return towns[towns.length - 1]?.id ?? null;
}

/**
 * 저장된 값 중 쓸 수 있는 것만 받고 나머지는 기본값으로 채운다. 손으로 고쳤거나 예전 판 저장이어도 앱이 뜬다.
 * level 은 지금 캐릭터 레벨로, 예전 「자동」 끔 저장을 옮길 때만 쓴다
 */
export function normalizeSettings(raw: unknown, level = 1): Settings {
  const saved = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof Settings | 'townRotate', unknown>>;
  const fallback = DEFAULT_SETTINGS;
  const volume = Number(saved.bgmVolume);
  return {
    version: SETTINGS_VERSION,
    encounterMinutes: optional(ENCOUNTER_MINUTE_OPTIONS, saved.encounterMinutes, fallback.encounterMinutes),
    bossEvery: optional(BOSS_EVERY_OPTIONS, saved.bossEvery, fallback.bossEvery),
    damageNumbers: typeof saved.damageNumbers === 'boolean' ? saved.damageNumbers : fallback.damageNumbers,
    townRotateMinutes: oneOf(TOWN_ROTATE_MINUTE_OPTIONS, saved.townRotateMinutes, fallback.townRotateMinutes),
    pinnedTownId: legacyPinnedTownId(saved, level),
    bgmVolume:
      saved.bgmVolume !== undefined && saved.bgmVolume !== null && Number.isFinite(volume)
        ? Math.min(BGM_VOLUME_MAX, Math.max(0, Math.round(volume)))
        : fallback.bgmVolume,
    levelUpEffect: oneOf(LEVEL_UP_EFFECT_OPTIONS, saved.levelUpEffect, fallback.levelUpEffect),
    idleMinutes: oneOf(IDLE_MINUTE_OPTIONS, saved.idleMinutes, fallback.idleMinutes),
    jobAlerts: typeof saved.jobAlerts === 'boolean' ? saved.jobAlerts : fallback.jobAlerts,
  };
}

export function parseSettings(text: string | null, level = 1): Settings {
  if (!text) return { ...DEFAULT_SETTINGS };
  try {
    return normalizeSettings(JSON.parse(text), level);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function loadSettings(level = 1): Settings {
  try {
    return parseSettings(localStorage.getItem(STORAGE_KEY), level);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 저장소가 막힌 환경이면 이번 실행에만 적용한다
  }
}

/** 몬스터를 껐으면 null */
export function huntPace(settings: Settings): HuntPace | null {
  if (settings.encounterMinutes === null) return null;
  return { encounterSeconds: settings.encounterMinutes * 60, bossEvery: settings.bossEvery };
}

export function idleLimitSeconds(settings: Settings): number {
  return settings.idleMinutes * 60;
}

/** 마을을 돌 때 옮기는 간격. 머무는 마을이 유효한지(열린 마을인지)는 호출한 쪽이 pinnedTown 으로 본다 */
export function townRotateMs(settings: Settings): number {
  return settings.townRotateMinutes * 60 * 1000;
}

/** 머물기로 한 마을이 이 레벨에 열려 있으면 그 마을. 아니면 null(돈다) */
export function pinnedTown(settings: Settings, level: number): Town | null {
  return TOWNS.find((town) => town.id === settings.pinnedTownId && town.minLevel <= level) ?? null;
}

export function levelUpScale(settings: Settings): number {
  return settings.levelUpEffect === 'small' ? LEVEL_UP_SMALL_SCALE : 1;
}

export interface HourlyXp {
  /** 활동 시간만으로 받는 몫 */
  activity: number;
  /** 보통 몬스터 몫 */
  monsters: number;
  /** 보스가 보통 몬스터보다 더 주는 몫 */
  bossBonus: number;
}

/**
 * 활동 1시간에 받는 경험치를 몫별로 나눈다. 레벨에 맞는 보스가 있다고 본다(Lv.10 미만은 보스 차례도 보통 몬스터다).
 * 몬스터 주기·보스 간격을 어떻게 골라도 같고, 끄면 그 몫이 0 이 된다. 설정 화면 안내 문구가 쓴다
 */
export function hourlyXp(settings: Settings): HourlyXp {
  const activity = 3600 * XP_PER_ACTIVE_SECOND;
  if (settings.encounterMinutes === null) return { activity, monsters: 0, bossBonus: 0 };
  // 기본 주기 기준 시간당 사냥 수. 주기를 바꾸면 마리 수와 한 마리 보상이 반비례해서 곱은 그대로다
  const hunts = 3600 / ENCOUNTER_EVERY_ACTIVE_SECONDS;
  const bossBonus = settings.bossEvery === null ? 0 : (hunts / BOSS_EVERY_ENCOUNTERS) * KILL_XP * (BOSS_XP_MULTIPLIER - 1);
  return { activity, monsters: hunts * KILL_XP, bossBonus };
}

/** 시간당 메소 중 보스가 더 주는 몫의 비율. 보통 몬스터 메소를 1 로 본 상대값이라 마을과 상관없다 */
export function bossMesoShare(): number {
  const bonus = (BOSS_MESO_MULTIPLIER - 1) / BOSS_EVERY_ENCOUNTERS;
  return bonus / (1 + bonus);
}
