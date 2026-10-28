import { describe, expect, it } from 'vitest';
import { BOSSES } from './bosses';
import { MOUNT_ART } from '../maple/mountArt';
import {
  MOUNTS,
  MOUNT_SHOP_ITEMS,
  buyMount,
  grantMountGifts,
  mountProgress,
  mountShopPrice,
  mountsOfBoss,
  normalizeMountData,
  selectMount,
} from './mounts';

const bossNamed = (name: string) => BOSSES.find((boss) => boss.name === name)!.id;
/** 너무 커서 뺀 탈것(샤레니안의 악마·나이트메어·붕붕붕 핑크빈)과 멧돼지와 그림이 같은 멧돼지(스킬형) */
const REMOVED = [1932636, 1932025, 1932392, 1932179];
const CROCO = 1932007;
const ROBOT = 1932028;

describe('탈것 목록', () => {
  it('그림 표와 탈것 목록이 같고 드래곤 로드·뺀 탈것은 없다', () => {
    expect(new Set(MOUNTS.map((mount) => mount.id)).size).toBe(MOUNTS.length);
    expect(MOUNT_ART.map((art) => art.id).sort()).toEqual(MOUNTS.map((mount) => mount.id).sort());
    expect(MOUNTS.map((mount) => mount.id)).not.toContain(1932881);
    REMOVED.forEach((id) => expect(MOUNTS.map((mount) => mount.id)).not.toContain(id));
    expect(MOUNTS).toHaveLength(28);
  });

  it('모든 탈것은 얻는 법이 하나다', () => {
    MOUNTS.forEach(({ source }) => {
      const paths = [source.kind === 'level', source.kind === 'boss', source.kind === 'shop'].filter(Boolean);
      expect(paths).toHaveLength(1);
      if (source.kind === 'level') expect(source.level).toBeGreaterThan(0);
      if (source.kind === 'boss') expect(BOSSES.some((boss) => boss.id === source.bossId)).toBe(true);
      if (source.kind === 'shop') expect(source.price).toBeGreaterThan(0);
    });
    const counts = { level: 0, boss: 0, shop: 0 };
    MOUNTS.forEach(({ source }) => (counts[source.kind] += 1));
    expect(counts).toEqual({ level: 6, boss: 12, shop: 10 });
  });

  it('레벨 선물은 원작 안장 3단계 사이를 채운다', () => {
    const gifts = MOUNTS.flatMap((mount) => (mount.source.kind === 'level' ? [[mount.name, mount.source.level]] : []));
    expect(gifts).toEqual([
      ['돌격! 목마', 30],
      ['멧돼지', 60],
      ['은빛갈기', 100],
      ['근두운', 140],
      ['페가수스 라이딩', 170],
      ['레드 드라코', 200],
    ]);
  });

  it('보스 드롭은 이름·테마가 맞는 보스가 떨어뜨리고 한 보스에 셋까지다', () => {
    const name = (bossName: string) => mountsOfBoss(bossNamed(bossName)).map((mount) => mount.name);
    expect(name('머쉬맘')).toEqual(['주황버섯']);
    expect(name('자쿰')).toEqual(['예티']);
    expect(name('주니어 발록')).toEqual(['발록']);
    expect(name('크림슨 발록')).toEqual(['미스트 발록', '투명발록']);
    expect(name('레비아탄')).toEqual(['드래곤 라이딩']);
    expect(name('핑크빈')).toEqual(['함께해! 핑크빈', '핑크빈과 둥둥 여행', '블랙빈과 둥둥 여행']);
    expect(name('매그너스')).toEqual(['헤카톤의 주먹']);
    expect(name('진 힐라')).toEqual(['힐라와 설원을', '루시드의 날개']);
    expect(name('마노')).toEqual([]);
    BOSSES.forEach((boss) => expect(mountsOfBoss(boss.id).length).toBeLessThanOrEqual(3));
  });

  it('상점 탈것은 장비 상점 무기보다 비싸고 값 순서로 늘어놓는다', () => {
    const prices = MOUNT_SHOP_ITEMS.map((item) => item.price);
    expect(MOUNT_SHOP_ITEMS).toHaveLength(10);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    prices.forEach((price) => {
      expect(price).toBeGreaterThanOrEqual(30_000);
      expect(price).toBeLessThanOrEqual(60_000);
    });
    expect(mountShopPrice(CROCO)).toBe(30_000);
    expect(mountShopPrice(ROBOT)).toBe(60_000);
    expect(mountShopPrice(1902000)).toBeNull();
  });
});

describe('탈것 고르기·선물·사기', () => {
  it('가진 탈것만 고르고 다시 고르면 내린다', () => {
    expect(selectMount([1902000], null, 1902000)).toBe(1902000);
    expect(selectMount([1902000], 1902000, 1902000)).toBeNull();
    expect(selectMount([1902000], null, 1932010)).toBeNull();
  });

  it('닿은 레벨 선물을 한 번만 준다', () => {
    const character = { mountOwned: [] as number[] };
    expect(grantMountGifts(character, 29)).toEqual([]);
    expect(grantMountGifts(character, 120)).toEqual([1932006, 1902000, 1902001]);
    expect(grantMountGifts(character, 120)).toEqual([]);
    expect(grantMountGifts(character, 250)).toEqual([1932011, 1932089, 1902002]);
    expect(character.mountOwned).toEqual([1932006, 1902000, 1902001, 1932011, 1932089, 1902002]);
  });

  it('새 선물 레벨을 이미 넘은 캐릭터는 켤 때 빠진 선물만 받는다', () => {
    // 안장 3단계만 있던 때 Lv.180 으로 멧돼지·은빛갈기를 받아 둔 캐릭터
    const character = { mountOwned: [1902000, 1902001, CROCO] };
    expect(grantMountGifts(character, 180)).toEqual([1932006, 1932011, 1932089]);
    expect(grantMountGifts(character, 180)).toEqual([]);
  });

  it('상점 탈것을 메소로 사면 바로 탄다', () => {
    const owner = { meso: 40_000, mountOwned: [1902000], mountSelected: 1902000 as number | null };
    expect(buyMount(owner, ROBOT)).toBe(false);
    expect(buyMount(owner, 1902001)).toBe(false);
    expect(buyMount(owner, CROCO)).toBe(true);
    expect(owner).toEqual({ meso: 10_000, mountOwned: [1902000, CROCO], mountSelected: CROCO });
    expect(buyMount({ ...owner, meso: 100_000 }, CROCO)).toBe(false);
  });

  it('모든 탈것을 센다', () => {
    expect(mountProgress([1902000, 1932636])).toEqual({ owned: 1, total: 28 });
  });

  it('저장 값을 정리한다', () => {
    expect(normalizeMountData({})).toEqual({ mountOwned: [], mountSelected: null });
    expect(normalizeMountData({ mountOwned: [1902000, 1902000, 7], mountSelected: 1902000 })).toEqual({
      mountOwned: [1902000],
      mountSelected: 1902000,
    });
  });

  it('목록에서 뺀 탈것은 가진 목록과 고른 탈것에서 빠진다', () => {
    expect(normalizeMountData({ mountOwned: [...REMOVED, 1902000], mountSelected: 1932636 })).toEqual({
      mountOwned: [1902000],
      mountSelected: null,
    });
    expect(normalizeMountData({ mountOwned: [1932392], mountSelected: 1932392 })).toEqual({ mountOwned: [], mountSelected: null });
  });
});
