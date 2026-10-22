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

export function parseRoster(
  rosterText: string | null,
  legacyText: string | null,
  globalActiveSeconds: number,
  id = newCharacterId(),
): Roster {
  if (rosterText) {
    const parsed = JSON.parse(rosterText) as Partial<Roster>;
    const characters = (parsed.characters ?? []).map(
      (character): Character => {
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
      },
    );
    return { ...emptyRoster(), ...parsed, characters };
  }
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
