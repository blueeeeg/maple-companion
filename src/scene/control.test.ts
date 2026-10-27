import { describe, expect, it } from 'vitest';
import type { Foothold } from '../maple/api';
import type { LadderRope } from '../maple/navigation';
import { type ControlInput, type Controller, buildControlWorld, createController, platformBelow } from './control';

const foothold = (id: number, x1: number, y1: number, x2: number, y2: number, prev = 0, next = 0, layerId = 0): Foothold => ({
  id,
  prev,
  next,
  x1,
  y1,
  x2,
  y2,
  layerId,
});

// 바닥(0~600, 400 부터 오르막) → 600 에서 위로 솟은 벽 → 윗단(600~800). 바닥 위에 점프로 닿는 발판, 사다리로 오르는 높은 발판,
// 윗단 오른쪽 아래에 떨어져 내릴 발판이 있다
const FOOTHOLDS = [
  foothold(1, 0, 300, 400, 300, 0, 2),
  foothold(2, 400, 300, 600, 250, 1, 3),
  foothold(3, 600, 250, 600, 100, 2, 4),
  foothold(4, 600, 100, 800, 100, 3, 0),
  foothold(5, 850, 350, 1100, 350),
  foothold(10, 100, 230, 250, 230),
  foothold(20, 300, 100, 380, 100, 0, 0, 2),
];
const LADDERS: LadderRope[] = [{ x: 340, y1: 100, y2: 290, isLadder: true, page: 2 }];
const world = buildControlWorld(FOOTHOLDS, LADDERS);
const idOf = (x: number, y: number) => platformBelow(world, { x, y })!.id;

const none: ControlInput = { left: false, right: false, up: false, down: false, jump: false };
const hold = (keys: Partial<ControlInput>) => ({ ...none, ...keys });

/** ms 동안 30fps 프레임으로 누른다 */
function run(controller: Controller, keys: Partial<ControlInput>, ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000 / 30) controller.update(1000 / 30, hold(keys));
  return controller.pose;
}

describe('직접 조작 발판 움직임', () => {
  it('비탈 발판을 따라 걸으면 발이 비탈 높이에 붙는다', () => {
    const controller = createController(world, { x: 350, y: 300 });
    const pose = run(controller, { right: true }, 1000);
    expect(pose.action).toBe('walk');
    expect(pose.facing).toBe(1);
    expect(pose.x).toBeCloseTo(475, 0);
    expect(pose.y).toBeCloseTo(300 - 50 * ((pose.x - 400) / 200), 5);
  });

  it('위로 솟은 벽 앞에서 멈춘다', () => {
    const controller = createController(world, { x: 550, y: 263 });
    const pose = run(controller, { right: true }, 3000);
    expect(pose.x).toBe(600);
    expect(pose.y).toBe(250);
    expect(pose.action).toBe('stand');
  });

  it('맵 끝에서 더 못 나간다', () => {
    const pose = run(createController(world, { x: 30, y: 300 }), { left: true }, 2000);
    expect(pose.x).toBe(0);
    expect(pose.platform).toBe(idOf(0, 300));
  });

  it('제자리 점프로 머리 위 발판을 뚫고 올라가 그 발판에 내린다', () => {
    const controller = createController(world, { x: 175, y: 300 });
    const rising = run(controller, { jump: true }, 100);
    expect(rising.action).toBe('jump');
    expect(rising.y).toBeLessThan(300);
    const pose = run(controller, {}, 1000);
    expect(pose.platform).toBe(idOf(175, 230));
    expect(pose.y).toBe(230);
  });

  it('점프는 원작 물리값만큼 오르고 같은 높이에 다시 내린다', () => {
    const controller = createController(world, { x: 50, y: 300 });
    let top = 300;
    controller.update(1000 / 30, hold({ jump: true }));
    for (let frame = 0; frame < 30; frame += 1) top = Math.min(top, controller.update(1000 / 30, none).y);
    // 555² / (2 × 2000) ≈ 77
    expect(300 - top).toBeGreaterThan(70);
    expect(300 - top).toBeLessThan(80);
    expect(controller.pose.platform).toBe(idOf(50, 300));
  });

  it('발판 끝에서 걸어 나가면 떨어져서 아래 발판에 내린다', () => {
    const controller = createController(world, { x: 780, y: 100 });
    const falling = run(controller, { right: true }, 300);
    expect(falling.action).toBe('jump');
    const pose = run(controller, { right: true }, 1500);
    expect(pose.platform).toBe(idOf(900, 350));
    expect(pose.y).toBe(350);
  });

  it('사다리 앞에서 ↑ 로 잡고 올라 위 발판에 선다', () => {
    const controller = createController(world, { x: 345, y: 300 });
    const grabbed = run(controller, { up: true }, 100);
    expect(grabbed.action).toBe('ladder');
    expect(grabbed.x).toBe(340);
    expect(grabbed.layer).toBe(2);
    const pose = run(controller, { up: true }, 2500);
    expect(pose.platform).toBe(idOf(340, 100));
    expect(pose.y).toBe(100);
    expect(pose.action).toBe('stand');
  });

  it('사다리에서 손을 떼면 그 자리에 매달려 있다', () => {
    const controller = createController(world, { x: 340, y: 300 });
    run(controller, { up: true }, 500);
    const held = run(controller, {}, 500);
    expect(held.action).toBe('ladder');
    expect(held.moving).toBe(false);
    expect(run(controller, {}, 500).y).toBe(held.y);
  });

  it('위 발판의 사다리 끝에서 ↓ 로 잡고 내려가 바닥에 선다', () => {
    const controller = createController(world, { x: 342, y: 100 });
    expect(run(controller, { down: true }, 100).action).toBe('ladder');
    const pose = run(controller, { down: true }, 2500);
    expect(pose.platform).toBe(idOf(340, 300));
    expect(pose.y).toBe(300);
  });

  it('사다리에서 방향키와 점프로 옆으로 뛰어내린다', () => {
    const controller = createController(world, { x: 340, y: 300 });
    run(controller, { up: true }, 800);
    const jumped = run(controller, { left: true, jump: true }, 100);
    expect(jumped.action).toBe('jump');
    expect(jumped.facing).toBe(-1);
    const pose = run(controller, {}, 1500);
    expect(pose.platform).toBe(idOf(300, 300));
    expect(pose.x).toBeLessThan(340);
  });

  it('↓ + 점프로 발판 아래로 뚫고 내려간다', () => {
    const controller = createController(world, { x: 150, y: 230 });
    run(controller, { down: true, jump: true }, 100);
    const pose = run(controller, {}, 1000);
    expect(pose.platform).toBe(idOf(150, 300));
    expect(pose.y).toBe(300);
  });

  it('맨 아래 발판에서는 아래 점프가 안 되고 엎드린다', () => {
    const controller = createController(world, { x: 50, y: 300 });
    const pose = run(controller, { down: true, jump: true }, 500);
    expect(pose.action).toBe('prone');
    expect(pose.y).toBe(300);
    expect(pose.platform).toBe(idOf(50, 300));
  });

  it('공중·사다리에서 settle 하면 바로 아래 발판에 선다', () => {
    const controller = createController(world, { x: 340, y: 300 });
    run(controller, { up: true }, 1000);
    expect(controller.settle()).toEqual({ platform: idOf(340, 300), x: 340 });
    expect(controller.pose.action).toBe('stand');
  });
});
