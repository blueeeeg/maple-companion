import { describe, expect, it } from 'vitest';
import { DATA_SOURCES, characterItemSource } from '../maple/api';
import { CLASSIC_CASH_ITEM_IDS } from '../maple/classicCashItems';
import { type CashItem, cashItemsForSale } from './cashShop';

const [v83Item] = [...CLASSIC_CASH_ITEM_IDS];
// KMS 389 에만 있는 최근 캐시 모자
const newItem = 1005980;

describe('클래식 캐시샵', () => {
  const list: CashItem[] = [
    { id: v83Item, name: '옛 모자', requiredGender: 2 },
    { id: newItem, name: '새 모자', requiredGender: 2 },
    { id: 1001000, name: '여자 모자', requiredGender: 1 },
  ];

  it('클래식 캐릭터에게는 v83 에도 있는 캐시 아이템만 판다', () => {
    expect(CLASSIC_CASH_ITEM_IDS.has(newItem)).toBe(false);
    expect(cashItemsForSale(list, 'male', 'classic').map(({ id }) => id)).toEqual([v83Item]);
  });

  it('지금 시대 캐릭터에게는 그대로 판다', () => {
    expect(cashItemsForSale(list, 'male').map(({ id }) => id)).toEqual([v83Item, newItem]);
    expect(cashItemsForSale(list, 'female').map(({ id }) => id)).toEqual([v83Item, newItem, 1001000]);
  });

  it('클래식 캐릭터는 v83 캐시 아이템을 v83 그림으로, 1단계 때 산 새 아이템은 지금 판 그림으로 그린다', () => {
    expect(characterItemSource(v83Item, 'classic')).toBe(DATA_SOURCES.classic);
    expect(characterItemSource(newItem, 'classic')).toBe(DATA_SOURCES.current);
    expect(characterItemSource(v83Item)).toBe(DATA_SOURCES.current);
  });
});
