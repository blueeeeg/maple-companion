import type { Point } from '../maple/ground';
import { API_FEET_BIAS, BODY_NAVEL, type MountArt, type MountMotion, type MountZ } from '../maple/mountArt';

// 탈것 그리는 규칙은 KMS 389 WZ 값을 API 그림과 픽셀 비교해 맞춘 것이다. 좌표는 모두 캐릭터가 왼쪽을 볼 때 지면(발) 기준이고,
// 오른쪽을 보면 지면을 축으로 통째로 뒤집는다

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

const bodyNavel = (motion: MountMotion, frame: number): Point => {
  const navels = BODY_NAVEL[motion.body];
  return navels[frame % navels.length];
};

/** 탈것 프레임 f 에서 캐릭터(FeetCenter 그림) 가운데를 지면에서 옮길 거리. 몸 navel 이 탈것 navel 에 온다 */
export function riderImageOffset(motion: MountMotion, frame: number): Point {
  const [navelX, navelY] = motion.frames[frame];
  const body = bodyNavel(motion, frame);
  return { x: navelX - body.x + API_FEET_BIAS.x, y: navelY - body.y + API_FEET_BIAS.y };
}

// 같은 쪽 안에서 그리는 순서. 레이어 순열을 다 그려 API 그림과 0% 가 되는 것을 골랐다. characterEnd 는 이름과 달리 캐릭터 뒤다
const Z_RANK: Record<MountZ, number> = {
  tamingMobBack: 0,
  tamingMobRear: 1,
  saddleRear: 1,
  characterEnd: 2,
  tamingMobMid: 10,
  saddleFront: 11,
  tamingMobFront: 12,
};
const BEHIND_RIDER = 10;

export interface PlacedMountLayer {
  /** 프레임의 레이어 번호 */
  index: number;
  /** 그림 왼쪽 위. 지면 기준 */
  x: number;
  y: number;
}

/**
 * 탈것 프레임 f 의 레이어 위치와 순서. navel 이 있는 레이어는 그 navel 이 첫 레이어 navel 에 오게,
 * 없는 레이어(나이트메어 안장·헤카톤의 새)는 캐릭터 기준점(탈것 navel 에서 몸 navel 높이만큼 아래)에 origin 을 둔다
 */
export function mountFrameLayout(motion: MountMotion, frame: number): { back: PlacedMountLayer[]; front: PlacedMountLayer[] } {
  const [navelX, navelY, , layers] = motion.frames[frame];
  const body = bodyNavel(motion, frame);
  const placed = layers.map(([z, originX, originY, navel], index) => {
    const anchor = navel ? { x: navelX - navel[0], y: navelY - navel[1] } : { x: navelX, y: navelY - body.y };
    return { index, z, x: anchor.x - originX, y: anchor.y - originY };
  });
  const sorted = placed.sort((a, b) => Z_RANK[a.z] - Z_RANK[b.z] || a.index - b.index);
  const strip = ({ index, x, y }: (typeof placed)[number]) => ({ index, x, y });
  return {
    back: sorted.filter((each) => Z_RANK[each.z] < BEHIND_RIDER).map(strip),
    front: sorted.filter((each) => Z_RANK[each.z] >= BEHIND_RIDER).map(strip),
  };
}

export const motionDelays = (motion: MountMotion) => motion.frames.map(([, , delay]) => delay);

const CAPE = 110;

/** 탄 캐릭터 모습. invisibleCape 탈것이면 망토를 뺀다 */
export const riderLook = (look: number[], art: Pick<MountArt, 'hideCape'>): number[] =>
  art.hideCape ? look.filter((itemId) => Math.floor(itemId / 10000) !== CAPE) : look;
