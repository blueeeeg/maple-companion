import { describe, expect, it } from 'vitest';
import { REMOTE_DELAY_MS, REMOTE_SNAP_DISTANCE, createRemoteMotion } from './remoteMotion';

describe('다른 사람 캐릭터 이어 걷기', () => {
  it('처음 받은 자리에 바로 선다', () => {
    const motion = createRemoteMotion({ x: 10, y: 20 }, 1000);
    expect(motion.sample(1000)).toEqual({ x: 10, y: 20 });
    expect(motion.settled(1000)).toBe(true);
  });

  it('받은 두 자리 사이를 한 간격 늦게 잇는다', () => {
    const motion = createRemoteMotion({ x: 0, y: 0 }, 0);
    motion.push({ x: 100, y: 0 }, 200);
    // 200ms 에 받은 자리는 400ms 에 닿는다
    expect(motion.sample(200).x).toBeCloseTo(0);
    expect(motion.sample(300).x).toBeCloseTo(50);
    expect(motion.sample(400).x).toBeCloseTo(100);
    expect(motion.settled(399)).toBe(false);
    expect(motion.settled(400)).toBe(true);
  });

  it('여러 번 받으면 그 길을 따라간다', () => {
    const motion = createRemoteMotion({ x: 0, y: 0 }, 0);
    motion.push({ x: 50, y: 0 }, 200);
    motion.push({ x: 50, y: -40 }, 400);
    expect(motion.sample(400)).toEqual({ x: 50, y: 0 });
    expect(motion.sample(500).y).toBeCloseTo(-20);
    expect(motion.sample(10_000)).toEqual({ x: 50, y: -40 });
  });

  it('오래 서 있다 다시 움직이면 첫걸음이 순간이동하지 않는다', () => {
    const motion = createRemoteMotion({ x: 0, y: 0 }, 0);
    motion.push({ x: 40, y: 0 }, 10_000);
    expect(motion.sample(10_000).x).toBeCloseTo(0);
    expect(motion.sample(10_100).x).toBeCloseTo(20);
    expect(motion.sample(10_000 + REMOTE_DELAY_MS).x).toBeCloseTo(40);
  });

  it('포털처럼 멀리 옮기면 걸어가지 않고 바로 옮긴다', () => {
    const motion = createRemoteMotion({ x: 0, y: 0 }, 0);
    motion.push({ x: REMOTE_SNAP_DISTANCE + 1, y: 0 }, 500);
    expect(motion.sample(500)).toEqual({ x: REMOTE_SNAP_DISTANCE + 1, y: 0 });
  });

  it('받은 순서보다 늦게 그려도 마지막 자리를 넘지 않는다', () => {
    const motion = createRemoteMotion({ x: 0, y: 0 }, 0);
    for (let at = 200; at <= 2000; at += 200) motion.push({ x: at / 10, y: 0 }, at);
    expect(motion.sample(5000)).toEqual({ x: 200, y: 0 });
  });
});
