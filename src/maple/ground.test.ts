import { describe, expect, it } from 'vitest';
import type { Foothold } from './api';
import { type AlphaMap, calibrateFootholds, groundY, mainGround } from './ground';

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
