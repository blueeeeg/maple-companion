import { normalizeAppearance } from './appearance';
import { normalizeReservedBoss } from './bossChallenge';
import { normalizeCashData } from './cashShop';
import { normalizeChairData } from './chairs';
import { mergeEquipPity, normalizeEquipData } from './equipment';
import {
  type Character,
  type JobChange,
  type LegacySave,
  type Roster,
  createCharacter,
  emptyRoster,
  legacyBranch,
  legacyHuntProgress,
  migrateLegacySave,
  reachedTier,
} from './characters';
import { JOB_BRANCHES, type JobBranchId } from './jobs';
import { mergeAdvancements, normalizeAdvancements } from './records';

const STORAGE_KEY = 'maple-companion:characters';
// 캐릭터가 한 명뿐이던 때의 키. 옮긴 뒤에도 지우지 않아서 되돌릴 여지를 남긴다
const LEGACY_STORAGE_KEY = 'maple-companion:save';

export function newCharacterId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 예전 판 저장이어도 빠진 값을 채워 지금 모양으로 맞춘다 */
export function normalizeRoster(parsed: Partial<Roster>): Roster {
  const characters = (parsed.characters ?? []).map((character): Character => {
    const appearance = normalizeAppearance(character.appearance);
    // 캐시샵이 생기기 전 저장에는 옷장이 없어서 빈 옷장으로 시작한다
    const filled: Character = {
      ...createCharacter(character.id, character.name, appearance),
      // 몬스터 주기 설정이 생기기 전 저장에는 사냥 진행이 마리 수로만 있다
      ...(character.huntSeconds === undefined ? legacyHuntProgress(character.encountersResolved) : {}),
      ...character,
      appearance,
      ...normalizeCashData(character),
      // 장비 컬렉션이 생기기 전 저장은 빈 컬렉션이다. 레벨 선물은 켤 때 받는다
      ...normalizeEquipData(character),
      ...normalizeChairData(character),
      // 시대가 생기기 전 캐릭터는 모두 지금 시대다
      era: character.era === 'classic' ? 'classic' : 'current',
    };
    const { huntSkillId } = character;
    const raw = character as Partial<Character>;
    const branch = normalizeBranch(filled, raw);
    return {
      ...filled,
      ...branch,
      jobHistory: normalizeJobHistory(raw.jobHistory),
      jobChangeHintShown: raw.jobChangeHintShown === true,
      huntSkillId: typeof huntSkillId === 'number' && Number.isInteger(huntSkillId) ? huntSkillId : null,
      // 보스 지정이 생기기 전 저장이거나 지금은 없는 보스면 지정 없음(무작위)이다
      reservedBossId: normalizeReservedBoss(character.reservedBossId),
      // 셔플 백이 없거나 깨진 저장이면 빈 배열로 시작한다
      bossBag: Array.isArray(raw.bossBag)
        ? (raw.bossBag as unknown[]).filter((x): x is number => typeof x === 'number' && Number.isInteger(x))
        : [],
      lastBossId: typeof raw.lastBossId === 'number' ? raw.lastBossId : null,
      townBag: Array.isArray(raw.townBag)
        ? (raw.townBag as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
      lastTownId: typeof raw.lastTownId === 'string' ? raw.lastTownId : null,
      // 전직 기록이 생기기 전 저장이면 이미 한 전직은 날짜를 모른다. 지금 시각으로 적으면 가짜 기록이 된다
      advancedAt: normalizeAdvancements(character.advancedAt, reachedTier({ ...filled, ...branch })),
    };
  });
  return { ...emptyRoster(), ...parsed, characters };
}

const BRANCH_IDS = new Set<unknown>(Object.keys(JOB_BRANCHES));
const isBranchOf = (value: unknown, line: Character['jobLine']): value is JobBranchId =>
  BRANCH_IDS.has(value) && JOB_BRANCHES[value as JobBranchId].line === line;

/**
 * 갈래 칸이 없던 저장은 legacyBranch 로 읽는다(2차를 했으면 첫 갈래 + 무료 다시 고르기 한 번).
 * 칸이 있는데 깨졌거나 계열이 안 맞으면 아직 안 고른 것으로 친다. 다시 Lv.30 처럼 고르게 된다
 */
function normalizeBranch(filled: Character, raw: Partial<Character>): Pick<Character, 'jobBranch' | 'freeJobChange'> {
  if (!('jobBranch' in raw)) return legacyBranch(filled);
  const jobBranch = isBranchOf(raw.jobBranch, filled.jobLine) ? raw.jobBranch : null;
  return { jobBranch, freeJobChange: jobBranch !== null && raw.freeJobChange === true };
}

function normalizeJobHistory(saved: unknown): JobChange[] {
  if (!Array.isArray(saved)) return [];
  return saved.filter(
    (entry): entry is JobChange =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.at === 'number' &&
      Number.isFinite(entry.at) &&
      BRANCH_IDS.has(entry.from) &&
      BRANCH_IDS.has(entry.to),
  );
}

export function parseRoster(
  rosterText: string | null,
  legacyText: string | null,
  globalActiveSeconds: number,
  id = newCharacterId(),
): Roster {
  if (rosterText) return normalizeRoster(JSON.parse(rosterText) as Partial<Roster>);
  if (legacyText) return migrateLegacySave(JSON.parse(legacyText) as Partial<LegacySave>, id, globalActiveSeconds);
  return emptyRoster();
}

/** globalActiveSeconds: 예전 저장을 처음 옮길 때 첫 캐릭터가 이어받을 활동 시간 */
export function loadRoster(globalActiveSeconds: number): Roster {
  try {
    return parseRoster(localStorage.getItem(STORAGE_KEY), localStorage.getItem(LEGACY_STORAGE_KEY), globalActiveSeconds);
  } catch {
    return emptyRoster();
  }
}

export function writeRoster(roster: Roster): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(roster));
  } catch {
    // 저장소가 막힌 환경이면 이번 세션만 진행하고 버린다
  }
}

const progress = (character: Character) => character.activeSeconds + character.killXp;
const lastJobChange = (character: Character) => Math.max(0, ...character.jobHistory.map((entry) => entry.at));
/** 갈래를 고르거나 다시 고르기에 답한 쪽 */
const branchSettled = (character: Character) => character.jobBranch !== null && !character.freeJobChange;

/**
 * 갈래는 더 자란 쪽이 아니라 마지막으로 정한 쪽을 따른다. 한쪽에서 갈래를 바꾸고 다른 쪽에서 사냥만 더 했으면
 * 바꾼 갈래가 남아야 하고, 한쪽에서 다시 고르기에 답했으면 다른 쪽에서 또 묻지 않아야 한다
 */
function branchSource(winner: Character, other: Character): Character {
  if (other.jobLine !== winner.jobLine) return winner;
  if (lastJobChange(other) !== lastJobChange(winner)) return lastJobChange(other) > lastJobChange(winner) ? other : winner;
  if (!branchSettled(winner) && branchSettled(other)) return other;
  return winner;
}

/** 같은 때 같은 갈래로 바꾼 기록은 하나로 친다 */
function mergeJobHistory(a: JobChange[], b: JobChange[]): JobChange[] {
  const seen = new Set<string>();
  return [...a, ...b]
    .filter((entry) => {
      const key = `${entry.at}|${entry.from}|${entry.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((x, y) => x.at - y.at);
}

/**
 * 파일 저장(file)과 localStorage 저장(local)을 합친다. 개발 빌드와 배포 앱이 서로 다른 localStorage 를 써서
 * 양쪽에 따로 만든 캐릭터가 있을 수 있다. 같은 캐릭터(id)가 양쪽에 있으면 더 많이 자란 쪽을 쓰고 옷장은 합친다.
 * 고른 캐릭터와 소리 끄기는 파일 쪽을 먼저 본다
 */
export function mergeRosters(file: Roster | null, local: Roster): Roster {
  const fileCharacters = file?.characters ?? [];
  const localById = new Map(local.characters.map((character) => [character.id, character]));
  const merged = fileCharacters.map((fromFile): Character => {
    const fromLocal = localById.get(fromFile.id);
    if (!fromLocal) return fromFile;
    const winner = progress(fromLocal) > progress(fromFile) ? fromLocal : fromFile;
    const other = winner === fromFile ? fromLocal : fromFile;
    const branchSide = branchSource(winner, other);
    // 사냥 스킬·보스 지정은 메소처럼 더 자란 쪽 것을 쓴다. 덜 자란 쪽 지정은 이미 써 버린 것일 수 있다.
    // 전직 날짜·갈래를 바꾼 기록은 한쪽에만 적혀 있을 수 있어 합친다
    return {
      ...winner,
      // 시대는 만들 때 정해 바뀌지 않는다. 지금 시대는 칸이 없을 때 채우는 값이라 양쪽이 다르면 클래식 쪽을 따른다
      era: fromFile.era === 'classic' || fromLocal.era === 'classic' ? 'classic' : 'current',
      jobBranch: branchSide.jobBranch,
      freeJobChange: branchSide.freeJobChange,
      // 갈래를 다른 쪽에서 가져오면 고른 사냥 스킬이 그 갈래 것이 아닐 수 있다
      huntSkillId: branchSide.jobBranch === winner.jobBranch ? winner.huntSkillId : null,
      wardrobe: [...new Set([...fromFile.wardrobe, ...fromLocal.wardrobe])],
      // 컬렉션은 한쪽에서만 얻은 것도 남게 합친다. 입은 것은 메소처럼 더 자란 쪽 것이다
      equipOwned: [...new Set([...fromFile.equipOwned, ...fromLocal.equipOwned])],
      equipGifts: [...new Set([...fromFile.equipGifts, ...fromLocal.equipGifts])],
      equipPity: mergeEquipPity(fromFile.equipPity, fromLocal.equipPity),
      // 의자도 컬렉션처럼 합치고 고른 의자는 더 자란 쪽 것이다
      chairOwned: [...new Set([...fromFile.chairOwned, ...fromLocal.chairOwned])],
      advancedAt: mergeAdvancements(fromFile.advancedAt, fromLocal.advancedAt),
      jobHistory: mergeJobHistory(fromFile.jobHistory, fromLocal.jobHistory),
      // 한쪽에서라도 알렸으면 다시 알리지 않는다
      jobChangeHintShown: fromFile.jobChangeHintShown || fromLocal.jobChangeHintShown,
    };
  });
  const fileIds = new Set(fileCharacters.map((character) => character.id));
  const characters = [...merged, ...local.characters.filter((character) => !fileIds.has(character.id))];
  const exists = (id: string | null | undefined) => characters.some((character) => character.id === id);
  const fileSelectedId = file?.selectedId ?? null;
  const selectedId = exists(fileSelectedId) ? fileSelectedId : exists(local.selectedId) ? local.selectedId : null;
  return { version: 2, characters, selectedId, muted: file ? file.muted : local.muted };
}
