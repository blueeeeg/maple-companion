import { describe, expect, it } from 'vitest';
import { CLASSIC_ITEM_IDS } from '../maple/classicItems';
import { CLASSIC_BOSSES } from './bosses.classic';
import {
  CLASSIC_EQUIP_ENTRIES,
  EQUIP_ENTRIES,
  type EquipEntry,
  awardBossDrops,
  collectionProgress,
  entryItems,
  equipEntries,
  equipEntryOf,
  equipItemName,
  equipShopItems,
  grantLevelGifts,
  howToGet,
  isEquipItem,
  normalizeEquipData,
} from './equipment';

const itemsOf = (entry: EquipEntry) =>
  entry.items.kind === 'fixed'
    ? entry.items.ids
    : Object.values(entry.items.kind === 'line' ? entry.items.byLine : entry.items.byType);
const always = () => 0;

describe('클래식 장비 컬렉션', () => {
  it('클래식 표의 아이템은 모두 v83 에 있다', () => {
    expect(CLASSIC_EQUIP_ENTRIES.flatMap(itemsOf).filter((id) => !CLASSIC_ITEM_IDS.has(id))).toEqual([]);
  });

  it('보스 드롭은 클래식 보스 것이다', () => {
    const bossIds = new Set(CLASSIC_BOSSES.map((boss) => boss.id));
    CLASSIC_EQUIP_ENTRIES.forEach(({ source }) => {
      if (source.kind === 'boss') expect(bossIds.has(source.bossId)).toBe(true);
    });
  });

  it('그 시대 대표 장비가 있다', () => {
    const names = CLASSIC_EQUIP_ENTRIES.map(({ name }) => name);
    expect(names).toEqual(expect.arrayContaining(['자쿰의 투구', '노가다 목장갑', '메이플 무기', '발록 무기', '타임리스 무기']));
    expect(names).not.toContain('앱솔랩스 무기');
  });

  it('지금 시대 표는 그대로다', () => {
    expect(equipEntries()).toBe(EQUIP_ENTRIES);
    expect(equipEntries('classic')).toBe(CLASSIC_EQUIP_ENTRIES);
    expect(equipEntryOf(1003112)?.name).toBe('카오스 자쿰의 투구');
    expect(equipEntryOf(1003112, 'classic')).toBeNull();
    expect(isEquipItem(1002430)).toBe(true);
    expect(equipItemName(1002430)).toBe('자쿰의 투구3');
  });

  it('메이플 무기(Lv43)는 갈래 무기로, 3차부터 든 무기와 같으면 마법사는 다른 지팡이를 받는다', () => {
    const maple = CLASSIC_EQUIP_ENTRIES.find((entry) => entry.id === 'maple43')!;
    expect(entryItems(maple, 'hero', 'classic')).toEqual([1302030]);
    // 썬콜은 메이플 완드가 없어 메이플 라마 스태프를 받는다
    expect(entryItems(maple, 'iceLightning', 'classic')).toEqual([1382012]);
    // 비숍은 메이플 라마 스태프를 이미 3차부터 든다
    expect(entryItems(maple, 'bishop', 'classic')).toEqual([]);
  });

  it('레벨 선물은 클래식 표대로 준다', () => {
    const character = { equipOwned: [], equipGifts: [] };
    const gifts = grantLevelGifts(character, 120, 'hero', 'classic');
    expect(gifts).toEqual(expect.arrayContaining([1102166, 1302030, 1102031, 1302081]));
    expect(gifts).not.toContain(1302064);
  });

  it('클래식 자쿰은 클래식 아이템을 떨어뜨린다', () => {
    const character = { equipOwned: [] as number[], equipPity: {}, chairOwned: [] as number[], mountOwned: [] as number[] };
    const drops = awardBossDrops(character, 8800000, 'iceLightning', false, always, 'classic');
    expect(drops).toEqual(expect.arrayContaining([1002357, 1372049, 1002430]));
    expect(drops).not.toContain(1003112);
  });

  it('얻는 법에는 클래식 보스 이름을 적는다', () => {
    const griffey = CLASSIC_EQUIP_ENTRIES.find((entry) => entry.id === 'blueDragonBabuta')!;
    expect(howToGet(griffey, {}, 'classic')).toBe('그리프 처치 · 낮은 확률 · 0/10');
  });

  it('상점은 v83 에 있는 것만 판다', () => {
    const shop = equipShopItems('classic').map(({ id }) => id);
    expect(shop).toContain(1082002);
    expect(shop).not.toContain(1022097);
  });

  it('1단계 클래식 캐릭터가 지금 시대 표로 모은 것은 가진 채로 두고 클래식 표에 없는 것은 벗는다', () => {
    const saved = { equipOwned: [1003112, 1002357, 1302064], equipWorn: { cap: 1003112, weapon: 1302064 }, equipGifts: [1302064] };
    const classic = normalizeEquipData(saved, 'classic');
    expect(classic.equipOwned).toEqual([1003112, 1002357, 1302064]);
    expect(classic.equipWorn).toEqual({});
    const current = normalizeEquipData(saved);
    expect(current.equipWorn).toEqual({ cap: 1003112, weapon: 1302064 });
    const zakum = normalizeEquipData({ equipOwned: [1002357], equipWorn: { cap: 1002357 } }, 'classic');
    expect(zakum.equipWorn).toEqual({ cap: 1002357 });
  });

  it('컬렉션 셈은 그 시대 표로 센다', () => {
    const owned = [1002357, 1002430];
    expect(collectionProgress(owned, 'hero', 'classic').owned).toBe(2);
    expect(collectionProgress(owned, 'hero', 'classic').total).toBe(
      CLASSIC_EQUIP_ENTRIES.filter((entry) => entryItems(entry, 'hero', 'classic').length > 0).length,
    );
  });
});
