import { describe, expect, it } from 'vitest';
import { BASE_VIEW, frameOffset, viewportFor } from './viewport';

describe('창 배율 → 화면 크기', () => {
  it('100% 이상은 배율만큼 넓은 화면을 1배로 보여 준다', () => {
    expect(viewportFor(1)).toEqual({ view: { width: 360, height: 230 }, zoom: 1 });
    expect(viewportFor(1.5)).toEqual({ view: { width: 540, height: 345 }, zoom: 1 });
    expect(viewportFor(2)).toEqual({ view: { width: 720, height: 460 }, zoom: 1 });
  });

  it('창 크기와 같게 반올림한다(Rust 의 f64::round 와 같다)', () => {
    expect(viewportFor(1.25).view).toEqual({ width: 450, height: 288 });
  });

  it('100% 아래는 360×230 을 통째로 줄인다', () => {
    expect(viewportFor(0.75)).toEqual({ view: BASE_VIEW, zoom: 0.75 });
  });

  it('값이 이상하면 100% 로 본다', () => {
    expect(viewportFor(0)).toEqual({ view: BASE_VIEW, zoom: 1 });
    expect(viewportFor(Number.NaN)).toEqual({ view: BASE_VIEW, zoom: 1 });
  });
});

describe('360×230 창을 가운데에 둘 자리', () => {
  it('남는 폭의 절반을 정수로 내린다', () => {
    expect(frameOffset({ width: 720, height: 460 })).toEqual({ x: 180, y: 115 });
    expect(frameOffset({ width: 450, height: 288 })).toEqual({ x: 45, y: 29 });
  });

  it('기준 크기 이하면 옮기지 않는다', () => {
    expect(frameOffset(BASE_VIEW)).toEqual({ x: 0, y: 0 });
  });
});
