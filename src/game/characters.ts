import { type Appearance, DEFAULT_APPEARANCE } from './appearance';
import { type CashEquipped, composeLook } from './cashShop';
import { type JobLineId, type JobView, describeJob } from './jobs';
import { BOSS_EVERY_ENCOUNTERS } from './bosses';
import { ENCOUNTER_EVERY_ACTIVE_SECONDS } from './encounters';
import { XP_PER_ACTIVE_SECOND, levelInfo } from './progression';

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
}

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
    killXp: 0,
    meso: 0,
    monsterBook: {},
    encountersResolved: 0,
    huntSeconds: 0,
    huntBonusSeconds: 0,
    bossChargeSeconds: 0,
    wardrobe: [],
    cashEquipped: {},
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
}

/** 직업·차수 장비에 입고 있는 캐시 아이템을 덧입힌 모습. 맵·캐릭터 선택 화면이 같은 모습을 그린다 */
export function characterJob(character: Character, level: number): JobView {
  const job = describeJob(level, character.jobLine, character.appearance);
  return { ...job, look: composeLook(job.look, character.cashEquipped) };
}

export function summarizeCharacter(character: Character): CharacterSummary {
  const { level } = levelInfo(characterXp(character));
  const job = characterJob(character, level);
  return { id: character.id, name: character.name, level, jobTitle: job.title, look: job.look };
}
