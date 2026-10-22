import { normalizeAppearance } from './appearance';
import { normalizeCashData } from './cashShop';
import {
  type Character,
  type LegacySave,
  type Roster,
  createCharacter,
  emptyRoster,
  legacyHuntProgress,
  migrateLegacySave,
} from './characters';

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
    return {
      ...createCharacter(character.id, character.name, appearance),
      // 몬스터 주기 설정이 생기기 전 저장에는 사냥 진행이 마리 수로만 있다
      ...(character.huntSeconds === undefined ? legacyHuntProgress(character.encountersResolved) : {}),
      ...character,
      appearance,
      ...normalizeCashData(character),
    };
  });
  return { ...emptyRoster(), ...parsed, characters };
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
    return { ...winner, wardrobe: [...new Set([...fromFile.wardrobe, ...fromLocal.wardrobe])] };
  });
  const fileIds = new Set(fileCharacters.map((character) => character.id));
  const characters = [...merged, ...local.characters.filter((character) => !fileIds.has(character.id))];
  const exists = (id: string | null | undefined) => characters.some((character) => character.id === id);
  const fileSelectedId = file?.selectedId ?? null;
  const selectedId = exists(fileSelectedId) ? fileSelectedId : exists(local.selectedId) ? local.selectedId : null;
  return { version: 2, characters, selectedId, muted: file ? file.muted : local.muted };
}
