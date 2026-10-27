import { CHAIRS, chairProgress } from '../game/chairs';
import {
  EQUIP_ENTRIES,
  type EquipEntry,
  type EquipPity,
  chairHowToGet,
  collectionProgress,
  entryItems,
  mountHowToGet,
} from '../game/equipment';
import type { JobPath } from '../game/jobs';
import { MOUNTS, mountProgress } from '../game/mounts';

export type EquipTab = 'all' | 'boss' | 'level' | 'shop' | 'chair' | 'mount';
/** 장비 대신 하나를 골라 쓰는 탭 */
export type PickTab = 'chair' | 'mount';

export const EQUIP_TABS: [EquipTab, string][] = [
  ['all', '전체'],
  ['boss', '보스'],
  ['level', '레벨'],
  ['shop', '상점'],
  ['chair', '의자'],
  ['mount', '탈것'],
];

export const isPickTab = (tab: EquipTab): tab is PickTab => tab === 'chair' || tab === 'mount';

/** 장비 탭에 늘어놓을 칸. 이 캐릭터가 못 모으는 칸은 빼고, 의자·탈것 탭에는 장비가 없다 */
export function tabEntries(tab: EquipTab, path: JobPath | null): EquipEntry[] {
  if (isPickTab(tab)) return [];
  return EQUIP_ENTRIES.filter((entry) => entryItems(entry, path).length > 0 && (tab === 'all' || entry.source.kind === tab));
}

/** 의자·탈것 탭 칸. 하나만 골라 쓴다 */
export interface PickCell {
  itemId: number;
  name: string;
  owned: boolean;
  selected: boolean;
  note: string;
  tone: 'equipped' | 'owned' | 'locked';
}

/** 의자 탭 칸. 없는 의자는 그림자에 얻는 법을 적는다 */
export function chairCells(owned: number[], selected: number | null, pity: EquipPity): PickCell[] {
  return CHAIRS.map((chair) => {
    const { id: itemId, name } = chair;
    if (!owned.includes(itemId)) return { itemId, name, owned: false, selected: false, note: chairHowToGet(chair, pity), tone: 'locked' };
    if (selected === itemId) return { itemId, name, owned: true, selected: true, note: '앉는 의자 · 쉴 때 앉아요', tone: 'equipped' };
    return { itemId, name, owned: true, selected: false, note: '보유 · 의자', tone: 'owned' };
  });
}

/** 탈것 탭 칸. 없는 탈것은 레벨 선물이나 보스 천장을 적는다 */
export function mountCells(owned: number[], selected: number | null, pity: EquipPity): PickCell[] {
  return MOUNTS.map((mount) => {
    const { id: itemId, name } = mount;
    if (!owned.includes(itemId)) return { itemId, name, owned: false, selected: false, note: mountHowToGet(mount, pity), tone: 'locked' };
    if (selected === itemId) return { itemId, name, owned: true, selected: true, note: '타는 탈것 · 돌아다닐 때 타요', tone: 'equipped' };
    return { itemId, name, owned: true, selected: false, note: '보유 · 탈것', tone: 'owned' };
  });
}

/** 왼쪽 이름표의 셈. 의자·탈것은 장비 컬렉션에 섞지 않고 그 탭에서만 따로 센다 */
export function tabCount(
  tab: EquipTab,
  state: { owned: number[]; path: JobPath | null; chairOwned: number[]; mountOwned: number[] },
): string {
  if (tab === 'chair') {
    const progress = chairProgress(state.chairOwned);
    return `의자 ${progress.owned}/${progress.total}`;
  }
  if (tab === 'mount') {
    const progress = mountProgress(state.mountOwned);
    return `탈것 ${progress.owned}/${progress.total}`;
  }
  const progress = collectionProgress(state.owned, state.path);
  return `컬렉션 ${progress.owned}/${progress.total}`;
}
