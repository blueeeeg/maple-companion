import type { Point } from '../maple/ground';

export interface Size {
  width: number;
  height: number;
}

/** 몬스터 앞에 설 거리. 캐릭터와 몬스터가 margin 만큼 여유를 두고 한 화면(viewWidth, 맵 픽셀)에 들어가게 줄인다 */
export function framedDistance(distance: number, viewWidth: number, margin: number): number {
  return Math.min(distance, Math.max(0, viewWidth - margin * 2));
}

/**
 * 카메라가 비출 곳. 사냥 중이면 캐릭터와 몬스터 사이를 비추되, 둘이 한 화면에 안 들어가면 캐릭터가 화면 밖으로 나가지 않게 한다.
 * 발이 화면 아래 기준선에 맞춰지므로 둘 중 더 낮은 발을 기준으로 해야 둘 다 화면에 남는다
 */
export function cameraFocus(hero: Point, target: Point | null, viewWidth: number, margin: number): Point {
  if (!target) return hero;
  const reach = Math.max(0, viewWidth / 2 - margin);
  const middle = (hero.x + target.x) / 2;
  return { x: Math.min(hero.x + reach, Math.max(hero.x - reach, middle)), y: Math.max(hero.y, target.y) };
}

/** focus 가 화면 가로 가운데·발 기준선에 오는 스크롤 값(화면 픽셀). 맵 이미지 바깥은 비추지 않는다 */
export function cameraScroll(focus: Point, scale: number, view: Size, map: Size, feetFromBottom: number): Point {
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(0, max));
  return {
    x: clamp(focus.x * scale - view.width / 2, map.width * scale - view.width),
    y: clamp(focus.y * scale - (view.height - feetFromBottom), map.height * scale - view.height),
  };
}

/** 보스 몸통의 좌우 끝(맵 x)과 발 높이 */
export interface BodySpan {
  left: number;
  right: number;
  y: number;
}

/**
 * 큰 보스와 싸울 때 비출 곳. 캐릭터(좌우 heroHalf)와 보스 몸통을 함께 감싼 구간의 가운데를 비춘다.
 * 보스는 기준점이 몸통 가운데가 아니고 몸집이 화면 절반을 넘기도 해서 둘의 기준점 사이를 비추면 몸통이 잘린다.
 * 다 안 들어가면 캐릭터가 화면 끝 여유 안에 남게 한다
 */
export function spanFocus(hero: Point, heroHalf: number, body: BodySpan, viewWidth: number, margin: number): Point {
  const left = Math.min(hero.x - heroHalf, body.left);
  const right = Math.max(hero.x + heroHalf, body.right);
  const reach = Math.max(0, viewWidth / 2 - margin);
  const middle = (left + right) / 2;
  return { x: Math.min(hero.x + reach, Math.max(hero.x - reach, middle)), y: Math.max(hero.y, body.y) };
}
