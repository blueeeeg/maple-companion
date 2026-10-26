import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_PASSES,
  type Pixels,
  alignOverlay,
  exactCalibrationFrom,
  frontRenderLayers,
  ladderRopeMasks,
} from './layers';

describe('캐릭터를 가리는 레이어', () => {
  it('다음 맵 레이어의 오브젝트부터 마지막 레이어의 타일까지다', () => {
    expect(frontRenderLayers(5)).toEqual([12, 13, 14, 15]);
    expect(frontRenderLayers(0)[0]).toBe(2);
  });

  it('맨 위 레이어에 서 있으면 가리는 것이 없다', () => {
    expect(frontRenderLayers(7)).toEqual([]);
  });
});

describe('앞 레이어에서 빼는 사다리·로프 그림', () => {
  const rope = { x: 183, y1: -254, y2: 35, isLadder: false, page: 2 };
  const ladder = { x: 637, y1: -400, y2: -170, isLadder: true, page: 3 };

  it('page 의 오브젝트 레이어에서만 줄 둘레를 레이어 그림 원점 기준으로 지운다', () => {
    const layers = frontRenderLayers(1);
    const masks = ladderRopeMasks([rope, ladder], layers, { x: -1000, y: -500 });
    expect(masks).toHaveLength(layers.length);
    const at = (layer: number) => masks[layers.indexOf(layer)];
    expect(at(4)).toHaveLength(1);
    expect(at(6)).toHaveLength(1);
    expect(masks.flat()).toHaveLength(2);
    const [ropeRect] = at(4);
    // 줄 x 를 가운데에 두고 위 끝 말뚝까지 덮는다
    expect(ropeRect.x + ropeRect.width / 2).toBe(rope.x + 1000);
    expect(ropeRect.y).toBeLessThan(rope.y1 + 500 - 15);
    expect(ropeRect.y + ropeRect.height).toBeGreaterThanOrEqual(rope.y2 + 500);
    // 사다리는 로프보다 넓다
    expect(at(6)[0].width).toBeGreaterThan(ropeRect.width);
  });

  it('page 를 모르거나 캐릭터보다 낮은 page 의 줄은 지우지 않는다', () => {
    const { page: _, ...unknown } = rope;
    expect(ladderRopeMasks([unknown, { ...rope, page: 1 }], frontRenderLayers(1), { x: 0, y: 0 }).flat()).toEqual([]);
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

  it('위 레이어에 일부 가려진 바닥 레이어는 맞는 비율을 낮춰야 찾는다', () => {
    const overlay = cutOut(base, 37, 52, 90, 40);
    // 전체 렌더에서 왼쪽 1/5 이 다른 그림에 덮였다
    const covered = { ...base, data: Uint8ClampedArray.from(base.data) };
    const cover = noise(200, 120, 7).data as Uint8ClampedArray;
    for (let y = 52; y < 92; y += 1) {
      for (let x = 37; x < 55; x += 1) covered.data.set(cover.subarray((y * 200 + x) * 4, (y * 200 + x) * 4 + 4), (y * 200 + x) * 4);
    }
    expect(alignOverlay(covered, overlay, { x: 30, y: 58 }, 10)).toBeNull();
    expect(alignOverlay(covered, overlay, { x: 30, y: 58 }, 10, 0.75)).toEqual({ x: 37, y: 52 });
  });
});

describe('바닥 레이어로 보정 고치기', () => {
  // 전체 렌더에서 월드 (0, 0) 은 그림의 (truth.dx, truth.dy) 다. 바닥 레이어는 y 250~330 띠만 불투명하다
  const truth = { dx: 300, dy: 200 };
  const sky = (width: number, height: number): Pixels => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < data.length; index += 4) data.set([160, 190, 220, 255], index);
    return { width, height, data };
  };

  /** 원점 (minX, minY) 로 받은 레이어 그림. 렌더에 있는 바닥 띠만 같은 색으로 담는다 */
  const layerFrom = (render: Pixels, band: (x: number, y: number) => boolean) => (minX: number, minY: number): Pixels => {
    const width = render.width + 500;
    const height = render.height + 500;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const rx = x + minX + truth.dx;
        const ry = y + minY + truth.dy;
        if (rx < 0 || ry < 0 || rx >= render.width || ry >= render.height || !band(rx, ry)) continue;
        const from = (ry * render.width + rx) * 4;
        data.set((render.data as Uint8ClampedArray).subarray(from, from + 4), (y * width + x) * 4);
      }
    }
    return { width, height, data };
  };

  const render = noise(600, 400, 5);
  const ground = layerFrom(render, (_, y) => y >= 250 && y < 330);

  it('어림이 몇 px 틀리면 좁은 단계에서 맞추고 넓은 원점으로는 받지 않는다', async () => {
    const pads: number[] = [];
    const exact = await exactCalibrationFrom({ dx: 305, dy: 193, score: 1 }, render, 3, async (_, minX, minY) => {
      pads.push(-305 - minX);
      return ground(minX, minY);
    }, 0.75);
    expect(exact).toEqual({ dx: 300, dy: 200, score: 1, exact: true });
    expect(pads).toEqual([CALIBRATION_PASSES[0].pad]);
  });

  it('어림이 100px 넘게 틀리면 원점을 더 바깥에서 받아 넓게 찾는다', async () => {
    const rough = { dx: 210, dy: 350, score: 1 };
    const pads: number[] = [];
    const exact = await exactCalibrationFrom(rough, render, 3, async (_, minX, minY) => {
      pads.push(-210 - minX);
      return ground(minX, minY);
    }, 0.75);
    expect(exact).toEqual({ dx: 300, dy: 200, score: 1, exact: true });
    // 좁은 단계는 레이어 조합 셋을 다 해 본 뒤에 넓힌다
    expect(pads).toEqual([24, 24, 24, 424]);
  });

  it('같은 무늬가 되풀이되는 바닥도 한 무늬 옆으로 잘못 맞추지 않는다', async () => {
    // 64px 타일이 x 100~500 에 되풀이되는 바닥. 한 칸 옆은 끝자락만 어긋난다
    const tiled = sky(600, 400);
    const tile = noise(64, 80, 11);
    for (let y = 250; y < 330; y += 1) {
      for (let x = 100; x < 500; x += 1) {
        const from = ((y - 250) * 64 + ((x - 100) % 64)) * 4;
        (tiled.data as Uint8ClampedArray).set((tile.data as Uint8ClampedArray).subarray(from, from + 4), (y * 600 + x) * 4);
      }
    }
    const tiles = layerFrom(tiled, (x, y) => y >= 250 && y < 330 && x >= 100 && x < 500);
    const exact = await exactCalibrationFrom({ dx: 300 - 64 * 2 - 3, dy: 200 + 90, score: 1 }, tiled, 1, async (_, minX, minY) => tiles(minX, minY), 0.75);
    expect(exact).toMatchObject({ dx: 300, dy: 200, exact: true });
  });

  it('어디에도 안 맞는 그림이면 null 이라 어림 보정을 그대로 쓴다', async () => {
    const pads: number[] = [];
    const other = noise(1100, 900, 99);
    const exact = await exactCalibrationFrom({ dx: 210, dy: 350, score: 1 }, render, 2, async (variant, minX) => {
      pads.push(-210 - minX);
      return variant === 0 ? other : null;
    }, 0.75);
    expect(exact).toBeNull();
    expect(pads).toEqual([24, 24, 424, 424]);
  });
});
