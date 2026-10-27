/** 돌아다니다 목적지에 닿은 뒤 다시 걷기까지 쉬는 시간 */
const WANDER_PAUSE_MIN_MS = 1500;
const WANDER_PAUSE_EXTRA_MS = 3000;
/** 몬스터가 어느 쪽에서 나와도 바닥 끝에 몰리지 않게 앉을 자리를 바닥 끝에서 이만큼 띄운다(맵 픽셀) */
export const SEAT_EDGE_ROOM = 120;
/** 포털 위에 겹쳐 앉지 않게 포털에서 이만큼 비켜 앉는다(맵 픽셀) */
export const SEAT_PORTAL_CLEARANCE = 90;

export interface SeatState {
  /** 고른 의자 그림·앉은 동작과 캐릭터 그림을 다 받았다 */
  chairReady: boolean;
  /** 몬스터·보스와 싸우는 중. 보스 맵에 다녀오는 동안도 넣는다 */
  fighting: boolean;
  /** 포털로 맵을 옮기는 중(포털까지 걷기·오르내리기·포털 앞에서 화면이 바뀌는 동안) */
  traveling: boolean;
  /** 스킬창에서 쓴 스킬의 동작 중 */
  casting: boolean;
  /** 사냥하는 바닥 발판 위에 서 있다 */
  onGround: boolean;
  /** 걷는 중이거나 공격 동작이 남아 있다 */
  moving: boolean;
}

/** 의자를 골랐으면 일어날 일(싸움·맵 이동·스킬)이 없는 동안 계속 앉는다 */
export function shouldSit(state: SeatState): boolean {
  return state.chairReady && state.onGround && !state.fighting && !state.traveling && !state.casting && !state.moving;
}

/** 목적지에 닿은 뒤 쉬는 시간. 의자에 앉으면 일어날 일이 생길 때까지 쉰다. random 은 0~1 */
export function wanderPauseMs(seatHeld: boolean, random: number): number {
  return seatHeld ? Infinity : WANDER_PAUSE_MIN_MS + random * WANDER_PAUSE_EXTRA_MS;
}

/** 의자에 앉아 있는 동안은 쉬는 시간이 줄지 않아 다시 걸어 나가지 않는다 */
export function wanderPauseLeft(pauseMs: number, dtMs: number, seatHeld: boolean): number {
  return seatHeld ? pauseMs : pauseMs - dtMs;
}

/** 맵에 들어와 앉을 자리. 바닥 끝과 바닥 포털에서 비켜 앉는다. 바닥이 좁으면 가운데다 */
export function seatSpotX(x: number, ground: { minX: number; maxX: number }, portalXs: readonly number[] = []): number {
  const room = Math.min(SEAT_EDGE_ROOM, (ground.maxX - ground.minX) / 2);
  const clamp = (value: number) => Math.min(ground.maxX - room, Math.max(ground.minX + room, value));
  const seat = clamp(x);
  const portal = portalXs.find((each) => Math.abs(each - seat) < SEAT_PORTAL_CLEARANCE);
  if (portal === undefined) return seat;
  const toCenter = portal <= (ground.minX + ground.maxX) / 2 ? 1 : -1;
  return clamp(portal + toCenter * SEAT_PORTAL_CLEARANCE);
}
