import { describe, expect, it } from 'vitest';
import type { Foothold } from './api';
import { type AlphaMap, calibrateFootholds, correctCalibration, groundY, mainGround } from './ground';
import { type Pixels, alignOverlay } from './layers';

const foothold = (
  id: number,
  prev: number,
  next: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  layerId = 0,
): Foothold => ({
  id,
  prev,
  next,
  x1,
  y1,
  x2,
  y2,
  layerId,
});

describe('바닥 고르기', () => {
  const footholds = [
    // 짧은 공중 발판
    foothold(1, 0, 2, 100, -200, 200, -200),
    foothold(2, 1, 0, 200, -200, 260, -200),
    // 길게 이어진 바닥. 가운데에 경사가 있다
    foothold(10, 0, 11, -500, 0, 0, 0, 5),
    foothold(11, 10, 12, 0, 0, 100, 50, 5),
    foothold(12, 11, 13, 100, 50, 600, 50, 5),
    // 벽은 바닥에 넣지 않는다
    foothold(13, 12, 0, 600, 50, 600, -100),
  ];

  it('가로로 가장 긴 묶음을 바닥으로 고른다', () => {
    const ground = mainGround(footholds)!;
    expect(ground.minX).toBe(-500);
    expect(ground.maxX).toBe(600);
  });

  it('바닥이 놓인 맵 레이어를 함께 돌려준다', () => {
    expect(mainGround(footholds)!.layer).toBe(5);
  });

  it('경사 구간에서는 높이를 이어서 계산한다', () => {
    const ground = mainGround(footholds)!;
    expect(groundY(ground, -300)).toBe(0);
    expect(groundY(ground, 50)).toBe(25);
    expect(groundY(ground, 400)).toBe(50);
  });
});

describe('맵 이미지에 발판 맞추기', () => {
  it('발판 바로 아래가 땅인 오프셋을 찾는다', () => {
    const footholds = [foothold(1, 0, 2, 0, 0, 300, 0), foothold(2, 1, 0, 300, 0, 400, -60)];
    // 정답 오프셋 (40, 120) 으로 그린 가짜 맵: 발판 아래로 땅이 채워져 있다
    const truth = { dx: 40, dy: 120 };
    const image: AlphaMap = {
      width: 500,
      height: 300,
      alphaAt(x, y) {
        if (x < 0 || y < 0 || x >= 500 || y >= 300) return 0;
        const worldX = x - truth.dx;
        if (worldX < 0 || worldX > 400) return 0;
        const surface = (worldX <= 300 ? 0 : (-60 * (worldX - 300)) / 100) + truth.dy;
        return y >= surface ? 255 : 0;
      },
    };
    const result = calibrateFootholds(image, footholds);
    expect(Math.abs(result.dx - truth.dx)).toBeLessThanOrEqual(8);
    expect(Math.abs(result.dy - truth.dy)).toBeLessThanOrEqual(6);
  });
});

describe('레이어 그림으로 보정 맞추기', () => {
  // 월드 좌표 (x, y) 를 그림 (x + dx, y + dy) 에 찍는다. 픽셀마다 색이 달라 겹치는 자리가 하나뿐이다
  const paint = (width: number, height: number, dx: number, dy: number): Pixels => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = -6; y <= 6; y += 1) {
      for (let x = -20; x <= 30; x += 1) {
        const [px, py] = [x + dx, y + dy];
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        data.set([(x * 7 + 140) & 255, (y * 31 + 90) & 255, (x * y + 60) & 255, 255], (py * width + px) * 4);
      }
    }
    return { width, height, data };
  };

  it('어림한 원점으로 받은 바닥 레이어가 겹친 자리만큼 보정을 고친다', () => {
    const pad = 24;
    // 전체 렌더는 월드 (0, 0) 을 그림 (40, 30) 에 그렸다. 투명도로 어림한 보정은 dx 33, dy 41 로 틀렸다
    const render = paint(120, 100, 40, 30);
    const rough = { dx: 33, dy: 41, score: 10 };
    // 레이어 그림은 원점(minX = -dx - pad, minY = -dy - pad)을 정해 받아서 월드 좌표가 정확하다
    const layer = paint(100, 90, rough.dx + pad, rough.dy + pad);
    const at = alignOverlay(render, layer, { x: -pad, y: -pad }, pad)!;
    expect(correctCalibration(rough, at, pad)).toEqual({ dx: 40, dy: 30, score: 10, exact: true });
  });

  it('어림이 맞았으면 그대로다', () => {
    expect(correctCalibration({ dx: 5, dy: -7, score: 3 }, { x: -24, y: -24 }, 24)).toEqual({ dx: 5, dy: -7, score: 3, exact: true });
  });
});
