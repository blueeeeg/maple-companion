import { type Appearance, DEFAULT_APPEARANCE } from './appearance';
import { type CashEquipped, composeLook } from './cashShop';
import { type EquipPity, type EquipWorn, wearEquipment } from './equipment';
import {
  JOB_BRANCHES,
  type JobBranchId,
  type JobLineId,
  type JobView,
  advancementTier,
  defaultBranch,
  describeJob,
  jobPath,
  pathTier,
} from './jobs';
import { BOSS_EVERY_ENCOUNTERS } from './bosses';
import { ENCOUNTER_EVERY_ACTIVE_SECONDS } from './encounters';
import { XP_PER_ACTIVE_SECOND, levelInfo } from './progression';
import { type AdvancementLog, baselineAdvancements } from './records';
import { huntSkill } from './skillBook';

export const MAX_CHARACTERS = 6;
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 12;
const NAME_PATTERN = /^[가-힣a-zA-Z0-9]+$/;
export const LEGACY_CHARACTER_NAME = '모험가';

export interface Character {
  id: string;
  name: string;
  appearance: Appearance;
  /** 이 캐릭터로 플레이하는 동안 쌓인 활동 시간. 레벨과 사냥 횟수가 여기서 나온다 */
  activeSeconds: number;
  jobLine: JobLineId | null;
  /** 2차 전직 때 고른 갈래. 아직 안 골랐으면 null 이고 그동안은 1차에 머문다 */
  jobBranch: JobBranchId | null;
  /** 갈래가 생기기 전 저장이라 2차 갈래를 저절로 받았다. 맵에 들어오면 한 번 무료로 다시 고르게 묻고 답하면 내린다 */
  freeJobChange: boolean;
  /** 2차 갈래를 바꾼 기록. 처음 고른 것은 전직이라 advancedAt 에 남고 여기에는 바꾼 것만 쌓인다 */
  jobHistory: JobChange[];
  killXp: number;
  meso: number;
  monsterBook: Record<string, number>;
  /** 지금까지 치른 사냥 수(보스 포함) */
  encountersResolved: number;
  /** 사냥으로 바꾼 활동 시간. 다음 몬스터가 언제 나오는지 센다(encounters.ts HuntClock) */
  huntSeconds: number;
  huntBonusSeconds: number;
  /** 지난 보스 뒤로 사냥에 쓴 활동 시간. 보스 차례와 보스 몫을 정한다(bosses.ts HuntProgress) */
  bossChargeSeconds: number;
  /** 캐시샵에서 산 아이템 ID */
  wardrobe: number[];
  /** 지금 입고 있는 캐시 아이템. 직업·차수 장비 겉모습을 자리별로 덮는다 */
  cashEquipped: CashEquipped;
  /** 장비 컬렉션에서 모은 아이템 ID(보스 드롭·레벨 선물·장비 상점) */
  equipOwned: number[];
  /** 자리마다 입은 컬렉션 장비. 직업 장비를 바꾸고, 같은 자리 캐시 아이템에는 가린다 */
  equipWorn: EquipWorn;
  /** 보스(몹 ID)마다 등급별로 드롭 없이 잡은 수. 천장에 닿으면 하나를 준다 */
  equipPity: EquipPity;
  /** 받은 레벨 선물 아이템 ID. 같은 선물을 두 번 주지 않는다 */
  equipGifts: number[];
  /** 스킬창에서 고른 사냥 스킬. null 이면 자동(차수마다 정해 둔 스킬). 겉모습만 바뀌고 보상은 같다 */
  huntSkillId: number | null;
  /** 보스 도전 창에서 지정한 다음 보스(몹 ID). 다음 보스 차례에 무작위 대신 이 보스가 나오고, 잡으면 지운다. 보상은 같다 */
  reservedBossId: number | null;
  /** 셔플 백: 이번 주기에 아직 나오지 않은 보스 ID 순서. 비면 자격 있는 보스를 모두 섞어 새 주기로 채운다 */
  bossBag: number[];
  /** 직전에 잡은 보스 몹 ID. 새 주기 첫 보스가 같은 보스로 연속되지 않게 쓴다 */
  lastBossId: number | null;
  /** 셔플 백: 이번 주기에 아직 방문하지 않은 마을 ID 순서. 비면 열린 마을을 섞어 새 주기로 채운다 */
  townBag: string[];
  /** 직전에 방문한 마을 ID. 새 주기 첫 마을이 같은 마을로 연속되지 않게 쓴다 */
  lastTownId: string | null;
  /** 전직한 날. 이 기록을 시작하기 전에 이미 한 전직은 null(날짜 모름)이다 */
  advancedAt: AdvancementLog;
}

export interface JobChange {
  at: number;
  from: JobBranchId;
  to: JobBranchId;
}

/** 2차 갈래를 바꾸는 값. 갈래 칸이 없던 캐릭터의 한 번은 무료다 */
export const JOB_CHANGE_MESO = 50_000;

export interface Roster {
  version: 2;
  characters: Character[];
  /** 지금 플레이 중인 캐릭터. 활동 시간은 이 캐릭터에만 쌓인다 */
  selectedId: string | null;
  muted: boolean;
}

/** 캐릭터가 한 명뿐이던 시절의 저장 형식 */
export interface LegacySave {
  jobLine: JobLineId | null;
  /** 2차 전직 때 고른 갈래. 아직 안 골랐으면 null 이고 그동안은 1차에 머문다 */
  jobBranch: JobBranchId | null;
  /** 갈래가 생기기 전 저장이라 2차 갈래를 저절로 받았다. 맵에 들어오면 한 번 무료로 다시 고르게 묻고 답하면 내린다 */
  freeJobChange: boolean;
  /** 2차 갈래를 바꾼 기록. 처음 고른 것은 전직이라 advancedAt 에 남고 여기에는 바꾼 것만 쌓인다 */
  jobHistory: JobChange[];
  killXp: number;
  meso: number;
  monsterBook: Record<string, number>;
  encountersResolved: number;
  muted: boolean;
}

export function emptyRoster(): Roster {
  return { version: 2, characters: [], selectedId: null, muted: false };
}

export function createCharacter(id: string, name: string, appearance: Appearance): Character {
  return {
    id,
    name: name.trim(),
    appearance: { ...appearance },
    activeSeconds: 0,
    jobLine: null,
    jobBranch: null,
    freeJobChange: false,
    jobHistory: [],
    killXp: 0,
    meso: 0,
    monsterBook: {},
    encountersResolved: 0,
    huntSeconds: 0,
    huntBonusSeconds: 0,
    bossChargeSeconds: 0,
    wardrobe: [],
    cashEquipped: {},
    equipOwned: [],
    equipWorn: {},
    equipPity: {},
    equipGifts: [],
    huntSkillId: null,
    reservedBossId: null,
    bossBag: [],
    lastBossId: null,
    townBag: [],
    lastTownId: null,
    advancedAt: {},
  };
}

/**
 * 예전 진행은 전역 활동 시간 전부로 계산됐으므로, 첫 캐릭터가 그 값을 그대로 이어받아야 레벨과 남은 사냥 수가 유지된다
 */
export function migrateLegacySave(legacy: Partial<LegacySave>, id: string, globalActiveSeconds: number): Roster {
  const character: Character = {
    ...createCharacter(id, LEGACY_CHARACTER_NAME, DEFAULT_APPEARANCE),
    activeSeconds: globalActiveSeconds,
    jobLine: legacy.jobLine ?? null,
    killXp: legacy.killXp ?? 0,
    meso: legacy.meso ?? 0,
    monsterBook: { ...legacy.monsterBook },
    encountersResolved: legacy.encountersResolved ?? 0,
    ...legacyHuntProgress(legacy.encountersResolved),
  };
  Object.assign(character, legacyBranch(character));
  character.advancedAt = baselineAdvancements(reachedTier(character));
  return { version: 2, characters: [character], selectedId: id, muted: legacy.muted ?? false };
}

/**
 * 몬스터 주기·보스 간격을 설정으로 바꾸기 전에는 늘 3분마다, 보스는 20번째마다였다. 치른 사냥 수 × 3분이 사냥으로 바꾼
 * 활동 시간이고, 지난 보스 뒤로 치른 사냥 수 × 3분이 모인 보스 몫이다
 */
export function legacyHuntProgress(encountersResolved: number | undefined): Pick<Character, 'huntSeconds' | 'bossChargeSeconds'> {
  const resolved = encountersResolved ?? 0;
  return {
    huntSeconds: resolved * ENCOUNTER_EVERY_ACTIVE_SECONDS,
    bossChargeSeconds: (resolved % BOSS_EVERY_ENCOUNTERS) * ENCOUNTER_EVERY_ACTIVE_SECONDS,
  };
}

/**
 * 갈래 칸이 없던 저장. 2차를 이미 했으면 그때 하나뿐이던 길(계열의 첫 갈래)로 읽고 한 번 무료로 다시 고르게 한다.
 * 아직 2차 전이면 Lv.30 에 고른다
 */
export function legacyBranch(
  character: Pick<Character, 'activeSeconds' | 'killXp' | 'jobLine'>,
): Pick<Character, 'jobBranch' | 'freeJobChange'> {
  const level = levelInfo(character.activeSeconds * XP_PER_ACTIVE_SECOND + character.killXp).level;
  if (!character.jobLine || advancementTier(level) < 2) return { jobBranch: null, freeJobChange: false };
  return { jobBranch: defaultBranch(character.jobLine), freeJobChange: true };
}

export type JobChangeCheck = 'ok' | 'notYet' | 'same' | 'otherLine' | 'meso';

/** 그 갈래로 바꿀 수 있는지. 2차 갈래를 고른 뒤에 같은 계열 안에서만 바꾼다. 계열은 캐릭터 슬롯이 나누는 몫이라 못 바꾼다 */
export function jobChangeCheck(character: Character, to: JobBranchId, free: boolean): JobChangeCheck {
  if (!character.jobLine || !character.jobBranch) return 'notYet';
  if (character.jobBranch === to) return 'same';
  if (JOB_BRANCHES[to]?.line !== character.jobLine) return 'otherLine';
  if (!free && character.meso < JOB_CHANGE_MESO) return 'meso';
  return 'ok';
}

/**
 * 2차 갈래를 바꾼다. 레벨·경험치·기록·옷장은 그대로이고 이름·장비·스킬만 새 갈래 것이 된다.
 * 고른 사냥 스킬은 다른 갈래 스킬일 수 있어 자동으로 돌린다. free 는 갈래 칸이 없던 캐릭터의 한 번이다
 */
export function changeJobBranch(character: Character, to: JobBranchId, now: number, free = false): JobChangeCheck {
  const check = jobChangeCheck(character, to, free && character.freeJobChange);
  if (check !== 'ok') return check;
  if (!(free && character.freeJobChange)) character.meso -= JOB_CHANGE_MESO;
  character.jobHistory = [...character.jobHistory, { at: now, from: character.jobBranch!, to }];
  character.jobBranch = to;
  character.freeJobChange = false;
  character.huntSkillId = null;
  return 'ok';
}

/** 오류 문구. 쓸 수 있는 이름이면 null */
export function nameError(name: string, takenNames: string[]): string | null {
  const trimmed = name.trim();
  const length = [...trimmed].length;
  if (length < NAME_MIN_LENGTH || length > NAME_MAX_LENGTH) {
    return `이름은 ${NAME_MIN_LENGTH}~${NAME_MAX_LENGTH}자로 지어 주세요`;
  }
  if (!NAME_PATTERN.test(trimmed)) return '한글·영문·숫자만 쓸 수 있어요';
  const lower = trimmed.toLowerCase();
  if (takenNames.some((taken) => taken.toLowerCase() === lower)) return '이미 있는 이름이에요';
  return null;
}

/**
 * 이번 틱에 늘어난 전역 활동 시간.
 * 앱을 켠 뒤 첫 틱은 기준만 잡고, 전역 값이 줄었으면(활동 기록 파일 초기화) 0 으로 본다
 */
export function activityDelta(previous: number | null, current: number): number {
  if (previous === null || current < previous) return 0;
  return current - previous;
}

/** 플레이 중인 캐릭터에만 활동 시간을 더한다. 더한 캐릭터가 있으면 true */
export function creditActivity(roster: Roster, seconds: number): boolean {
  const character = selectedCharacter(roster);
  if (!character || seconds <= 0) return false;
  character.activeSeconds += seconds;
  return true;
}

export function selectedCharacter(roster: Roster): Character | null {
  return roster.characters.find((character) => character.id === roster.selectedId) ?? null;
}

export function characterXp(character: Character): number {
  return character.activeSeconds * XP_PER_ACTIVE_SECOND + character.killXp;
}

export interface CharacterSummary {
  id: string;
  name: string;
  level: number;
  jobTitle: string;
  look: number[];
  standAction: string;
}

/**
 * 직업·차수 장비에 컬렉션 장비를 입히고 그 위에 캐시 아이템을 덧입힌 모습. 맵·캐릭터 선택 화면이 같은 모습을 그린다.
 * 공격 스킬은 스킬창에서 고른 것이고, 못 고른 상태면 자동 스킬 그대로다
 */
export function characterJob(character: Character, level: number): JobView {
  const path = jobPath(character.jobLine, character.jobBranch);
  const job = describeJob(level, path, character.appearance);
  return {
    ...job,
    look: composeLook(wearEquipment(job.look, character.equipWorn, path), character.cashEquipped),
    skillId: huntSkill(path, job.tier, character.huntSkillId),
    autoSkillId: job.skillId,
  };
}

/** 지금 몇 차인지. 직업을 아직 안 골랐으면 레벨이 넘어도 0, 2차 갈래를 안 골랐으면 1 이다 */
export function reachedTier(character: Pick<Character, 'activeSeconds' | 'killXp' | 'jobLine' | 'jobBranch'>): number {
  const { level } = levelInfo(character.activeSeconds * XP_PER_ACTIVE_SECOND + character.killXp);
  return pathTier(level, jobPath(character.jobLine, character.jobBranch));
}

export function summarizeCharacter(character: Character): CharacterSummary {
  const { level } = levelInfo(characterXp(character));
  const job = characterJob(character, level);
  return { id: character.id, name: character.name, level, jobTitle: job.title, look: job.look, standAction: job.standAction };
}
