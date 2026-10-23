import { describe, expect, it } from 'vitest';
import type { Foothold } from './api';
import {
  type LadderRope,
  type NavGraph,
  type NavStep,
  buildNavGraph,
  createNavRunner,
  findPath,
  platformUnder,
  simulateAir,
  surfaceY,
} from './navigation';

let nextId = 1;
/** 가로 발판 하나짜리 묶음 */
const flat = (x1: number, x2: number, y: number): Foothold => ({ id: nextId++, prev: 0, next: 0, x1, y1: y, x2, y2: y, layerId: 0 });
const wall = (x: number, y1: number, y2: number): Foothold => ({ id: nextId++, prev: 0, next: 0, x1: x, y1, x2: x, y2, layerId: 0 });

// 바닥(y 0)과 그 위 발판들. 위가 음수다
const footholds = [
  flat(-1000, 1000, 0), // 바닥
  flat(100, 300, -60), // 점프로 오르는 단
  flat(320, 500, -120), // 단에서 한 번 더 점프
  flat(-600, -400, -300), // 사다리로만 오르는 높은 발판
  flat(600, 700, -500), // 어디서도 못 닿는 발판
  flat(-300, -200, -60), // 오른쪽 끝이 벽에 막힌 단
  wall(-200, -60, -200),
  flat(-100, 100, 200), // 바닥 밑 구덩이. 떨어지면 못 올라온다
];
const ladders: LadderRope[] = [{ x: -500, y1: -300, y2: -40, isLadder: true }];
const graph = buildNavGraph(footholds, ladders);

const platformAt = (g: NavGraph, x: number, y: number) =>
  g.platforms.find((platform) => x >= platform.minX && x <= platform.maxX && surfaceY(platform, x) === y)!.id;
const ground = platformAt(graph, 0, 0);
const step1 = platformAt(graph, 200, -60);
const step2 = platformAt(graph, 400, -120);
const high = platformAt(graph, -500, -300);
const unreachable = platformAt(graph, 650, -500);
const walled = platformAt(graph, -250, -60);
const pit = platformAt(graph, 0, 200);

const kinds = (steps: NavStep[] | null) => steps?.map((step) => step.kind);

describe('발판 길 만들기', () => {
  it('가장 긴 발판을 사냥하는 바닥으로 본다', () => {
    expect(graph.main).toBe(ground);
  });

  it('점프 높이 안의 단으로는 뛰어오르고 그보다 높은 발판으로는 못 뛴다', () => {
    const jumps = graph.transitions.filter((each) => each.step.kind === 'jump');
    expect(jumps.some((each) => each.from.platform === ground && each.to.platform === step1)).toBe(true);
    expect(jumps.some((each) => each.from.platform === step1 && each.to.platform === step2)).toBe(true);
    expect(jumps.some((each) => each.to.platform === high || each.to.platform === unreachable)).toBe(false);
  });

  it('사다리는 아래 발판과 위 발판을 양쪽으로 잇는다', () => {
    const climbs = graph.transitions.filter((each) => each.step.kind === 'climb');
    expect(climbs.map((each) => [each.from.platform, each.to.platform])).toEqual([
      [ground, high],
      [high, ground],
    ]);
    expect(climbs[0].step).toMatchObject({ x: -500, fromY: 0, toY: -300, rope: false });
  });

  it('위로 솟은 벽에 막힌 끝으로는 걸어서 떨어지지 않는다', () => {
    const falls = graph.transitions.filter((each) => each.step.kind === 'fall' && each.from.platform === walled);
    expect(falls.map((each) => each.from.x)).toEqual([-300]);
  });

  it('맵 밖으로 떨어지는 길은 만들지 않는다', () => {
    expect(simulateAir(graph.platforms, { x: 2000, y: 0 }, 0, 0, null)).toBeNull();
    const fromGroundEdges = graph.transitions.filter((each) => each.step.kind === 'fall' && each.from.platform === ground);
    expect(fromGroundEdges).toEqual([]);
  });
});

describe('길찾기', () => {
  it('단을 두 번 뛰어 윗 발판에 간다', () => {
    const steps = findPath(graph, { platform: ground, x: -800 }, { platform: step2, x: 450 });
    expect(kinds(steps)).toEqual(['walk', 'jump', 'walk', 'jump', 'walk']);
  });

  it('높은 발판은 사다리로 오르고 내려올 때는 더 빠른 아래 점프로 내려온다', () => {
    const up = findPath(graph, { platform: ground, x: 0 }, { platform: high, x: -450 });
    expect(kinds(up)).toContain('climb');
    const down = findPath(graph, { platform: high, x: -450 }, { platform: ground, x: 0 });
    expect(down?.[down.length - 1]).toMatchObject({ kind: 'walk', platform: ground, x: 0 });
    expect(kinds(down)).not.toContain('climb');
  });

  it('못 닿는 발판, 빠지면 못 나오는 구덩이에서는 길이 없다', () => {
    expect(findPath(graph, { platform: ground, x: 0 }, { platform: unreachable, x: 650 })).toBeNull();
    expect(findPath(graph, { platform: ground, x: 0 }, { platform: pit, x: 0 })).not.toBeNull();
    expect(findPath(graph, { platform: pit, x: 0 }, { platform: ground, x: 0 })).toBeNull();
  });

  it('포털을 그 아래 발판에 붙인다', () => {
    expect(platformUnder(graph, { x: 450, y: -125 })).toEqual({ platform: step2, x: 450 });
    expect(platformUnder(graph, { x: 0, y: -200 })).toBeNull();
  });
});

describe('길 따라 움직이기', () => {
  it('걷고 뛰고 사다리를 타서 목적지에 선다', () => {
    const start = { platform: ground, x: 600 };
    const steps = findPath(graph, start, { platform: high, x: -450 })!;
    const runner = createNavRunner(graph, start, steps);
    const actions = new Set<string>();
    let pose = runner.update(0);
    for (let frame = 0; frame < 30 * 60 && !pose.done; frame += 1) {
      pose = runner.update(33);
      actions.add(pose.action);
    }
    expect(pose).toMatchObject({ done: true, x: -450, y: -300 });
    expect(actions.has('ladder')).toBe(true);
    expect(runner.position.platform).toBe(high);
  });

  it('공중 구간은 길을 찾을 때 계산한 자리에 내린다', () => {
    const start = { platform: ground, x: -800 };
    const steps = findPath(graph, start, { platform: step2, x: 450 })!;
    const runner = createNavRunner(graph, start, steps);
    let pose = runner.update(0);
    let highest = 0;
    for (let frame = 0; frame < 30 * 60 && !pose.done; frame += 1) {
      pose = runner.update(16);
      highest = Math.min(highest, pose.y);
    }
    expect(pose).toMatchObject({ done: true, x: 450, y: -120 });
    // 점프는 내린 발판보다 높이 솟았다가 내려온다
    expect(highest).toBeLessThan(-120);
  });
});
