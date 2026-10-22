import { describe, expect, it } from 'vitest';
import { type GlyphMetrics, layoutDamage } from './basicEff';

// NoRed1(첫 자리)·NoRed0(나머지) 의 0·1 크기와 원점
const large: GlyphMetrics[] = [];
const small: GlyphMetrics[] = [];
large[0] = { width: 37, origin: { x: 18, y: 37 } };
large[1] = { width: 25, origin: { x: 12, y: 36 } };
small[0] = { width: 31, origin: { x: 15, y: 32 } };
small[1] = { width: 22, origin: { x: 11, y: 31 } };
const font = { first: large, rest: small };

const span = (placed: { glyph: GlyphMetrics; x: number }[]) => ({
  left: placed[0].x - placed[0].glyph.origin.x,
  right: placed[placed.length - 1].x + placed[placed.length - 1].glyph.width - placed[placed.length - 1].glyph.origin.x,
});

describe('대미지 숫자 배치', () => {
  it('첫 자리는 큰 숫자, 나머지는 작은 숫자로 찍는다', () => {
    const placed = layoutDamage(100, font, 8);
    expect(placed.map((each) => each.glyph)).toEqual([large[1], small[0], small[0]]);
  });

  it('이웃한 숫자는 그림 가장자리가 겹침 폭만큼 겹친다', () => {
    const [one, zero] = layoutDamage(10, font, 8);
    const oneRight = one.x + one.glyph.width - one.glyph.origin.x;
    const zeroLeft = zero.x - zero.glyph.origin.x;
    expect(oneRight - zeroLeft).toBe(8);
  });

  it('줄 전체 그림 폭의 가운데가 0 에 온다', () => {
    const { left, right } = span(layoutDamage(1010, font, 8));
    expect(left + right).toBeCloseTo(0);
  });

  it('한 자리면 그 숫자 그림 가운데가 0 이다', () => {
    const [zero] = layoutDamage(0, font, 8);
    expect(zero.glyph).toBe(large[0]);
    expect(zero.x - zero.glyph.origin.x).toBe(-37 / 2);
  });

  it('소수점은 버린다', () => {
    expect(layoutDamage(10.9, font, 8)).toHaveLength(2);
  });
});
