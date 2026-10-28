import { describe, expect, it } from 'vitest';
import { BOSSES, DEFAULT_PACE, type HuntProgress, ZAKUM_ID, bossesOf, drawFromBag, pickBoss, reservedBoss, resolveHunts } from './bosses';
import { CLASSIC_BOSSES, CLASSIC_ZAKUM_ARMS } from './bosses.classic';
import { normalizeReservedBoss } from './bossChallenge';
import { chairsFor } from './chairs';
import { mountsFor } from './mounts';
import { bossRecord } from './records';
import { townsFor } from './towns';

const fixed = (value: number) => () => value;
const progress = (): HuntProgress => ({
  activeSeconds: 1e9,
  huntSeconds: 0,
  huntBonusSeconds: 0,
  encountersResolved: 0,
  bossChargeSeconds: 1e9,
  bossBag: [],
  lastBossId: null,
});

describe('클래식 보스', () => {
  it('그 시대 보스 목록이고 지금 시대 목록은 그대로다', () => {
    expect(bossesOf('classic')).toBe(CLASSIC_BOSSES);
    expect(bossesOf()).toBe(BOSSES);
    expect(BOSSES).toHaveLength(15);
    expect(CLASSIC_BOSSES.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['마노', '머쉬맘', '좀비 머쉬맘', '자쿰', '파풀라투스', '피아누스', '핑크빈', '크림슨 발록', '주니어 발록']),
    );
    expect(CLASSIC_BOSSES.map(({ name }) => name)).not.toContain('아카이럼');
  });

  it('마노·주니어 발록은 v83 에 있는 맵에서 싸운다', () => {
    const mapOf = (name: string) => CLASSIC_BOSSES.find((boss) => boss.name === name)!.mapId;
    expect(mapOf('마노')).not.toBe(104010200);
    expect(mapOf('주니어 발록')).not.toBe(105030500);
    expect(mapOf('자쿰')).toBe(280030000);
  });

  it('자쿰은 몸통에 팔 여덟 개를 겹친다', () => {
    const zakum = CLASSIC_BOSSES.find((boss) => boss.id === ZAKUM_ID)!;
    expect(zakum.parts).toEqual(CLASSIC_ZAKUM_ARMS);
    expect(CLASSIC_ZAKUM_ARMS).toHaveLength(8);
    expect(BOSSES.find((boss) => boss.id === ZAKUM_ID)!.parts).toBeUndefined();
  });

  it('보스 이름은 같은 시대 마을 몬스터와 겹치지 않는다', () => {
    const monsters = new Set(townsFor('classic').flatMap((town) => town.monsters.map(({ name }) => name)));
    expect(CLASSIC_BOSSES.filter((boss) => monsters.has(boss.name))).toEqual([]);
  });

  it('클래식 캐릭터는 클래식 보스만 만나고, 지금 시대 보스를 셔플 백에 남겨 뒀어도 빼고 뽑는다', () => {
    expect(pickBoss(200, fixed(0.99), 'classic')?.name).toBe('핑크빈');
    const drawn = drawFromBag([8860000, 8880405], null, 200, fixed(0), 'classic')!;
    expect(CLASSIC_BOSSES).toContain(drawn.boss);
    expect(reservedBoss(200, 8860000, 'classic')).toBeNull();
    expect(reservedBoss(200, 8180001, 'classic')?.name).toBe('그리프');
    expect(reservedBoss(200, 8180001)).toBeNull();
  });

  it('숨긴 동안 치른 보스 차례도 클래식 보스다', () => {
    const result = resolveHunts(progress(), DEFAULT_PACE, 200, townsFor('classic')[0], 1, fixed(0), null, 'classic');
    expect(Object.keys(result.bosses).every((name) => CLASSIC_BOSSES.some((boss) => boss.name === name))).toBe(true);
    expect(Object.keys(result.bosses)).toHaveLength(1);
  });

  it('저장된 보스 지정은 그 시대 목록으로 읽는다', () => {
    expect(normalizeReservedBoss(8860000, 'classic')).toBeNull();
    expect(normalizeReservedBoss(8860000)).toBe(8860000);
    expect(normalizeReservedBoss(8180000, 'classic')).toBe(8180000);
  });

  it('보스 기록은 1단계 때 잡은 지금 시대 보스도 센다', () => {
    const book = { 자쿰: 2, 아카이럼: 1, 그리프: 3 };
    expect(bossRecord(book, 'classic')).toMatchObject({ total: 6 });
    expect(bossRecord(book).total).toBe(3);
  });

  it('의자·탈것은 클래식 보스에도 있는 보스 것만 얻는다', () => {
    const chairBosses = new Set(chairsFor('classic').map((chair) => chair.bossId));
    expect([...chairBosses].every((id) => CLASSIC_BOSSES.some((boss) => boss.id === id))).toBe(true);
    expect(chairsFor('classic').length).toBeLessThan(chairsFor().length);
    expect(mountsFor('classic').some(({ source }) => source.kind === 'level')).toBe(true);
    expect(mountsFor('classic').some(({ name }) => name === '헤카톤의 주먹')).toBe(false);
  });
});
