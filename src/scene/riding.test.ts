import { describe, expect, it } from 'vitest';
import { MOUNT_ART, mountArtOf } from '../maple/mountArt';
import { type RideState, motionDelays, riderImageOffset, shouldRide } from './riding';

const HOG = mountArtOf(1902000)!;
const BALROG = mountArtOf(1932010)!;

describe('탈것 그림 위치', () => {
  // 조사에서 API 그림과 직접 합성을 픽셀 비교해 맞춘 값이다
  it('서기 0프레임은 지면에서 탈것 navel + (0, 19) 에 그림 가운데가 온다', () => {
    expect(riderImageOffset(HOG.stand, 0)).toEqual({ x: 3, y: -32 });
    expect(riderImageOffset(BALROG.stand, 0)).toEqual({ x: 7, y: -92 });
  });

  it('탈것 프레임마다 navel 이 출렁이고 몸 프레임은 몸 프레임 수로 돈다', () => {
    // 멧돼지 서기 3프레임: navel (3,−54), 몸 stand1 0프레임 (−8,−21)
    expect(riderImageOffset(HOG.stand, 3)).toEqual({ x: 3, y: -35 });
    // 서기 4프레임: navel (3,−53), 몸 stand1 1프레임 (−7,−20)
    expect(riderImageOffset(HOG.stand, 4)).toEqual({ x: 2, y: -35 });
    // 걷기 3프레임: navel (3,−52), 몸 walk1 3프레임 (−6,−18)
    expect(riderImageOffset(HOG.walk, 3)).toEqual({ x: 1, y: -36 });
  });

  it('딜레이는 탈것 WZ 값이다', () => {
    expect(motionDelays(HOG.stand)).toEqual([180, 180, 180, 180, 180, 180]);
    expect(motionDelays(HOG.walk)).toEqual([120, 120, 120, 120]);
  });

  it('모든 탈것의 서기·걷기 프레임에 navel 과 딜레이가 있다', () => {
    MOUNT_ART.forEach((art) =>
      [art.stand, art.walk].forEach((motion) => {
        expect(motion.frames.length).toBeGreaterThan(0);
        motion.frames.forEach(([x, y, delay]) => expect([x, y, delay].every(Number.isFinite)).toBe(true));
      }),
    );
  });

  it('서기 노드를 못 읽는 루시드의 날개는 서 있을 때도 걷기 그림이다', () => {
    const lucid = mountArtOf(1932544);
    if (lucid) expect(lucid.stand.action).toBe('walk1');
  });
});

describe('탈것 타기', () => {
  const wander: RideState = {
    mountReady: true,
    chairSelected: false,
    traveling: false,
    fighting: false,
    casting: false,
    climbing: false,
  };

  it('의자가 없으면 돌아다니는 동안 탄다', () => {
    expect(shouldRide(wander)).toBe(true);
  });

  it('의자를 골랐으면 앉는 것이 먼저라 맵을 옮길 때만 탄다', () => {
    expect(shouldRide({ ...wander, chairSelected: true })).toBe(false);
    expect(shouldRide({ ...wander, chairSelected: true, traveling: true })).toBe(true);
  });

  it('싸움·보스·스킬·사다리·로프에서는 내린다', () => {
    expect(shouldRide({ ...wander, fighting: true })).toBe(false);
    expect(shouldRide({ ...wander, traveling: true, fighting: true })).toBe(false);
    expect(shouldRide({ ...wander, casting: true })).toBe(false);
    expect(shouldRide({ ...wander, traveling: true, climbing: true })).toBe(false);
  });

  it('탈것 그림을 다 받기 전에는 걷는다', () => {
    expect(shouldRide({ ...wander, mountReady: false })).toBe(false);
    expect(shouldRide({ ...wander, mountReady: false, traveling: true })).toBe(false);
  });
});
