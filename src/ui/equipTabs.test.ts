import { describe, expect, it } from 'vitest';
import { EQUIP_TABS, chairCells, mountCells, tabCount, tabEntries } from './equipTabs';

const PINK_BEAN = 8820001;
const PINK_BEAN_CHAIR = 3010225;
const BLACK_BEAN_CHAIR = 3010592;
const HOG = 1902000;
const BALROG = 1932010;
const PINK_BEAN_MOUNT = 1932323;

describe('장비 창 탭', () => {
  it('전체·보스·레벨·상점에 의자·탈것 탭이 붙는다', () => {
    expect(EQUIP_TABS.map(([, label]) => label)).toEqual(['전체', '보스', '레벨', '상점', '의자', '탈것']);
  });

  it('장비 탭은 그 캐릭터가 모을 수 있는 칸만, 의자·탈것 탭은 장비가 없다', () => {
    expect(tabEntries('all', 'hero')).toHaveLength(87);
    expect(tabEntries('boss', 'hero')).toHaveLength(67);
    expect(tabEntries('level', 'hero')).toHaveLength(8);
    expect(tabEntries('shop', 'hero')).toHaveLength(12);
    expect(tabEntries('boss', 'bishop')).toHaveLength(71);
    expect(tabEntries('chair', 'hero')).toEqual([]);
    expect(tabEntries('mount', 'hero')).toEqual([]);
  });

  it('의자 칸은 가진 것·고른 것·없는 것을 나눠 적는다', () => {
    const cells = chairCells([PINK_BEAN_CHAIR, BLACK_BEAN_CHAIR], BLACK_BEAN_CHAIR, { [PINK_BEAN]: { rare: 4 } });
    expect(cells).toHaveLength(23);
    const of = (id: number) => cells.find((cell) => cell.itemId === id)!;
    expect(of(PINK_BEAN_CHAIR)).toMatchObject({ owned: true, selected: false, tone: 'owned', note: '보유 · 의자' });
    expect(of(BLACK_BEAN_CHAIR)).toMatchObject({ owned: true, selected: true, tone: 'equipped', note: '앉는 의자 · 쉴 때 앉아요' });
    expect(of(3010455)).toMatchObject({ owned: false, tone: 'locked', note: '자쿰 처치 · 낮은 확률 · 0/10' });
  });

  it('없는 의자는 그 보스의 레어 천장을 적는다', () => {
    const cells = chairCells([], null, { [PINK_BEAN]: { rare: 7, veryRare: 20 } });
    expect(cells.find((cell) => cell.itemId === PINK_BEAN_CHAIR)!.note).toBe('핑크빈 처치 · 낮은 확률 · 7/10');
  });

  it('탈것 칸은 레벨 선물·보스 천장·고른 것을 적는다', () => {
    const cells = mountCells([HOG, BALROG], BALROG, { [PINK_BEAN]: { rare: 7 } });
    const of = (id: number) => cells.find((cell) => cell.itemId === id)!;
    expect(of(HOG)).toMatchObject({ name: '멧돼지', owned: true, selected: false, tone: 'owned', note: '보유 · 탈것' });
    expect(of(BALROG)).toMatchObject({ owned: true, selected: true, tone: 'equipped', note: '타는 탈것 · 돌아다닐 때 타요' });
    expect(of(1902001)).toMatchObject({ owned: false, tone: 'locked', note: 'Lv.100 달성 선물' });
    expect(of(PINK_BEAN_MOUNT).note).toBe('핑크빈 처치 · 낮은 확률 · 7/10');
  });

  it('왼쪽 이름표는 의자·탈것 탭에서만 그것을 센다', () => {
    const state = { owned: [1002357], path: 'hero' as const, chairOwned: [PINK_BEAN_CHAIR], mountOwned: [HOG] };
    expect(tabCount('all', state)).toBe('컬렉션 1/87');
    expect(tabCount('chair', state)).toBe('의자 1/23');
    expect(tabCount('mount', state)).toBe('탈것 1/9');
  });
});
