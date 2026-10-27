import type { Point } from '../maple/ground';
import { API_FEET_BIAS, BODY_NAVEL, type MountMotion } from '../maple/mountArt';

/** 탄 채 걷는 속도 배율. WZ 에 탈것 속도 값이 없어 정한 값이다. 보상 계산은 걷는 속도와 상관없다 */
export const RIDE_SPEED_SCALE = 1.3;

export interface RideState {
  /** 고른 탈것 그림과 캐릭터 그림을 다 받았다 */
  mountReady: boolean;
  /** 의자를 골랐다. 앉는 것이 먼저라 맵을 옮길 때만 탄다 */
  chairSelected: boolean;
  /** 포털로 맵을 옮기는 중 */
  traveling: boolean;
  /** 몬스터·보스와 싸우거나 다가가는 중, 보스 맵에 가 있는 동안. 탈것에는 공격 동작이 없다 */
  fighting: boolean;
  /** 스킬창에서 쓴 스킬의 동작 중 */
  casting: boolean;
  /** 사다리·로프를 타는 중. 탈것 기준으로 사다리 x 를 다시 맞춰야 해서 내린다 */
  climbing: boolean;
}

/** 탈것은 돌아다니거나 맵을 옮겨 걸을 때만 탄다 */
export function shouldRide(state: RideState): boolean {
  if (!state.mountReady || state.fighting || state.casting || state.climbing) return false;
  return state.traveling || !state.chairSelected;
}

/**
 * 탈것을 넣어 받은 API 그림(FeetCenter)의 가운데를 지면에서 옮길 거리. 왼쪽을 볼 때 기준이고 오른쪽을 보면 지면을 축으로 뒤집는다.
 * 그림의 프레임 f 는 탈것 프레임 f 와 몸 프레임 f mod 몸 프레임 수를 같이 그린다
 */
export function riderImageOffset(motion: MountMotion, frame: number): Point {
  const [navelX, navelY] = motion.frames[frame];
  const bodyFrames = BODY_NAVEL[motion.action];
  const body = bodyFrames[frame % bodyFrames.length];
  return { x: navelX - body.x + API_FEET_BIAS.x, y: navelY - body.y + API_FEET_BIAS.y };
}

export const motionDelays = (motion: MountMotion) => motion.frames.map(([, , delay]) => delay);
