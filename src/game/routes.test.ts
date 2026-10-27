import { describe, expect, it } from 'vitest';
import { type RouteField, isPassage } from './routeCuration';
import { TOWN_ROUTES } from './routeData';
import { CLASSIC_TOWN_ROUTES } from './routeData.classic';
import { FIELD_CADENCE, type FieldMove, fieldMoveDue, fieldMoves, pickFieldMove, routePortals, townFields } from './routes';
import { TOWNS, townsFor } from './towns';

const field = (mapId: number, fromMapId: number, entryX: number, arrivalX: number): RouteField => ({
  mapId,
  name: `맵${mapId}`,
  fromMapId,
  entryX,
  entryY: -entryX,
  arrivalX,
  arrivalY: -arrivalX,
  level: 10,
  monsters: [{ id: mapId, name: `몹${mapId}` }],
});

// 마을 1 → 사냥터 10 → 사냥터 20, 마을 1 → 사냥터 11
const fields = [field(10, 1, 900, -400), field(11, 1, -800, 300), field(20, 10, 700, -350)];

describe('사냥터 오가기', () => {
  it('마을에서는 마을에 붙은 사냥터로만 간다', () => {
    expect(fieldMoves(1, fields, 1).map((move) => [move.toMapId, move.exit.x, move.arrival.x])).toEqual([
      [10, 900, -400],
      [11, -800, 300],
    ]);
  });

  it('사냥터에서는 들어온 포털로 돌아가거나 더 안쪽으로 간다', () => {
    const moves = fieldMoves(1, fields, 10);
    expect(moves.map((move) => [move.toMapId, move.exit.x, move.arrival.x])).toEqual([
      [1, -400, 900],
      [20, 700, -350],
    ]);
    expect(moves[0].field).toBeNull();
    expect(moves[1].field?.mapId).toBe(20);
  });

  it('안쪽 사냥터에서 돌아가면 앞 사냥터에 도착한다', () => {
    const [back] = fieldMoves(1, fields, 20);
    expect(back).toMatchObject({ toMapId: 10, exit: { x: -350, y: 350 }, arrival: { x: 700, y: -700 } });
    expect(back.field?.mapId).toBe(10);
  });

  it('못 받아 온 사냥터는 빼고 고르고 갈 곳이 없으면 null', () => {
    const moves = fieldMoves(1, fields, 1);
    expect(pickFieldMove(moves, new Set([10]), () => 0)?.toMapId).toBe(11);
    expect(pickFieldMove(moves, new Set([10, 11]))).toBeNull();
  });
});

describe('통로 맵 지나가기', () => {
  // 마을 1 → 통로 5 → 사냥터 50·51, 통로 5 → 통로 6 → 사냥터 60
  const passage = (mapId: number, fromMapId: number, entryX: number, arrivalX: number): RouteField => ({
    ...field(mapId, fromMapId, entryX, arrivalX),
    level: 0,
    monsters: [],
  });
  const route = [passage(5, 1, 100, -100), field(50, 5, 200, -200), field(51, 5, 300, -300), passage(6, 5, 400, -400), field(60, 6, 500, -500)];
  const hopsOf = (move: FieldMove) => move.hops.map((hop) => hop.toMapId);

  it('마을에서 통로 너머 사냥터까지 포털을 이어 타는 이동 하나로 간다', () => {
    const moves = fieldMoves(1, route, 1);
    expect(moves.map((move) => [move.toMapId, hopsOf(move)])).toEqual([
      [50, [5, 50]],
      [51, [5, 51]],
      [60, [5, 6, 60]],
    ]);
    // 지금 맵에서 걸어 갈 포털은 첫 칸, 나타날 포털은 마지막 칸이다
    expect(moves[0]).toMatchObject({ exit: { x: 100 }, arrival: { x: -200 }, field: { mapId: 50 } });
    expect(moves[0].hops[0]).toMatchObject({ toMapId: 5, exit: { x: 100 }, arrival: { x: -100 }, field: { mapId: 5 } });
  });

  it('통로 너머 사냥터에서는 통로를 지나 마을로 돌아가거나 옆 사냥터로 간다', () => {
    const moves = fieldMoves(1, route, 50);
    expect(moves.map((move) => [move.toMapId, hopsOf(move)])).toEqual([
      [1, [5, 1]],
      [51, [5, 51]],
      [60, [5, 6, 60]],
    ]);
    expect(moves[0].field).toBeNull();
    expect(moves[0].hops[0]).toMatchObject({ exit: { x: -200 }, arrival: { x: 200 } });
    expect(moves[0].hops[1]).toMatchObject({ exit: { x: -100 }, arrival: { x: 100 }, field: null });
  });

  it('못 받아 온 통로를 지나는 길은 고르지 않는다', () => {
    const moves = fieldMoves(1, route, 50);
    expect(pickFieldMove(moves, new Set([6]), () => 0.99)?.toMapId).toBe(51);
    expect(pickFieldMove(moves, new Set([5]))).toBeNull();
  });

  it('통로 맵에도 포털 하나에 하나씩 드나드는 포털을 띄운다', () => {
    const portals = routePortals({ mapId: 1, name: '마을' }, route);
    expect(portals.get(1)).toEqual([{ x: 100, y: -100, label: '맵5' }]);
    expect(portals.get(5)?.map((portal) => portal.label)).toEqual(['마을', '맵50', '맵51', '맵6']);
  });
});

describe('늘 보이는 포털', () => {
  it('마을 맵과 사냥터 맵마다 드나드는 포털 자리와 가는 맵 이름을 준다', () => {
    const portals = routePortals({ mapId: 1, name: '마을' }, fields);
    expect(portals.get(1)).toEqual([
      { x: 900, y: -900, label: '맵10' },
      { x: -800, y: 800, label: '맵11' },
    ]);
    // 사냥터에 도착한 포털이 그 맵에서 마을로 돌아가는 포털이다
    expect(portals.get(10)).toEqual([
      { x: -400, y: 400, label: '마을' },
      { x: 700, y: -700, label: '맵20' },
    ]);
    expect(portals.get(20)).toEqual([{ x: -350, y: 350, label: '맵10' }]);
  });

  it('사냥터가 없는 마을은 포털이 없다', () => {
    expect(routePortals({ mapId: 1, name: '마을' }, []).size).toBe(0);
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

describe.each([
  ['지금', TOWNS, TOWN_ROUTES],
  ['클래식', townsFor('classic'), CLASSIC_TOWN_ROUTES],
] as const)('고른 사냥터 데이터 (%s)', (_, TOWNS, TOWN_ROUTES) => {
  it('마을마다 사냥터가 셋 이하고 앞 맵이 마을이나 같은 경로의 앞쪽 맵이다', () => {
    TOWNS.forEach((town) => {
      const route = TOWN_ROUTES[town.id] ?? [];
      expect(route.filter((each) => !isPassage(each)).length).toBeLessThanOrEqual(3);
      route.forEach((each, index) => {
        expect([town.mapId, ...route.slice(0, index).map((other) => other.mapId)]).toContain(each.fromMapId);
      });
    });
  });

  it('통로는 그 너머에 사냥터가 있을 때만 들어 있다', () => {
    Object.values(TOWN_ROUTES).forEach((route) => {
      const reachesField = (mapId: number): boolean =>
        route.filter((each) => each.fromMapId === mapId).some((each) => !isPassage(each) || reachesField(each.mapId));
      route.filter(isPassage).forEach((each) => expect(reachesField(each.mapId)).toBe(true));
    });
  });
});

describe('시대별 사냥터 찾기', () => {
  it('같은 마을 id 라도 시대에 맞는 길 목록을 준다', () => {
    const [current] = TOWNS;
    const classic = townsFor('classic').find((town) => town.id === current.id)!;
    expect(townFields(current)).toBe(TOWN_ROUTES[current.id]);
    expect(townFields(classic)).toBe(CLASSIC_TOWN_ROUTES[classic.id]);
    expect(townFields({ id: current.id, era: 'classic' })).not.toBe(townFields(current));
  });

  it('클래식 사냥터 이름은 한글이다', () => {
    Object.values(CLASSIC_TOWN_ROUTES)
      .flat()
      .forEach((field) => {
        expect(field.name, String(field.mapId)).toMatch(/[가-힣]/);
        field.monsters.forEach((monster) => expect(monster.name, String(monster.id)).toMatch(/[가-힣]/));
      });
  });
});
