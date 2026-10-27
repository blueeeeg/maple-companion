import { describe, expect, it } from 'vitest';
import { BOSSES } from './bosses';
import { MOUNT_ART } from '../maple/mountArt';
import { MOUNTS, grantMountGifts, mountProgress, mountsOfBoss, normalizeMountData, selectMount } from './mounts';

const bossNamed = (name: string) => BOSSES.find((boss) => boss.name === name)!.id;

describe('탈것 목록', () => {
  it('그림 표에 있는 탈것만 있고 드래곤 로드는 없다', () => {
    const artIds = new Set(MOUNT_ART.map((art) => art.id));
    expect(new Set(MOUNTS.map((mount) => mount.id)).size).toBe(MOUNTS.length);
    MOUNTS.forEach((mount) => expect(artIds.has(mount.id)).toBe(true));
    expect(MOUNTS.map((mount) => mount.id)).not.toContain(1932881);
  });

  it('레벨 선물은 원작 안장 3단계다', () => {
    const gifts = MOUNTS.flatMap((mount) => (mount.source?.kind === 'level' ? [[mount.name, mount.source.level]] : []));
    expect(gifts).toEqual([
      ['멧돼지', 60],
      ['은빛갈기', 100],
      ['레드 드라코', 200],
    ]);
  });

  it('보스 드롭은 이름·테마가 맞는 보스가 떨어뜨린다', () => {
    const name = (bossName: string) => mountsOfBoss(bossNamed(bossName)).map((mount) => mount.name);
    expect(name('머쉬맘')).toEqual(['주황버섯']);
    expect(name('주니어 발록')).toEqual(['발록']);
    expect(name('크림슨 발록')).toEqual(['미스트 발록']);
    expect(name('레비아탄')).toEqual(['드래곤 라이딩']);
    expect(name('핑크빈')).toEqual(['함께해! 핑크빈']);
    expect(name('진 힐라')).toEqual(['힐라와 설원을']);
    expect(name('자쿰')).toEqual([]);
  });
});

describe('탈것 고르기·선물', () => {
  it('가진 탈것만 고르고 다시 고르면 내린다', () => {
    expect(selectMount([1902000], null, 1902000)).toBe(1902000);
    expect(selectMount([1902000], 1902000, 1902000)).toBeNull();
    expect(selectMount([1902000], null, 1932010)).toBeNull();
  });

  it('닿은 레벨 선물을 한 번만 준다', () => {
    const character = { mountOwned: [] as number[] };
    expect(grantMountGifts(character, 59)).toEqual([]);
    expect(grantMountGifts(character, 120)).toEqual([1902000, 1902001]);
    expect(grantMountGifts(character, 120)).toEqual([]);
    expect(grantMountGifts(character, 250)).toEqual([1902002]);
    expect(character.mountOwned).toEqual([1902000, 1902001, 1902002]);
  });

  it('얻는 법이 있는 탈것만 센다', () => {
    expect(mountProgress([1902000, 1932636])).toEqual({ owned: 1, total: 9 });
  });

  it('저장 값을 정리한다', () => {
    expect(normalizeMountData({})).toEqual({ mountOwned: [], mountSelected: null });
    expect(normalizeMountData({ mountOwned: [1902000, 1902000, 7], mountSelected: 1902000 })).toEqual({
      mountOwned: [1902000],
      mountSelected: 1902000,
    });
  });
});
