import type { Foothold } from './api';
import { type GroundPath, type Point, groundPaths, groundY } from './ground.ts';

// 캐릭터가 발판 사이를 걷고, 뛰어오르고, 떨어지고, 사다리·로프를 타고 포털까지 가는 길을 찾는다.
// 좌표는 모두 맵 월드 좌표다. scripts/curate-routes.ts 가 Node 로 바로 불러 쓰므로 import 에 확장자를 적는다

/** Map.wz Physics.img (KMS 389). 속도는 px/초, 가속은 px/초² */
export const PHYSICS = { gravity: 2000, jumpSpeed: 555, fallSpeed: 670, walkSpeed: 125 } as const;
/** 원작 사다리·로프 오르는 속도에 가깝게 잡은 값. Physics.img 에는 없다 */
export const CLIMB_SPEED = 100;

/** 맵 정보 ladderRopes 한 칸. y1 이 위 끝, y2 가 아래 끝 */
export interface LadderRope {
  x: number;
  y1: number;
  y2: number;
  isLadder: boolean;
  /** WZ page. 원작은 사다리·로프 그림을 이 레이어에 두고 오르는 캐릭터도 이 레이어에 그린다. 맵 정보에는 없어 따로 받는다 */
  page?: number;
}

export interface Platform extends GroundPath {
  id: number;
}

/** 발판 위 한 점. x 에서의 높이는 그 발판이 정한다 */
export interface NavPoint {
  platform: number;
  x: number;
}

export type NavStep =
  /** 지금 발판을 따라 x 까지 걷는다 */
  | { kind: 'walk'; platform: number; x: number }
  /** 공중으로 몸을 던져 to 에 내린다. vx·vy 로 시작해 중력으로 떨어진다. ignore 는 처음에 빠져나오는 발판 */
  | { kind: 'jump' | 'fall' | 'drop'; from: Point; vx: number; vy: number; ignore: number | null; platform: number; to: Point }
  /** 사다리·로프를 x 에서 fromY → toY 로 타고 platform 에 선다. layer 는 오르는 동안 캐릭터를 그리는 레이어(page) */
  | { kind: 'climb'; x: number; fromY: number; toY: number; rope: boolean; platform: number; layer?: number };

interface Transition {
  from: NavPoint;
  to: NavPoint;
  cost: number;
  step: NavStep;
}

export interface NavGraph {
  platforms: Platform[];
  transitions: Transition[];
  /** 캐릭터가 사냥하며 걷는 가장 긴 발판(mainGround 와 같은 묶음) */
  main: number;
}

/** 이보다 높은 발판은 점프로 못 오른다. 최고 높이(약 77px)에서 발이 걸릴 여유를 뺐다 */
const MAX_RISE = Math.floor((PHYSICS.jumpSpeed * PHYSICS.jumpSpeed) / (2 * PHYSICS.gravity)) - 7;
/** 점프로 내려갈 때 이보다 낮은 발판은 떨어지기로 간다 */
const MAX_JUMP_DROP = 30;
/** 아래 점프로 이보다 멀리는 안 떨어진다 */
const MAX_DROP = 600;
const SAMPLE_GAP = 20;
const DROP_SAMPLE_GAP = 60;
/** 같은 두 발판 사이 점프·아래 점프는 이만큼만 남긴다 */
const EDGES_PER_PAIR = 3;
const AIR_DT = 1 / 120;
const AIR_LIMIT_S = 4;
/** 사다리 위 끝과 그 위 발판 높이 차, 아래 끝과 밑 발판 높이 차 허용 범위 */
const LADDER_TOP_SLACK = 10;
const LADDER_BOTTOM_REACH = 80;
/** 포털은 발판보다 조금 위에 놓인다. 포털 좌표가 발판보다 몇 px 아래에 찍힌 맵도 있다 */
export const PORTAL_MAX_HEIGHT = 60;
const PORTAL_SINK = 10;

const isWall = (foothold: Foothold) => foothold.x1 === foothold.x2;
const covers = (platform: GroundPath, x: number) => x >= platform.minX && x <= platform.maxX;

export function surfaceY(platform: GroundPath, x: number): number {
  return groundY(platform, x);
}

/** 발판 끝이 위로 솟은 벽에 막혀 있으면 걸어서 떨어질 수 없다 */
function blockedAt(walls: Foothold[], x: number, y: number): boolean {
  return walls.some((wall) => Math.abs(wall.x1 - x) <= 2 && Math.min(wall.y1, wall.y2) < y - 10 && Math.max(wall.y1, wall.y2) >= y - 10);
}

const lowest = new WeakMap<Platform[], number>();
function lowestY(platforms: Platform[]): number {
  let y = lowest.get(platforms);
  if (y === undefined) {
    y = Math.max(...platforms.flatMap((platform) => platform.points.map((point) => point.y)));
    lowest.set(platforms, y);
  }
  return y;
}

/**
 * 공중 궤적을 따라가다 아래로 움직이며 처음 지나는 발판에 내린다. 발판은 아래에서는 뚫고 지나간다(원작과 같다).
 * 맵 밖으로 떨어지면 null
 */
export function simulateAir(
  platforms: Platform[],
  start: Point,
  vx: number,
  vy: number,
  ignore: number | null,
): { platform: number; x: number; y: number; t: number } | null {
  let { x, y } = start;
  let speed = vy;
  const floor = lowestY(platforms);
  for (let t = AIR_DT; t <= AIR_LIMIT_S; t += AIR_DT) {
    const previousY = y;
    speed = Math.min(speed + PHYSICS.gravity * AIR_DT, PHYSICS.fallSpeed);
    x += vx * AIR_DT;
    y += speed * AIR_DT;
    if (speed > 0) {
      const landed = platforms.find((platform) => {
        if (platform.id === ignore || !covers(platform, x)) return false;
        const surface = surfaceY(platform, x);
        return previousY <= surface && y >= surface;
      });
      if (landed) return { platform: landed.id, x, y: surfaceY(landed, x), t };
    }
    if (y > floor + 200) return null;
  }
  return null;
}

/** 오를 높이(rise, 위가 양수)에서 점프가 그 높이에 다시 내려오기까지 걸리는 시간 */
function jumpTime(rise: number): number | null {
  const { jumpSpeed: v, gravity: g } = PHYSICS;
  const disc = v * v - 2 * g * rise;
  return disc < 0 ? null : (v + Math.sqrt(disc)) / g;
}

function samples(platform: Platform, gap: number): number[] {
  const xs: number[] = [];
  for (let x = platform.minX + 2; x < platform.maxX - 2; x += gap) xs.push(x);
  xs.push(platform.maxX - 2);
  return xs;
}

/** 같은 두 발판 사이 이음은 처음·가운데·끝만 남겨 길찾기 점 수를 줄인다 */
function spread<T>(items: T[]): T[] {
  if (items.length <= EDGES_PER_PAIR) return items;
  return [items[0], items[Math.floor(items.length / 2)], items[items.length - 1]];
}

const airCost = (t: number, extra: number) => t + extra;

export function buildNavGraph(footholds: Foothold[], ladders: LadderRope[]): NavGraph {
  const platforms: Platform[] = groundPaths(footholds).map((path, id) => ({ ...path, id }));
  const walls = footholds.filter(isWall);
  const transitions: Transition[] = [];
  const add = (from: NavPoint, to: NavPoint, cost: number, step: NavStep) => transitions.push({ from, to, cost, step });

  platforms.forEach((platform) => {
    // 끝에서 걸어 나가 떨어지기
    ([
      [platform.minX, -1],
      [platform.maxX, 1],
    ] as const).forEach(([edgeX, direction]) => {
      const edge = { x: edgeX, y: surfaceY(platform, edgeX) };
      if (blockedAt(walls, edgeX, edge.y)) return;
      const vx = direction * PHYSICS.walkSpeed;
      const landing = simulateAir(platforms, edge, vx, 0, platform.id);
      if (!landing) return;
      const to = { x: landing.x, y: landing.y };
      add({ platform: platform.id, x: edgeX }, { platform: landing.platform, x: landing.x }, airCost(landing.t, 0.1), {
        kind: 'fall',
        from: edge,
        vx,
        vy: 0,
        ignore: platform.id,
        platform: landing.platform,
        to,
      });
    });

    // 아래 점프. 바로 밑 발판으로 뚫고 내려간다
    const drops = new Map<number, Transition[]>();
    samples(platform, DROP_SAMPLE_GAP).forEach((x) => {
      const from = { x, y: surfaceY(platform, x) };
      const landing = simulateAir(platforms, from, 0, 0, platform.id);
      if (!landing || landing.y - from.y > MAX_DROP) return;
      const list = drops.get(landing.platform) ?? [];
      list.push({
        from: { platform: platform.id, x },
        to: { platform: landing.platform, x: landing.x },
        cost: airCost(landing.t, 0.4),
        step: { kind: 'drop', from, vx: 0, vy: 0, ignore: platform.id, platform: landing.platform, to: { x: landing.x, y: landing.y } },
      });
      drops.set(landing.platform, list);
    });
    drops.forEach((list) => transitions.push(...spread(list)));

    // 점프해서 위나 옆 발판에 오르기
    const jumps = new Map<number, Transition[]>();
    samples(platform, SAMPLE_GAP).forEach((x) => {
      const from = { x, y: surfaceY(platform, x) };
      platforms.forEach((target) => {
        if (target.id === platform.id) return;
        const landX = Math.min(target.maxX - 2, Math.max(target.minX + 2, x));
        const rise = from.y - surfaceY(target, landX);
        if (rise > MAX_RISE || rise < -MAX_JUMP_DROP) return;
        const t = jumpTime(rise);
        if (t === null) return;
        const vx = (landX - x) / t;
        if (Math.abs(vx) > PHYSICS.walkSpeed) return;
        const landing = simulateAir(platforms, from, vx, -PHYSICS.jumpSpeed, null);
        if (!landing || landing.platform !== target.id) return;
        const list = jumps.get(target.id) ?? [];
        list.push({
          from: { platform: platform.id, x },
          to: { platform: target.id, x: landing.x },
          cost: airCost(landing.t, 0.3),
          step: { kind: 'jump', from, vx, vy: -PHYSICS.jumpSpeed, ignore: null, platform: target.id, to: { x: landing.x, y: landing.y } },
        });
        jumps.set(target.id, list);
      });
    });
    jumps.forEach((list) => transitions.push(...spread(list)));
  });

  // 사다리·로프. 위 끝은 발판 높이와 같고, 아래 끝은 밑 발판에서 점프로 닿을 만큼 떠 있기도 하다
  ladders.forEach((ladder) => {
    const top = platforms.find((platform) => covers(platform, ladder.x) && Math.abs(surfaceY(platform, ladder.x) - ladder.y1) <= LADDER_TOP_SLACK);
    const bottom = platforms
      .filter((platform) => covers(platform, ladder.x))
      .map((platform) => ({ platform, gap: surfaceY(platform, ladder.x) - ladder.y2 }))
      .filter(({ gap }) => gap >= -LADDER_TOP_SLACK && gap <= LADDER_BOTTOM_REACH)
      .sort((a, b) => a.gap - b.gap)[0]?.platform;
    if (!top || !bottom || top.id === bottom.id) return;
    const topY = surfaceY(top, ladder.x);
    const bottomY = surfaceY(bottom, ladder.x);
    const cost = (bottomY - topY) / CLIMB_SPEED + 0.3;
    const rope = !ladder.isLadder;
    add({ platform: bottom.id, x: ladder.x }, { platform: top.id, x: ladder.x }, cost, {
      kind: 'climb',
      x: ladder.x,
      fromY: bottomY,
      toY: topY,
      rope,
      platform: top.id,
      layer: ladder.page,
    });
    add({ platform: top.id, x: ladder.x }, { platform: bottom.id, x: ladder.x }, cost, {
      kind: 'climb',
      x: ladder.x,
      fromY: topY,
      toY: bottomY,
      rope,
      platform: bottom.id,
      layer: ladder.page,
    });
  });

  // mainGround 와 같은 규칙: 가로로 가장 긴 묶음, 같으면 앞의 것
  const main = platforms.reduce((best, platform) => (platform.maxX - platform.minX > best.maxX - best.minX ? platform : best), platforms[0]);
  return { platforms, transitions, main: main?.id ?? -1 };
}

/** 점 바로 아래 발판. 포털처럼 발판 조금 위에 놓인 것을 그 발판에 붙인다. 없으면 null */
export function platformUnder(graph: NavGraph, point: Point, maxHeight = PORTAL_MAX_HEIGHT): NavPoint | null {
  const below = graph.platforms
    .filter((platform) => covers(platform, point.x))
    .map((platform) => ({ platform, gap: surfaceY(platform, point.x) - point.y }))
    .filter(({ gap }) => gap >= -PORTAL_SINK && gap <= maxHeight)
    .sort((a, b) => a.gap - b.gap)[0];
  return below ? { platform: below.platform.id, x: point.x } : null;
}

const keyOf = (point: NavPoint) => `${point.platform}:${point.x}`;

/** 다익스트라. 같은 발판 위 점끼리는 걸어서 잇는다. 길이 없으면 null */
export function findPath(graph: NavGraph, from: NavPoint, to: NavPoint): NavStep[] | null {
  const anchors = new Map<number, Set<number>>();
  const anchor = (point: NavPoint) => {
    const set = anchors.get(point.platform) ?? new Set<number>();
    set.add(point.x);
    anchors.set(point.platform, set);
  };
  [from, to, ...graph.transitions.flatMap((transition) => [transition.from, transition.to])].forEach(anchor);

  const outgoing = new Map<string, { to: NavPoint; cost: number; step: NavStep | null }[]>();
  const link = (a: NavPoint, b: NavPoint, cost: number, step: NavStep | null) => {
    const list = outgoing.get(keyOf(a)) ?? [];
    list.push({ to: b, cost, step });
    outgoing.set(keyOf(a), list);
  };
  anchors.forEach((xs, platform) => {
    const sorted = [...xs].sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index += 1) {
      const a = { platform, x: sorted[index - 1] };
      const b = { platform, x: sorted[index] };
      const cost = (b.x - a.x) / PHYSICS.walkSpeed;
      link(a, b, cost, null);
      link(b, a, cost, null);
    }
  });
  graph.transitions.forEach((transition) => link(transition.from, transition.to, transition.cost, transition.step));

  const best = new Map<string, number>([[keyOf(from), 0]]);
  const previous = new Map<string, { key: string; point: NavPoint; step: NavStep | null }>();
  const points = new Map<string, NavPoint>([[keyOf(from), from]]);
  const open = new Set([keyOf(from)]);
  const goal = keyOf(to);
  while (open.size > 0) {
    let current = '';
    let currentCost = Infinity;
    open.forEach((key) => {
      const cost = best.get(key)!;
      if (cost < currentCost) {
        current = key;
        currentCost = cost;
      }
    });
    open.delete(current);
    if (current === goal) break;
    (outgoing.get(current) ?? []).forEach((edge) => {
      const key = keyOf(edge.to);
      const cost = currentCost + edge.cost;
      if (cost >= (best.get(key) ?? Infinity)) return;
      best.set(key, cost);
      points.set(key, edge.to);
      previous.set(key, { key: current, point: points.get(current)!, step: edge.step });
      open.add(key);
    });
  }
  if (!best.has(goal)) return null;

  const steps: NavStep[] = [];
  for (let key = goal; key !== keyOf(from); key = previous.get(key)!.key) {
    const link = previous.get(key)!;
    const point = points.get(key)!;
    steps.unshift(link.step ?? { kind: 'walk', platform: point.platform, x: point.x });
  }
  // 이어진 걷기는 마지막 목적지 하나로 합친다
  return steps.filter((step, index) => !(step.kind === 'walk' && steps[index + 1]?.kind === 'walk'));
}

export type NavAction = 'walk' | 'stand' | 'jump' | 'ladder' | 'rope';

export interface NavPose {
  x: number;
  y: number;
  action: NavAction;
  /** 1 이면 오른쪽을 본다 */
  facing: -1 | 1;
  done: boolean;
  /** 캐릭터를 그리는 맵 레이어. 사다리·로프에서는 그 page, 모르면 오르기 전 발판의 레이어 */
  layer: number;
}

/** 찾은 길을 프레임마다 따라간다. 공중 구간은 길을 찾을 때와 같은 계산으로 다시 날아서 같은 자리에 내린다 */
export function createNavRunner(graph: NavGraph, start: NavPoint, steps: NavStep[]) {
  const byId = new Map(graph.platforms.map((platform) => [platform.id, platform]));
  let platform = byId.get(start.platform)!;
  let x = start.x;
  let y = surfaceY(platform, x);
  let facing: -1 | 1 = 1;
  let index = 0;
  let air: { vx: number; vy: number; ignore: number | null } | null = null;
  let carryS = 0;
  let climbLayer: number | null = null;

  const finishStep = () => {
    index += 1;
    air = null;
  };

  function advance(seconds: number, walkScale: number): NavAction {
    const step = steps[index];
    // 다 오른 프레임도 사다리 그림이라 그 레이어를 다음 걸음까지 둔다
    climbLayer = step?.kind === 'climb' ? (step.layer ?? null) : null;
    if (!step) return 'stand';
    if (step.kind === 'walk') {
      const distance = step.x - x;
      if (distance !== 0) facing = distance > 0 ? 1 : -1;
      const move = Math.min(Math.abs(distance), PHYSICS.walkSpeed * walkScale * seconds);
      x += Math.sign(distance) * move;
      y = surfaceY(platform, x);
      if (Math.abs(step.x - x) < 0.01) {
        x = step.x;
        finishStep();
      }
      return 'walk';
    }
    if (step.kind === 'climb') {
      x = step.x;
      const distance = step.toY - y;
      y += Math.sign(distance) * Math.min(Math.abs(distance), CLIMB_SPEED * seconds);
      if (Math.abs(step.toY - y) < 0.01) {
        platform = byId.get(step.platform)!;
        y = surfaceY(platform, x);
        finishStep();
      }
      return step.rope ? 'rope' : 'ladder';
    }
    if (!air) {
      ({ x, y } = step.from);
      air = { vx: step.vx, vy: step.vy, ignore: step.ignore };
      if (step.vx !== 0) facing = step.vx > 0 ? 1 : -1;
    }
    // 길을 찾을 때와 같은 간격으로 쪼개 계산해야 같은 자리에 내린다
    carryS += seconds;
    while (carryS >= AIR_DT && air) {
      carryS -= AIR_DT;
      const previousY = y;
      air.vy = Math.min(air.vy + PHYSICS.gravity * AIR_DT, PHYSICS.fallSpeed);
      x += air.vx * AIR_DT;
      y += air.vy * AIR_DT;
      if (air.vy > 0) {
        const landed = graph.platforms.find((each) => {
          if (each.id === air!.ignore || !covers(each, x)) return false;
          const surface = surfaceY(each, x);
          return previousY <= surface && y >= surface;
        });
        if (landed) {
          // 계산이 어긋나도 길이 정한 발판에 세운다. 공중에 뜬 채 남지 않게 한다
          platform = byId.get(step.platform)!;
          ({ x, y } = step.to);
          finishStep();
          carryS = 0;
        }
      }
    }
    return 'jump';
  }

  return {
    /** walkScale: 발판을 걷는 속도 배율(탈것). 점프·오르내리기는 그대로다 */
    update(dtMs: number, walkScale = 1): NavPose {
      const action = advance(dtMs / 1000, walkScale);
      return { x, y, action, facing, done: index >= steps.length, layer: climbLayer ?? platform.layer };
    },
    /** 시간이 다 돼 멈출 때 서 있을 자리 */
    get position(): NavPoint {
      return { platform: platform.id, x };
    },
  };
}
