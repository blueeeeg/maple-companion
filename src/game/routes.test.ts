import { describe, expect, it } from 'vitest';
import type { RouteField } from './routeCuration';
import { TOWN_ROUTES } from './routeData';
import { FIELD_CADENCE, fieldMoveDue, fieldMoves, pickFieldMove } from './routes';
import { TOWNS } from './towns';

const field = (mapId: number, fromMapId: number, entryX: number, arrivalX: number): RouteField => ({
  mapId,
  name: `맵${mapId}`,
  fromMapId,
  entryX,
  arrivalX,
  level: 10,
  monsters: [{ id: mapId, name: `몹${mapId}` }],
});

// 마을 1 → 사냥터 10 → 사냥터 20, 마을 1 → 사냥터 11
const fields = [field(10, 1, 900, -400), field(11, 1, -800, 300), field(20, 10, 700, -350)];

describe('사냥터 오가기', () => {
  it('마을에서는 마을에 붙은 사냥터로만 간다', () => {
    expect(fieldMoves(1, fields, 1).map((move) => [move.toMapId, move.exitX, move.arrivalX])).toEqual([
      [10, 900, -400],
      [11, -800, 300],
    ]);
  });

  it('사냥터에서는 들어온 포털로 돌아가거나 더 안쪽으로 간다', () => {
    const moves = fieldMoves(1, fields, 10);
    expect(moves.map((move) => [move.toMapId, move.exitX, move.arrivalX])).toEqual([
      [1, -400, 900],
      [20, 700, -350],
    ]);
    expect(moves[0].field).toBeNull();
    expect(moves[1].field?.mapId).toBe(20);
  });

  it('안쪽 사냥터에서 돌아가면 앞 사냥터에 도착한다', () => {
    const [back] = fieldMoves(1, fields, 20);
    expect(back).toMatchObject({ toMapId: 10, exitX: -350, arrivalX: 700 });
    expect(back.field?.mapId).toBe(10);
  });

  it('못 받아 온 사냥터는 빼고 고르고 갈 곳이 없으면 null', () => {
    const moves = fieldMoves(1, fields, 1);
    expect(pickFieldMove(moves, new Set([10]), () => 0)?.toMapId).toBe(11);
    expect(pickFieldMove(moves, new Set([10, 11]))).toBeNull();
  });
});

describe('사냥터로 옮기는 때', () => {
  const minute = 60 * 1000;

  it('도착하고 잠깐은 사냥을 많이 해도 안 옮긴다', () => {
    expect(fieldMoveDue({ hunts: 5, sinceArrivalMs: FIELD_CADENCE.minStayMs - 1 })).toBe(false);
  });

  it('정한 만큼 사냥하면 옮긴다', () => {
    expect(fieldMoveDue({ hunts: FIELD_CADENCE.hunts - 1, sinceArrivalMs: 2 * minute })).toBe(false);
    expect(fieldMoveDue({ hunts: FIELD_CADENCE.hunts, sinceArrivalMs: 2 * minute })).toBe(true);
  });

  it('사냥이 없어도 오래 머물면 옮긴다', () => {
    expect(fieldMoveDue({ hunts: 0, sinceArrivalMs: FIELD_CADENCE.stayMs })).toBe(true);
  });

  it('주기를 바꿔 넣을 수 있다', () => {
    expect(fieldMoveDue({ hunts: 1, sinceArrivalMs: 10 }, { hunts: 1, stayMs: Infinity, minStayMs: 0 })).toBe(true);
  });
});

describe('고른 사냥터 데이터', () => {
  it('마을마다 사냥터가 셋 이하고 앞 맵이 마을이나 같은 경로의 사냥터다', () => {
    TOWNS.forEach((town) => {
      const route = TOWN_ROUTES[town.id] ?? [];
      expect(route.length).toBeLessThanOrEqual(3);
      route.forEach((each) => {
        expect([town.mapId, ...route.map((other) => other.mapId)]).toContain(each.fromMapId);
        expect(each.monsters.length).toBeGreaterThan(0);
      });
    });
  });
});
