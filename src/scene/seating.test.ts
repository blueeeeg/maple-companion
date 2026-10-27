import { describe, expect, it } from 'vitest';
import { SEAT_EDGE_ROOM, SEAT_PORTAL_CLEARANCE, type SeatState, seatSpotX, shouldSit, wanderPauseLeft, wanderPauseMs } from './seating';

const idle: SeatState = {
  chairReady: true,
  fighting: false,
  traveling: false,
  casting: false,
  onGround: true,
  moving: false,
};

describe('shouldSit', () => {
  it('의자를 골랐으면 바닥에 멈춰 있는 동안 앉는다', () => {
    expect(shouldSit(idle)).toBe(true);
  });

  it('의자가 없거나 아직 그림을 못 받았으면 선다', () => {
    expect(shouldSit({ ...idle, chairReady: false })).toBe(false);
  });

  it('싸움·맵 이동·스킬 동작 중에는 일어선다', () => {
    expect(shouldSit({ ...idle, fighting: true })).toBe(false);
    expect(shouldSit({ ...idle, traveling: true })).toBe(false);
    expect(shouldSit({ ...idle, casting: true })).toBe(false);
  });

  it('걷거나 공격 동작이 남아 있으면 선다. 끝나면 그 자리에 다시 앉는다', () => {
    expect(shouldSit({ ...idle, moving: true })).toBe(false);
    expect(shouldSit({ ...idle, moving: false })).toBe(true);
  });

  it('바닥이 아닌 곳(사다리·윗층 발판)에서는 앉지 않는다', () => {
    expect(shouldSit({ ...idle, onGround: false })).toBe(false);
  });
});

describe('돌아다니기', () => {
  it('의자에 앉으면 쉬는 시간이 끝나지 않는다', () => {
    expect(wanderPauseMs(true, 0.5)).toBe(Infinity);
    expect(wanderPauseLeft(1000, 16, true)).toBe(1000);
  });

  it('의자를 내리면 원래대로 1.5~4.5초 쉬고 다시 걷는다', () => {
    expect(wanderPauseMs(false, 0)).toBe(1500);
    expect(wanderPauseMs(false, 1)).toBe(4500);
    expect(wanderPauseLeft(1000, 16, false)).toBe(984);
  });
});

describe('seatSpotX', () => {
  const ground = { minX: 0, maxX: 1000 };

  it('바닥 가운데면 그 자리에 앉는다', () => {
    expect(seatSpotX(400, ground)).toBe(400);
  });

  it('바닥 끝 포털로 들어왔으면 끝에서 띄운 자리까지 걸어간다', () => {
    expect(seatSpotX(30, ground)).toBe(SEAT_EDGE_ROOM);
    expect(seatSpotX(980, ground)).toBe(1000 - SEAT_EDGE_ROOM);
  });

  it('포털 위면 바닥 가운데 쪽으로 비켜 앉는다', () => {
    expect(seatSpotX(300, ground, [300])).toBe(300 + SEAT_PORTAL_CLEARANCE);
    expect(seatSpotX(700, ground, [700])).toBe(700 - SEAT_PORTAL_CLEARANCE);
    expect(seatSpotX(400, ground, [300])).toBe(400);
  });

  it('바닥이 좁으면 가운데에 앉는다', () => {
    expect(seatSpotX(10, { minX: 0, maxX: 100 })).toBe(50);
    expect(seatSpotX(10, { minX: 0, maxX: 100 }, [50])).toBe(50);
  });
});
