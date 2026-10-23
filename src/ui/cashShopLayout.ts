// 캐시샵 화면 배치·글자를 정하는 순수 함수. DOM 없이 테스트한다
import { cashPrice } from '../game/cashShop';

/** 원작 캐시 인벤토리 칸(CSInventory/backgrnd 의 46×46 칸)을 원본 크기로 쓴다 */
export const CASH_CELL = 46;
/** 칸 사이와 가장자리에 적어도 이만큼은 띄운다 */
export const CASH_CELL_MIN_GAP = 4;

export interface CashGridFit {
  columns: number;
  rows: number;
  pageSize: number;
  /** 칸 사이·가장자리 간격. 남는 자리를 고르게 나눈 정수라 칸이 정수 픽셀에 놓인다 */
  columnGap: number;
  rowGap: number;
}

/** 한 방향에 들어가는 칸 수와 간격. 가장자리에도 칸 사이만큼 띄운다 */
function fitAxis(available: number, cell: number, minGap: number): { count: number; gap: number } {
  const count = Math.max(1, Math.floor((available - minGap) / (cell + minGap)));
  const gap = Math.max(0, Math.floor((available - count * cell) / (count + 1)));
  return { count, gap };
}

/**
 * 아이템 칸 영역 크기에서 열·행 수와 한 페이지 개수를 정한다. 창이 커지면 칸 크기는 그대로 두고 칸 수를 늘린다.
 * 360×230 창에서는 4열 × 3행이다
 */
export function fitCashGrid(width: number, height: number, cell = CASH_CELL, minGap = CASH_CELL_MIN_GAP): CashGridFit {
  const across = fitAxis(width, cell, minGap);
  const down = fitAxis(height, cell, minGap);
  return {
    columns: across.count,
    rows: down.count,
    pageSize: across.count * down.count,
    columnGap: across.gap,
    rowGap: down.gap,
  };
}

/** index 번째 아이템이 들어 있는 페이지. 한 페이지 개수가 바뀌어도 보던 아이템이 있는 페이지로 옮길 때 쓴다 */
export function pageContaining(index: number, pageSize: number): number {
  return Math.floor(Math.max(0, index) / Math.max(1, pageSize));
}

export type CashDetailTone = 'price' | 'owned' | 'equipped' | 'problem';

export interface CashDetail {
  name: string;
  note: string;
  tone: CashDetailTone;
}

const won = (meso: number) => meso.toLocaleString();

/**
 * 미리보기 아래 한 줄에 보여 줄 아이템 이름과 값. 칸에는 아이콘만 두고 이름·값은 여기 한 번만 쓴다.
 * problem(살·입을 수 없는 까닭)은 고른 아이템에만 넘긴다
 */
export function cashDetail(
  item: { id: number; name: string },
  { owned, equipped, problem = null }: { owned: boolean; equipped: boolean; problem?: string | null },
): CashDetail {
  if (problem) return { name: item.name, note: problem, tone: 'problem' };
  if (equipped) return { name: item.name, note: '착용 중', tone: 'equipped' };
  if (owned) return { name: item.name, note: '보유', tone: 'owned' };
  return { name: item.name, note: `${won(cashPrice(item.id) ?? 0)} 메소`, tone: 'price' };
}
