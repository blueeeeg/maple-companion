import { describe, expect, it } from 'vitest';
import { type Pixels, alignOverlay, frontRenderLayers } from './layers';

describe('캐릭터를 가리는 레이어', () => {
  it('다음 맵 레이어의 오브젝트부터 마지막 레이어의 타일까지다', () => {
    expect(frontRenderLayers(5)).toEqual([12, 13, 14, 15]);
    expect(frontRenderLayers(0)[0]).toBe(2);
  });

  it('맨 위 레이어에 서 있으면 가리는 것이 없다', () => {
    expect(frontRenderLayers(7)).toEqual([]);
  });
});

function noise(width: number, height: number, seed: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  let state = seed;
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      state = (state * 1103515245 + 12345) % 2147483648;
      data[index + channel] = state & 0xff;
    }
    data[index + 3] = 255;
  }
  return { width, height, data };
}

/** base 의 (left, top) 부터 잘라 낸 그림. 가운데 줄무늬만 불투명하게 남긴다 */
function cutOut(base: Pixels, left: number, top: number, width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x % 7 > 3) continue;
      const from = ((top + y) * base.width + left + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) data[(y * width + x) * 4 + channel] = base.data[from + channel];
    }
  }
  return { width, height, data };
}

describe('앞 레이어 위치 맞추기', () => {
  const base = noise(200, 120, 3);

  it('어림 위치가 몇 픽셀 틀려도 정확한 자리를 찾는다', () => {
    const overlay = cutOut(base, 37, 52, 90, 40);
    expect(alignOverlay(base, overlay, { x: 30, y: 58 }, 10)).toEqual({ x: 37, y: 52 });
  });

  it('찾는 범위 안에 맞는 자리가 없으면 null', () => {
    const overlay = cutOut(base, 37, 52, 90, 40);
    expect(alignOverlay(base, overlay, { x: 0, y: 0 }, 5)).toBeNull();
  });

  it('다른 그림이면 null', () => {
    const overlay = cutOut(noise(200, 120, 99), 37, 52, 90, 40);
    expect(alignOverlay(base, overlay, { x: 37, y: 52 }, 5)).toBeNull();
  });
});
