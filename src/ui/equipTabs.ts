import { CHAIRS, type Chair, chairProgress } from '../game/chairs';
import { EQUIP_ENTRIES, type EquipEntry, type EquipPity, chairHowToGet, collectionProgress, entryItems } from '../game/equipment';
import type { JobPath } from '../game/jobs';

export type EquipTab = 'all' | 'boss' | 'level' | 'shop' | 'chair';

export const EQUIP_TABS: [EquipTab, string][] = [
  ['all', '전체'],
  ['boss', '보스'],
  ['level', '레벨'],
  ['shop', '상점'],
  ['chair', '의자'],
];

/** 장비 탭에 늘어놓을 칸. 이 캐릭터가 못 모으는 칸은 빼고, 의자 탭에는 장비가 없다 */
export function tabEntries(tab: EquipTab, path: JobPath | null): EquipEntry[] {
  if (tab === 'chair') return [];
  return EQUIP_ENTRIES.filter((entry) => entryItems(entry, path).length > 0 && (tab === 'all' || entry.source.kind === tab));
}

export interface ChairCell {
  chair: Chair;
  owned: boolean;
  selected: boolean;
  note: string;
  tone: 'equipped' | 'owned' | 'locked';
}

/** 의자 탭 칸. 없는 의자는 그림자에 얻는 법을 적는다 */
export function chairCells(owned: number[], selected: number | null, pity: EquipPity): ChairCell[] {
  return CHAIRS.map((chair) => {
    if (!owned.includes(chair.id)) return { chair, owned: false, selected: false, note: chairHowToGet(chair, pity), tone: 'locked' };
    if (selected === chair.id) return { chair, owned: true, selected: true, note: '앉는 의자 · 쉴 때 앉아요', tone: 'equipped' };
    return { chair, owned: true, selected: false, note: '보유 · 의자', tone: 'owned' };
  });
}

/** 왼쪽 이름표의 셈. 의자는 장비 컬렉션에 섞지 않고 의자 탭에서만 따로 센다 */
export function tabCount(tab: EquipTab, state: { owned: number[]; path: JobPath | null; chairOwned: number[] }): string {
  const progress = tab === 'chair' ? chairProgress(state.chairOwned) : collectionProgress(state.owned, state.path);
  return `${tab === 'chair' ? '의자' : '컬렉션'} ${progress.owned}/${progress.total}`;
}
