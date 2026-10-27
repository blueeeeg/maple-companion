import type { Foothold } from '../maple/api';
import { type Point, groundPaths } from '../maple/ground';
import { CLIMB_SPEED, type LadderRope, PHYSICS, type Platform, surfaceY } from '../maple/navigation';

// 직접 조작 모드에서 방향키·점프로 캐릭터를 맵 발판 위에서 움직인다. 좌표는 맵 월드 좌표이고 그리기와 따로 둔다

export interface ControlInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
}

export type ControlAction = 'stand' | 'walk' | 'jump' | 'ladder' | 'rope' | 'prone';

export interface ControlPose extends Point {
  action: ControlAction;
  /** 1 이면 오른쪽을 본다 */
  facing: -1 | 1;
  /** 사다리·로프에서 오르내리는 중이거나 걷는 중. 서 있으면 false */
  moving: boolean;
  /** 캐릭터를 그리는 맵 레이어. 사다리·로프에서는 그 page */
  layer: number;
  /** 발판 위면 그 발판, 공중·사다리면 null */
  platform: number | null;
}

export interface ControlWorld {
  /** buildNavGraph 와 같은 순서·id 라 길찾기 발판과 바로 맞춰 쓴다 */
  platforms: Platform[];
  walls: Foothold[];
  ladders: LadderRope[];
  minX: number;
  maxX: number;
  /** 가장 낮은 발판 높이 */
  bottomY: number;
}

/** 이 안이면 사다리·로프를 잡는다 */
const GRAB_X = 12;
/** 캐릭터 키. 사다리 아래 끝이 발보다 이만큼 위에 있어도 손이 닿는다 */
const REACH_UP = 60;
/** 사다리 위 끝과 그 위 발판 높이 차 허용 범위. navigation.ts 와 같다 */
const LADDER_SLACK = 10;
/** 사다리 아래 끝에서 이 안에 발판이 있으면 그 발판에 내려선다 */
const LADDER_FOOT = 20;
/** 사다리에서 옆으로 뛰어내릴 때 위로 뛰는 힘. 원작처럼 보통 점프보다 낮다 */
const CLIMB_JUMP_RATIO = 0.55;
/** 아래 점프할 때 살짝 뛰어오르는 힘 */
const DOWN_JUMP_RATIO = 0.35;
/** 아래 점프로 이보다 멀리는 안 떨어진다. navigation.ts 와 같다 */
const MAX_DROP = 600;
/** 공중에서 방향키로 바꿀 수 있는 가로 속도의 가속(px/초²). 원작처럼 조금만 움직인다 */
const AIR_CONTROL = 300;
/** 사다리를 놓고 바로 다시 잡지 않는다 */
const REGRAB_MS = 300;
/** 이만큼 맵 밖으로 떨어지면 가까운 발판에 다시 세운다 */
const FALL_LIMIT = 400;
const STEP_S = 1 / 120;

const isWall = (foothold: Foothold) => foothold.x1 === foothold.x2;
const covers = (platform: Platform, x: number) => x >= platform.minX && x <= platform.maxX;

export function buildControlWorld(footholds: Foothold[], ladders: LadderRope[]): ControlWorld {
  const platforms: Platform[] = groundPaths(footholds).map((path, id) => ({ ...path, id }));
  const xs = footholds.flatMap((foothold) => [foothold.x1, foothold.x2]);
  const ys = platforms.flatMap((platform) => platform.points.map((point) => point.y));
  return {
    platforms,
    walls: footholds.filter(isWall),
    ladders,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    bottomY: Math.max(...ys),
  };
}

/** 점에서 가장 가까운 아래 발판(발보다 slack 위까지 본다). 없으면 null */
export function platformBelow(world: ControlWorld, point: Point, slack = LADDER_SLACK, ignore: number | null = null): Platform | null {
  let best: Platform | null = null;
  let bestGap = Infinity;
  world.platforms.forEach((platform) => {
    if (platform.id === ignore || !covers(platform, point.x)) return;
    const gap = surfaceY(platform, point.x) - point.y;
    if (gap >= -slack && gap < bestGap) {
      best = platform;
      bestGap = gap;
    }
  });
  return best;
}

/** 걸어서 발판 끝을 넘을 때 위로 솟은 벽에 막히는지 */
function wallAt(world: ControlWorld, x: number, y: number): boolean {
  return world.walls.some((wall) => Math.abs(wall.x1 - x) <= 2 && Math.min(wall.y1, wall.y2) < y - 10 && Math.max(wall.y1, wall.y2) >= y - 10);
}

/** 공중에서 from → to 로 갈 때 가로막는 벽. 발이 벽 높이 안에 있을 때만 막는다 */
function wallBetween(world: ControlWorld, fromX: number, toX: number, y: number): boolean {
  const low = Math.min(fromX, toX);
  const high = Math.max(fromX, toX);
  return world.walls.some((wall) => wall.x1 > low && wall.x1 <= high && y > Math.min(wall.y1, wall.y2) + 1 && y <= Math.max(wall.y1, wall.y2));
}

type State =
  | { kind: 'ground'; platform: Platform; x: number }
  | { kind: 'air'; x: number; y: number; vx: number; vy: number; ignore: number | null }
  | { kind: 'climb'; ladder: LadderRope; y: number };

export interface Controller {
  update(dtMs: number, input: ControlInput): ControlPose;
  readonly pose: ControlPose;
  /** 발판 위에 세운다. 공중·사다리면 바로 아래 발판으로 내려 세운다. 설 발판이 없으면 null */
  settle(): { platform: number; x: number } | null;
}

export function createController(world: ControlWorld, start: Point, facing: -1 | 1 = 1): Controller {
  const startOn = platformBelow(world, start);
  let state: State = startOn
    ? { kind: 'ground', platform: startOn, x: start.x }
    : { kind: 'air', x: start.x, y: start.y, vx: 0, vy: 0, ignore: null };
  let face = facing;
  let layer = startOn?.layer ?? world.platforms[0]?.layer ?? 0;
  let regrabMs = 0;
  let carryS = 0;
  let moved = false;
  let proneHeld = false;

  const ladderAt = (x: number, y: number, fromTop: boolean): LadderRope | undefined =>
    world.ladders.find((ladder) => {
      if (Math.abs(ladder.x - x) > GRAB_X) return false;
      if (fromTop) return Math.abs(ladder.y1 - y) <= LADDER_SLACK;
      return y > ladder.y1 + 2 && y - REACH_UP <= ladder.y2;
    });

  const grab = (ladder: LadderRope, y: number) => {
    state = { kind: 'climb', ladder, y: Math.min(ladder.y2, Math.max(ladder.y1, y)) };
  };

  const land = (platform: Platform, x: number) => {
    state = { kind: 'ground', platform, x };
    layer = platform.layer;
  };

  /** 맵 밖으로 떨어졌으면 그 x 의 가장 낮은 발판, 없으면 가장 긴 발판에 세운다 */
  const rescue = (x: number) => {
    const clamped = Math.min(world.maxX, Math.max(world.minX, x));
    const under = world.platforms
      .filter((platform) => covers(platform, clamped))
      .sort((a, b) => surfaceY(b, clamped) - surfaceY(a, clamped))[0];
    const target = under ?? world.platforms.reduce((best, each) => (each.maxX - each.minX > best.maxX - best.minX ? each : best));
    land(target, Math.min(target.maxX, Math.max(target.minX, clamped)));
  };

  function stepGround(current: Extract<State, { kind: 'ground' }>, input: ControlInput, dt: number): void {
    const { platform } = current;
    const y = surfaceY(platform, current.x);
    if (input.jump) {
      if (input.down) {
        // 맨 아래 발판이면 원작처럼 아래 점프가 안 된다
        const below = platformBelow(world, { x: current.x, y: y + 1 }, 0, platform.id);
        if (below && surfaceY(below, current.x) - y <= MAX_DROP) {
          state = { kind: 'air', x: current.x, y, vx: 0, vy: -PHYSICS.jumpSpeed * DOWN_JUMP_RATIO, ignore: platform.id };
        } else proneHeld = true;
        return;
      }
      const direction = input.left === input.right ? 0 : input.left ? -1 : 1;
      state = { kind: 'air', x: current.x, y, vx: direction * PHYSICS.walkSpeed, vy: -PHYSICS.jumpSpeed, ignore: null };
      return;
    }
    if (input.up) {
      const ladder = ladderAt(current.x, y, false);
      if (ladder) return grab(ladder, y);
    }
    if (input.down) {
      const ladder = ladderAt(current.x, y, true);
      if (ladder) return grab(ladder, ladder.y1 + 1);
      proneHeld = true;
      return;
    }
    const direction = input.left === input.right ? 0 : input.left ? -1 : 1;
    if (direction === 0) return;
    const next = current.x + direction * PHYSICS.walkSpeed * dt;
    const edge = direction < 0 ? platform.minX : platform.maxX;
    if ((direction < 0 && next < edge) || (direction > 0 && next > edge)) {
      if (wallAt(world, edge, surfaceY(platform, edge)) || edge <= world.minX || edge >= world.maxX) {
        moved = current.x !== edge;
        current.x = edge;
        return;
      }
      state = { kind: 'air', x: next, y: surfaceY(platform, edge), vx: direction * PHYSICS.walkSpeed, vy: 0, ignore: null };
      moved = true;
      return;
    }
    current.x = next;
    moved = true;
  }

  function stepAir(current: Extract<State, { kind: 'air' }>, input: ControlInput, dt: number): void {
    const direction = input.left === input.right ? 0 : input.left ? -1 : 1;
    if (direction !== 0) {
      const target = direction * PHYSICS.walkSpeed;
      const change = AIR_CONTROL * dt;
      current.vx = current.vx < target ? Math.min(target, current.vx + change) : Math.max(target, current.vx - change);
    }
    if (input.up && regrabMs <= 0) {
      const ladder = ladderAt(current.x, current.y, false);
      if (ladder) return grab(ladder, current.y);
    }
    const previousY = current.y;
    current.vy = Math.min(current.vy + PHYSICS.gravity * dt, PHYSICS.fallSpeed);
    let nextX = current.x + current.vx * dt;
    if (wallBetween(world, current.x, nextX, current.y) || nextX < world.minX || nextX > world.maxX) {
      nextX = Math.min(world.maxX, Math.max(world.minX, current.x));
      current.vx = 0;
    }
    current.x = nextX;
    current.y += current.vy * dt;
    if (current.vy > 0) {
      let landed: Platform | null = null;
      let landedY = Infinity;
      world.platforms.forEach((platform) => {
        if (platform.id === current.ignore || !covers(platform, current.x)) return;
        const surface = surfaceY(platform, current.x);
        if (previousY <= surface && current.y >= surface && surface < landedY) {
          landed = platform;
          landedY = surface;
        }
      });
      if (landed) return land(landed, current.x);
    }
    if (current.y > world.bottomY + FALL_LIMIT) rescue(current.x);
  }

  function stepClimb(current: Extract<State, { kind: 'climb' }>, input: ControlInput, dt: number): void {
    const { ladder } = current;
    const direction = input.left === input.right ? 0 : input.left ? -1 : 1;
    if (input.jump && direction !== 0) {
      face = direction;
      regrabMs = REGRAB_MS;
      state = {
        kind: 'air',
        x: ladder.x,
        y: current.y,
        vx: direction * PHYSICS.walkSpeed,
        vy: -PHYSICS.jumpSpeed * CLIMB_JUMP_RATIO,
        ignore: null,
      };
      return;
    }
    const vertical = input.up === input.down ? 0 : input.up ? -1 : 1;
    if (vertical === 0) return;
    moved = true;
    current.y += vertical * CLIMB_SPEED * dt;
    if (current.y <= ladder.y1) {
      const top = platformBelow(world, { x: ladder.x, y: ladder.y1 }, LADDER_SLACK);
      if (top && Math.abs(surfaceY(top, ladder.x) - ladder.y1) <= LADDER_SLACK) return land(top, ladder.x);
      current.y = ladder.y1;
      return;
    }
    if (current.y >= ladder.y2) {
      const bottom = platformBelow(world, { x: ladder.x, y: ladder.y2 }, LADDER_SLACK);
      if (bottom && surfaceY(bottom, ladder.x) - ladder.y2 <= LADDER_FOOT) return land(bottom, ladder.x);
      regrabMs = REGRAB_MS;
      state = { kind: 'air', x: ladder.x, y: ladder.y2, vx: 0, vy: 0, ignore: null };
    }
  }

  function step(input: ControlInput, dt: number): void {
    regrabMs = Math.max(0, regrabMs - dt * 1000);
    if (state.kind !== 'climb' && input.left !== input.right && !(state.kind === 'ground' && (input.down || input.jump))) {
      face = input.left ? -1 : 1;
    }
    if (state.kind === 'ground') stepGround(state, input, dt);
    else if (state.kind === 'air') stepAir(state, input, dt);
    else stepClimb(state, input, dt);
  }

  function pose(): ControlPose {
    if (state.kind === 'ground') {
      const action: ControlAction = moved ? 'walk' : proneHeld ? 'prone' : 'stand';
      return { x: state.x, y: surfaceY(state.platform, state.x), action, facing: face, moving: moved, layer, platform: state.platform.id };
    }
    if (state.kind === 'air') return { x: state.x, y: state.y, action: 'jump', facing: face, moving: true, layer, platform: null };
    const { ladder } = state;
    return {
      x: ladder.x,
      y: state.y,
      action: ladder.isLadder ? 'ladder' : 'rope',
      facing: face,
      moving: moved,
      layer: ladder.page ?? layer,
      platform: null,
    };
  }

  let last = pose();
  return {
    update(dtMs, input) {
      carryS += dtMs / 1000;
      // 쪼갠 간격보다 짧은 프레임은 움직이지 않으니 앞 자세를 그대로 둔다
      if (carryS < STEP_S) return last;
      moved = false;
      proneHeld = false;
      while (carryS >= STEP_S) {
        carryS -= STEP_S;
        step(input, STEP_S);
      }
      last = pose();
      return last;
    },
    get pose() {
      return last;
    },
    settle() {
      if (state.kind === 'ground') return { platform: state.platform.id, x: state.x };
      const point = state.kind === 'air' ? { x: state.x, y: state.y } : { x: state.ladder.x, y: state.y };
      const below = platformBelow(world, point, LADDER_SLACK);
      if (below) land(below, point.x);
      else rescue(point.x);
      moved = false;
      last = pose();
      // land·rescue 가 state 를 바꿔서 위에서 좁힌 타입을 다시 넓힌다
      const settled = state as State;
      return settled.kind === 'ground' ? { platform: settled.platform.id, x: settled.x } : null;
    },
  };
}
