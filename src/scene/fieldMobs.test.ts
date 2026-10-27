import { describe, expect, it } from 'vitest';
import {
  FIELD_MOB_CAP,
  HIT_ABOVE,
  type MapLife,
  createPatrol,
  createRespawnTable,
  pickTargets,
  spawnPoints,
  stepPatrol,
} from './fieldMobs';

const life = (x: number, extra: Partial<MapLife> = {}): MapLife => ({ id: 100100, x, y: 300, ...extra });

describe('맵 몬스터 자리', () => {
  it('맵이 정한 자리를 다 쓰고 숨은 몬스터는 뺀다', () => {
    const points = spawnPoints([life(0), life(10, { hidden: true }), life(20)]);
    expect(points.map((point) => point.x)).toEqual([0, 20]);
  });

  it('상한보다 많으면 맵 전체에 고르게 상한만큼 남긴다', () => {
    const many = Array.from({ length: 40 }, (_, index) => life(index * 10));
    const points = spawnPoints(many);
    expect(points).toHaveLength(FIELD_MOB_CAP);
    expect(points[0].x).toBe(0);
    expect(points[points.length - 1].x).toBeGreaterThan(350);
    expect(new Set(points.map((point) => point.x)).size).toBe(FIELD_MOB_CAP);
  });
});

describe('리스폰', () => {
  it('잡힌 자리는 몬스터 주기가 지나야 다시 나온다', () => {
    const table = createRespawnTable(3);
    table.kill(1, 1000);
    expect(table.alive(1)).toBe(false);
    expect(table.revive(1000 + 179_999, 180_000)).toEqual([]);
    expect(table.revive(1000 + 180_000, 180_000)).toEqual([1]);
    expect(table.alive(1)).toBe(true);
    expect(table.revive(10_000_000, 180_000)).toEqual([]);
  });

  it('자리마다 따로 센다', () => {
    const table = createRespawnTable(2);
    table.kill(0, 0);
    table.kill(1, 60_000);
    expect(table.revive(180_000, 180_000)).toEqual([0]);
    expect(table.revive(240_000, 180_000)).toEqual([1]);
  });
});

describe('순찰', () => {
  it('원작 walkArea 와 발판이 겹치는 곳만 오가고 끝에서 돌아선다', () => {
    const patrol = createPatrol(life(50, { walkAreaX1: -100, walkAreaX2: 120 }), { minX: 0, maxX: 400 }, () => 0);
    expect([patrol.minX, patrol.maxX]).toEqual([0, 120]);
    let turned = false;
    for (let frame = 0; frame < 600; frame += 1) {
      const before = patrol.direction;
      stepPatrol(patrol, 33, 40, () => 0.99);
      if (patrol.direction !== before) turned = true;
      expect(patrol.x).toBeGreaterThanOrEqual(0);
      expect(patrol.x).toBeLessThanOrEqual(120);
    }
    expect(turned).toBe(true);
  });
});

describe('타격 대상', () => {
  const hero = { x: 0, y: 300, facing: 1 as const };

  it('보는 쪽 사거리 안의 몬스터를 가까운 순으로 대상 수만큼 고른다', () => {
    const mobs = [
      { x: 150, y: 300 },
      { x: 40, y: 300 },
      { x: -60, y: 300 },
      { x: 90, y: 300 },
      { x: 260, y: 300 },
    ];
    expect(pickTargets(hero, mobs, 200, 2)).toEqual([1, 3]);
    expect(pickTargets(hero, mobs, 200, 6)).toEqual([1, 3, 0]);
    expect(pickTargets({ ...hero, facing: -1 }, mobs, 200, 6)).toEqual([2]);
  });

  it('위아래로 너무 떨어진 몬스터는 안 맞는다', () => {
    const mobs = [
      { x: 50, y: 300 - HIT_ABOVE - 1 },
      { x: 60, y: 300 - HIT_ABOVE },
      { x: 70, y: 340 },
    ];
    expect(pickTargets(hero, mobs, 200, 5)).toEqual([1]);
  });
});
