import { describe, expect, it } from 'vitest';
import { cameraFocus, cameraScroll, framedDistance, spanFocus } from './camera';

// 360px 창을 0.65 배로 그리면 맵 약 554px 가 보인다
const VIEW_WIDTH = 554;
const MARGIN = 60;

describe('사냥 중 카메라', () => {
  it('돌아다닐 때는 캐릭터를 비춘다', () => {
    expect(cameraFocus({ x: 100, y: 50 }, null, VIEW_WIDTH, MARGIN)).toEqual({ x: 100, y: 50 });
  });

  it('몬스터가 있으면 둘 사이를 비춘다', () => {
    expect(cameraFocus({ x: 100, y: 50 }, { x: 300, y: 50 }, VIEW_WIDTH, MARGIN).x).toBe(200);
  });

  it('둘이 한 화면에 안 들어가면 캐릭터가 화면 끝 여유 안에 남는다', () => {
    const focus = cameraFocus({ x: 0, y: 0 }, { x: 1000, y: 0 }, VIEW_WIDTH, MARGIN);
    expect(focus.x).toBe(VIEW_WIDTH / 2 - MARGIN);
  });

  it('비탈에서는 더 낮은 발을 기준으로 한다', () => {
    expect(cameraFocus({ x: 0, y: 20 }, { x: 200, y: 80 }, VIEW_WIDTH, MARGIN).y).toBe(80);
  });

  it('서는 거리는 둘이 한 화면에 들어가는 만큼으로 줄인다', () => {
    expect(framedDistance(300, VIEW_WIDTH, MARGIN)).toBe(300);
    expect(framedDistance(300, 300, MARGIN)).toBe(180);
  });

  it('줄인 거리로 서면 사이를 비췄을 때 둘 다 여유를 두고 화면에 들어간다', () => {
    const viewWidth = 300;
    const hero = { x: 1000, y: 0 };
    const mob = { x: hero.x + framedDistance(500, viewWidth, MARGIN), y: 0 };
    const focus = cameraFocus(hero, mob, viewWidth, MARGIN);
    const left = focus.x - viewWidth / 2;
    const right = focus.x + viewWidth / 2;
    expect(hero.x - left).toBeGreaterThanOrEqual(MARGIN);
    expect(right - mob.x).toBeGreaterThanOrEqual(MARGIN);
  });
});

describe('카메라 스크롤', () => {
  const view = { width: 360, height: 230 };
  const map = { width: 2000, height: 600 };

  it('비출 곳을 화면 가운데, 발 기준선에 둔다', () => {
    expect(cameraScroll({ x: 1000, y: 400 }, 0.65, view, map, 38)).toEqual({ x: 470, y: 68 });
  });

  it('맵 끝에서는 맵 바깥을 비추지 않는다', () => {
    expect(cameraScroll({ x: 0, y: 0 }, 0.65, view, map, 38)).toEqual({ x: 0, y: 0 });
    expect(cameraScroll({ x: 2000, y: 600 }, 0.65, view, map, 38)).toEqual({ x: 2000 * 0.65 - 360, y: 600 * 0.65 - 230 });
  });
});

describe('보스전 카메라', () => {
  it('캐릭터와 보스 몸통을 함께 감싼 구간의 가운데를 비춘다', () => {
    // 피아누스(몸통 약 420px)처럼 기준점 오른쪽으로 몸통이 길게 뻗은 보스
    const focus = spanFocus({ x: 0, y: 100 }, 30, { left: 20, right: 440, y: 80 }, VIEW_WIDTH, MARGIN);
    expect(focus).toEqual({ x: 205, y: 100 });
  });

  it('다 안 들어가면 캐릭터가 화면 끝 여유 안에 남는다', () => {
    const focus = spanFocus({ x: 0, y: 0 }, 30, { left: 100, right: 2000, y: 0 }, VIEW_WIDTH, MARGIN);
    expect(focus.x).toBe(VIEW_WIDTH / 2 - MARGIN);
  });
});
