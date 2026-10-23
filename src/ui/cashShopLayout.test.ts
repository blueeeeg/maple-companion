import { describe, expect, it } from 'vitest';
import { CASH_CELL, CASH_CELL_MIN_GAP, cashDetail, fitCashGrid, pageContaining } from './cashShopLayout';

describe('아이템 칸 배치', () => {
  it('360×230 창의 칸 영역(214×181)은 4열 × 3행, 12개씩이다', () => {
    expect(fitCashGrid(214, 181)).toEqual({ columns: 4, rows: 3, pageSize: 12, columnGap: 6, rowGap: 10 });
  });

  it('창이 커지면 칸 크기는 그대로 두고 칸 수를 늘린다', () => {
    const small = fitCashGrid(214, 181);
    const large = fitCashGrid(394, 296);
    expect(large.columns).toBeGreaterThan(small.columns);
    expect(large.rows).toBeGreaterThan(small.rows);
    expect(large.pageSize).toBe(large.columns * large.rows);
  });

  it('칸과 간격이 영역 안에 들어가고, 가장자리에도 최소 간격이 남는다', () => {
    [
      [214, 181],
      [394, 296],
      [600, 400],
      [97, 97],
    ].forEach(([width, height]) => {
      const fit = fitCashGrid(width, height);
      expect(fit.columns * CASH_CELL + (fit.columns + 1) * fit.columnGap).toBeLessThanOrEqual(width);
      expect(fit.rows * CASH_CELL + (fit.rows + 1) * fit.rowGap).toBeLessThanOrEqual(height);
      expect(fit.columnGap).toBeGreaterThanOrEqual(CASH_CELL_MIN_GAP);
      expect(fit.rowGap).toBeGreaterThanOrEqual(CASH_CELL_MIN_GAP);
      expect(Number.isInteger(fit.columnGap) && Number.isInteger(fit.rowGap)).toBe(true);
    });
  });

  it('칸 하나도 안 들어가는 크기(숨겨 둔 화면 0×0 등)여도 한 칸은 둔다', () => {
    expect(fitCashGrid(0, 0)).toMatchObject({ columns: 1, rows: 1, pageSize: 1 });
  });
});

describe('페이지 크기가 바뀔 때', () => {
  it('보던 아이템이 든 페이지로 옮긴다', () => {
    // 12개씩 넷째 페이지의 첫 아이템(36번) → 35개씩이면 둘째 페이지
    expect(pageContaining(36, 35)).toBe(1);
    expect(pageContaining(36, 12)).toBe(3);
    expect(pageContaining(0, 35)).toBe(0);
  });

  it('창을 키웠다 되돌려도 같은 페이지로 돌아온다', () => {
    const anchor = 2 * 12;
    expect(pageContaining(anchor, 35)).toBe(0);
    expect(pageContaining(anchor, 12)).toBe(2);
  });
});

describe('아이템 설명 줄', () => {
  const hat = { id: 1000000, name: '파란색 털모자' };

  it('안 산 아이템은 이름과 값을 보여 준다', () => {
    expect(cashDetail(hat, { owned: false, equipped: false })).toEqual({
      name: '파란색 털모자',
      note: '25,000 메소',
      tone: 'price',
    });
  });

  it('산 아이템은 보유, 입은 아이템은 착용 중이다', () => {
    expect(cashDetail(hat, { owned: true, equipped: false })).toMatchObject({ note: '보유', tone: 'owned' });
    expect(cashDetail(hat, { owned: true, equipped: true })).toMatchObject({ note: '착용 중', tone: 'equipped' });
  });

  it('살 수 없는 까닭이 있으면 값 대신 그 까닭을 보여 준다', () => {
    expect(cashDetail(hat, { owned: false, equipped: false, problem: '메소 3,000 부족' })).toEqual({
      name: '파란색 털모자',
      note: '메소 3,000 부족',
      tone: 'problem',
    });
  });

  it('무기 외형은 무기 값(100,000 메소)이다', () => {
    expect(cashDetail({ id: 1702000, name: '캐시 무기' }, { owned: false, equipped: false }).note).toBe('100,000 메소');
  });
});
