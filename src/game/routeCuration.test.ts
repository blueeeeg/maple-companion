import { describe, expect, it } from 'vitest';
import type { Foothold } from '../maple/api';
import {
  type CandidateField,
  type Link,
  type MobDetail,
  fieldLevel,
  fieldMonsters,
  isPassage,
  levelBand,
  MAX_PASSAGES,
  portalAccess,
  relaxedLevelBand,
  selectRoute,
} from './routeCuration';
import { buildNavGraph } from '../maple/navigation';

const flat = (id: number, x1: number, x2: number, y: number): Foothold => ({ id, prev: 0, next: 0, x1, y1: y, x2, y2: y, layerId: 0 });

describe('포털에 오갈 수 있는지', () => {
  const graph = buildNavGraph(
    [
      flat(1, -1000, 1000, 0), // 바닥
      flat(2, 100, 300, -60), // 점프로 오르는 단
      flat(3, 600, 700, -500), // 못 닿는 발판
      flat(4, -100, 100, 200), // 떨어지면 못 나오는 구덩이
    ],
    [],
  );

  it('바닥이나 뛰어오를 수 있는 단 위 포털은 오간다', () => {
    expect(portalAccess(graph, { x: -900, y: -5 })).toBe('ok');
    expect(portalAccess(graph, { x: 200, y: -65 })).toBe('ok');
  });

  it('발판 없이 떠 있는 포털, 못 닿는 발판, 빠지면 못 나오는 곳의 포털은 쓰지 않는다', () => {
    expect(portalAccess(graph, { x: -500, y: -200 })).toBe('no-platform');
    expect(portalAccess(graph, { x: 650, y: -505 })).toBe('no-path-in');
    expect(portalAccess(graph, { x: 0, y: 195 })).toBe('no-path-out');
  });
});

describe('사냥터 몬스터', () => {
  const details = new Map<number, MobDetail>([
    [1, { id: 1, name: '주황버섯', level: 8, framebooks: { move: 3, hit1: 1, die1: 3 } }],
    [2, { id: 2, name: '초록버섯', level: 15, framebooks: { move: 3 } }],
    [3, { id: 3, name: '', level: 20, framebooks: { move: 3 } }],
    [4, { id: 4, name: '그림 없음', level: 20, framebooks: { die1: 2 } }],
    [5, { id: 5, name: '박쥐', level: 30, framebooks: { fly: 4 } }],
  ]);

  it('스폰 자리가 많은 몹부터 중복 없이 고르고 쓸 수 없는 몹은 뺀다', () => {
    const mobs = [1, 2, 2, 2, 3, 4, 5, 5, 1, 1, 1].map((id) => ({ id }));
    expect(fieldMonsters(mobs, details)).toEqual([
      { id: 1, name: '주황버섯', level: 8 },
      { id: 2, name: '초록버섯', level: 15 },
      { id: 5, name: '박쥐', level: 30 },
    ]);
  });

  it('정보를 못 받은 몹은 뺀다', () => {
    expect(fieldMonsters([{ id: 99 }], details)).toEqual([]);
  });

  it('사냥터 레벨은 몹 레벨 가운데값이다', () => {
    expect(fieldLevel([{ level: 8 }, { level: 30 }, { level: 15 }])).toBe(15);
    expect(fieldLevel([{ level: 10 }, { level: 20 }])).toBe(15);
    expect(fieldLevel([])).toBe(0);
  });
});

describe('사냥터 고르기', () => {
  const field = (mapId: number, level: number, isTown = false): CandidateField => ({
    mapId,
    name: `맵${mapId}`,
    isTown,
    monsters: level > 0 ? [{ id: mapId, name: `몹${mapId}`, level }] : [],
  });
  const link = (from: number, to: number): Link => ({
    from,
    to,
    exitX: from + to,
    exitY: -from,
    arrivalX: to - from,
    arrivalY: -to,
  });

  it('마을에서 가까운 사냥터부터 셋까지 나무 모양으로 고른다', () => {
    const fields = new Map([10, 11, 20, 30].map((id) => [id, field(id, 10)]));
    const links = [link(1, 10), link(1, 11), link(10, 20), link(20, 30)];
    const route = selectRoute(1, links, fields, [1, 20]);
    expect(route.map((each) => [each.mapId, each.fromMapId])).toEqual([
      [10, 1],
      [11, 1],
      [20, 10],
    ]);
    expect(route[2]).toMatchObject({ entryX: 30, entryY: -10, arrivalX: 10, arrivalY: -20, level: 10, monsters: [{ id: 20, name: '몹20' }] });
  });

  it('레벨이 안 맞는 맵, 다른 마을은 고르지 않고 그 너머로도 가지 않는다', () => {
    const fields = new Map([field(10, 50), field(12, 10, true), field(20, 10)].map((each) => [each.mapId, each]));
    const links = [link(1, 10), link(1, 12), link(10, 20), link(12, 20)];
    expect(selectRoute(1, links, fields, [1, 20])).toEqual([]);
  });

  it('몹이 없는 맵은 통로로 지나가 그 너머 사냥터를 고르고, 통로는 사냥터 앞에 한 번만 넣는다', () => {
    const fields = new Map([field(10, 0), field(20, 10), field(21, 12)].map((each) => [each.mapId, each]));
    const links = [link(1, 10), link(10, 20), link(10, 21)];
    const route = selectRoute(1, links, fields, [1, 20]);
    expect(route.map((each) => [each.mapId, each.fromMapId, isPassage(each)])).toEqual([
      [10, 1, true],
      [20, 10, false],
      [21, 10, false],
    ]);
    expect(route[0]).toMatchObject({ entryX: 11, arrivalX: 9, level: 0, monsters: [] });
  });

  it('통로는 사냥터 수에 안 세고, 너머에 고를 사냥터가 없으면 통로도 넣지 않는다', () => {
    const fields = new Map([field(10, 10), field(11, 10), field(12, 0), field(13, 0), field(20, 12), field(30, 50)].map((each) => [each.mapId, each]));
    const links = [link(1, 10), link(1, 11), link(1, 12), link(1, 13), link(12, 20), link(13, 30)];
    expect(selectRoute(1, links, fields, [1, 20]).map((each) => each.mapId)).toEqual([10, 11, 12, 20]);
  });

  it(`통로는 ${MAX_PASSAGES}개까지만 이어서 지나고, 0 이면 지나지 않는다`, () => {
    const chain = [10, 20, 30];
    const fields = new Map([...chain.map((id) => field(id, 0)), field(40, 10), field(31, 10)].map((each) => [each.mapId, each]));
    const links = [link(1, 10), link(10, 20), link(20, 30), link(30, 40), link(20, 31)];
    expect(selectRoute(1, links, fields, [1, 20]).map((each) => each.mapId)).toEqual([10, 20, 31]);
    expect(selectRoute(1, links, fields, [1, 20], 3, 0)).toEqual([]);
  });

  it('한 사냥터를 두 길로 갈 수 있으면 먼저 닿은 길만 쓴다', () => {
    const fields = new Map([10, 11, 20].map((id) => [id, field(id, 10)]));
    const links = [link(1, 10), link(1, 11), link(10, 20), link(11, 20)];
    const route = selectRoute(1, links, fields, [1, 20], 5);
    expect(route.filter((each) => each.mapId === 20)).toHaveLength(1);
    expect(route.find((each) => each.mapId === 20)!.fromMapId).toBe(10);
  });

  it('다음 마을 레벨을 넘어 조금 더까지 사냥터로 본다', () => {
    expect(levelBand(20, 30)).toEqual([10, 45]);
    expect(levelBand(1, 5)).toEqual([1, 26]);
    expect(levelBand(260, null)).toEqual([250, 300]);
  });

  it('기본 폭으로 못 고른 마을은 마을 레벨 60 위까지 넓혀 본다', () => {
    expect(relaxedLevelBand(30)).toEqual([20, 90]);
    expect(relaxedLevelBand(60)).toEqual([50, 120]);
    expect(relaxedLevelBand(5)).toEqual([1, 65]);
  });
});
