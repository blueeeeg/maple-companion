import { describe, expect, it } from 'vitest';
import { MOUNT_ART, type MountMotion, mountArtOf } from '../maple/mountArt';
import { type RideState, motionDelays, mountFrameLayout, riderImageOffset, riderLook, shouldRide } from './riding';

const HOG = mountArtOf(1902000)!;

describe('탄 캐릭터 위치', () => {
  it('앉은 몸 navel(−2,−17)이 탈것 navel 에 오게 캐릭터 그림 가운데를 옮긴다', () => {
    // 멧돼지 서기 0프레임 navel (3,−51): 3 + 2 − 8, −51 + 17 − 2
    expect(riderImageOffset(HOG.stand, 0)).toEqual({ x: -3, y: -36 });
    // 걷기 1프레임 navel (3,−52)
    expect(riderImageOffset(HOG.walk, 1)).toEqual({ x: -3, y: -37 });
  });

  it('fly 몸은 프레임 f mod 2 의 navel 을 쓴다', () => {
    const lucid = mountArtOf(1932544)!;
    expect(lucid.stand.body).toBe('fly');
    const [x, y] = lucid.stand.frames[1];
    expect(riderImageOffset(lucid.stand, 1)).toEqual({ x: x + 4 - 8, y: y + 24 - 2 });
  });

  it('characterAction 이 없는 탈것은 앉아서 타고, 있는 탈것은 그 동작이다', () => {
    expect(HOG.stand.body).toBe('sit');
    expect(HOG.walk.body).toBe('sit');
    expect(mountArtOf(1932392)!.walk.body).toBe('sit');
    expect(mountArtOf(1932544)!.walk.body).toBe('fly');
  });
});

describe('탈것 레이어 위치·순서', () => {
  const motion: MountMotion = {
    action: 'stand1',
    body: 'sit',
    frames: [
      [
        10,
        -50,
        100,
        [
          ['tamingMobFront', 30, 40, [10, -50], 'a'],
          ['saddleRear', 5, 6, [12, -48], 'b'],
          ['tamingMobMid', 20, 20, null, 'c'],
          ['characterEnd', 1, 1, [10, -50], 'd'],
          ['tamingMobBack', 2, 2, [10, -50], 'e'],
        ],
      ],
    ],
  };

  it('navel 이 있으면 그 navel 이 첫 레이어 navel 에, 없으면 캐릭터 기준점에 origin 이 온다', () => {
    const { back, front } = mountFrameLayout(motion, 0);
    const at = (index: number) => [...back, ...front].find((each) => each.index === index)!;
    expect(at(0)).toMatchObject({ x: -30, y: -40 });
    // 레드 드라코처럼 레이어마다 navel 이 다르다: (10 − 12, −50 + 48) − origin
    expect(at(1)).toMatchObject({ x: -2 - 5, y: -2 - 6 });
    // navel 없는 레이어: (탈것 navel x, 탈것 navel y − 앉은 몸 navel y) − origin
    expect(at(2)).toMatchObject({ x: 10 - 20, y: -50 + 17 - 20 });
  });

  it('뒤 tamingMobBack < saddleRear < characterEnd < 캐릭터 < tamingMobMid < tamingMobFront', () => {
    const { back, front } = mountFrameLayout(motion, 0);
    expect(back.map((each) => each.index)).toEqual([4, 1, 3]);
    expect(front.map((each) => each.index)).toEqual([2, 0]);
  });

  it('멧돼지는 안장 뒤쪽이 캐릭터 뒤, 멧돼지·안장 앞쪽이 캐릭터 앞이다', () => {
    const layers = HOG.stand.frames[0][3];
    const { back, front } = mountFrameLayout(HOG.stand, 0);
    expect(back.map((each) => layers[each.index][0])).toEqual(['saddleRear']);
    expect(front.map((each) => layers[each.index][0])).toEqual(['tamingMobMid', 'saddleFront']);
    expect(front[0]).toMatchObject({ x: -34, y: -50 });
  });

  it('딜레이는 탈것 WZ 값이다', () => {
    expect(motionDelays(HOG.stand)).toEqual([180, 180, 180, 180, 180, 180]);
    expect(motionDelays(HOG.walk)).toEqual([120, 120, 120, 120]);
  });

  it('모든 탈것 프레임에 navel·딜레이·레이어가 있다', () => {
    MOUNT_ART.forEach((art) =>
      [art.stand, art.walk].forEach((each) =>
        each.frames.forEach(([x, y, delay, layers]) => {
          expect([x, y, delay].every(Number.isFinite)).toBe(true);
          expect(layers.length).toBeGreaterThan(0);
        }),
      ),
    );
  });

  it('invisibleCape 탈것은 망토를 빼고 그린다', () => {
    const look = [2000, 12000, 1102000, 1302000];
    expect(riderLook(look, { hideCape: true })).toEqual([2000, 12000, 1302000]);
    expect(riderLook(look, {})).toEqual(look);
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
