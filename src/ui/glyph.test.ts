import { describe, expect, it } from 'vitest';
import { isQuickKeyBlue, keyOutBackground } from './glyph';

const BLUE = [0x00, 0x77, 0xcc, 255];
const OUTLINE = [0xaa, 0xdd, 0xee, 255];
const PINK = [0xff, 0x66, 0x99, 255];
const CYAN = [0x66, 0xee, 0xff, 255];

function image(rows: number[][][]): Uint8ClampedArray {
  return new Uint8ClampedArray(rows.flat(2));
}

describe('버튼 그림에서 바탕 빼기', () => {
  it('파란 바탕만 지우고 그림의 상자를 돌려준다', () => {
    const pixels = image([
      [BLUE, BLUE, BLUE, BLUE],
      [BLUE, OUTLINE, PINK, BLUE],
      [BLUE, OUTLINE, CYAN, BLUE],
      [BLUE, BLUE, BLUE, BLUE],
    ]);
    const box = keyOutBackground(pixels, 4, { x: 0, y: 0, width: 4, height: 4 }, isQuickKeyBlue);
    expect(box).toEqual({ x: 1, y: 1, width: 2, height: 2 });
    expect(pixels[3]).toBe(0);
    // 청록 막대·하늘색 테두리는 파란 바탕이 아니다
    expect(pixels[(2 * 4 + 2) * 4 + 3]).toBe(255);
    expect(pixels[(1 * 4 + 1) * 4 + 3]).toBe(255);
  });

  it('area 밖은 그림이어도 지운다', () => {
    const pixels = image([[PINK, PINK]]);
    expect(keyOutBackground(pixels, 2, { x: 1, y: 0, width: 1, height: 1 }, isQuickKeyBlue)).toEqual({ x: 1, y: 0, width: 1, height: 1 });
    expect(pixels[3]).toBe(0);
  });

  it('남는 것이 없으면 null', () => {
    expect(keyOutBackground(image([[BLUE]]), 1, { x: 0, y: 0, width: 1, height: 1 }, isQuickKeyBlue)).toBeNull();
  });
});
