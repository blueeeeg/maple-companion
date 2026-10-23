import { describe, expect, it } from 'vitest';
import {
  BOSSES,
  BOSS_HITS_MAX,
  BOSS_HITS_MIN,
  BOSS_MESO_MULTIPLIER,
  BOSS_XP,
  DEFAULT_PACE,
  type HuntProgress,
  bossDue,
  bossHits,
  bossMeso,
  bossXp,
  pickBoss,
  reservedBoss,
  resolveHunts,
  scheduledBoss,
} from './bosses';
import { KILL_XP, mesoDrop } from './encounters';
import { TOWNS } from './towns';

const henesys = TOWNS[0];
const fixed = (value: number) => () => value;

const progress = (encountersResolved: number, pendingHunts = 0): HuntProgress => ({
  activeSeconds: (encountersResolved + pendingHunts) * 180,
  huntSeconds: encountersResolved * 180,
  huntBonusSeconds: 0,
  encountersResolved,
  bossChargeSeconds: (encountersResolved % 20) * 180,
});

describe('보스 차례', () => {
  it('기본 설정이면 20번째 사냥마다 보스가 나온다', () => {
    expect(bossDue(progress(19), DEFAULT_PACE)).toBe(true);
    expect(bossDue(progress(39), DEFAULT_PACE)).toBe(true);
    expect(bossDue(progress(18), DEFAULT_PACE)).toBe(false);
    expect(bossDue(progress(20), DEFAULT_PACE)).toBe(false);
    expect(bossDue(progress(0), DEFAULT_PACE)).toBe(false);
  });

  it('보스를 끄면 나오지 않는다', () => {
    expect(bossDue(progress(19), { ...DEFAULT_PACE, bossEvery: null })).toBe(false);
  });

  it('밀린 사냥 중 보스 차례는 보스로 친다', () => {
    // 지금까지 18번 잡았고 5번 밀렸으면 19~23번 중 20번 하나가 보스다
    const result = resolveHunts(progress(18, 5), DEFAULT_PACE, 30, henesys, 5, fixed(0));
    expect(result.bosses).toEqual({ 마노: 1 });
    expect(Object.values(result.kills).reduce((sum, count) => sum + count, 0)).toBe(5);
    expect(result.xp).toBe(KILL_XP * 4 + BOSS_XP);
  });

  it('레벨에 맞는 보스가 없으면 보통 몬스터로 치고 보스 몫은 다음 차례로 넘긴다', () => {
    const character = progress(18, 5);
    const result = resolveHunts(character, DEFAULT_PACE, 5, henesys, 5, fixed(0));
    expect(result.bosses).toEqual({});
    expect(result.xp).toBe(KILL_XP * 5);
    expect(character.bossChargeSeconds).toBe(23 * 180 - 0);
    expect(character.encountersResolved).toBe(23);
  });
});

describe('보스 고르기', () => {
  it('레벨에 맞는 보스가 없으면 null', () => {
    expect(pickBoss(9)).toBeNull();
  });

  it('맞는 보스가 하나면 그 보스', () => {
    expect(pickBoss(12, fixed(0.99))?.name).toBe('마노');
  });

  it('레벨에 맞는 보스 전부에서 고른다', () => {
    const picked = new Set([0, 0.4, 0.99].map((value) => pickBoss(30, fixed(value))?.name));
    expect(picked).toEqual(new Set(['마노', '머쉬맘', '스텀피']));
  });

  it('레벨보다 높은 보스는 안 나온다', () => {
    for (let level = 10; level <= 300; level += 7) {
      const boss = pickBoss(level, fixed(0.99));
      expect(boss!.minLevel).toBeLessThanOrEqual(level);
    }
  });

  it('보스 목록은 레벨 순이고 몹 ID 가 겹치지 않는다', () => {
    const levels = BOSSES.map((boss) => boss.minLevel);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(BOSSES.map((boss) => boss.id)).size).toBe(BOSSES.length);
  });
});

describe('보스 보상', () => {
  it('기본 설정이면 경험치는 보통 몬스터의 20배, 메소는 10배쯤', () => {
    expect(BOSS_XP).toBe(KILL_XP * 20);
    const meso = bossMeso(henesys, fixed(0.5));
    // 보통 몬스터 몫과 보스 몫을 따로 반올림해서 1~2 메소 차이가 난다
    expect(Math.abs(meso - mesoDrop(henesys, fixed(0.5)) * BOSS_MESO_MULTIPLIER)).toBeLessThanOrEqual(2);
  });

  it('보스가 자주 나오면 한 번에 덜, 드물게 나오면 더 준다', () => {
    expect(bossXp({ encounterSeconds: 180, bossEvery: 10 })).toBe(KILL_XP * 10.5);
    expect(bossXp({ encounterSeconds: 180, bossEvery: 40 })).toBe(KILL_XP * 39);
    // 몬스터 주기가 짧으면 보통 몬스터도 보스도 그만큼 덜 준다
    expect(bossXp({ encounterSeconds: 60, bossEvery: 20 })).toBe(BOSS_XP / 3);
  });

  it('싸우는 횟수는 정해 둔 범위 안', () => {
    expect(bossHits(fixed(0))).toBe(BOSS_HITS_MIN);
    expect(bossHits(fixed(0.999))).toBe(BOSS_HITS_MAX);
  });
});

describe('지정한 보스', () => {
  const pinkBean = BOSSES.find((boss) => boss.name === '핑크빈')!;

  it('보스 차례에 무작위 대신 지정한 보스가 나온다', () => {
    expect(scheduledBoss(200, pinkBean.id, fixed(0))).toBe(pinkBean);
    expect(scheduledBoss(200, null, fixed(0))).toBe(BOSSES[0]);
  });

  it('레벨이 모자라거나 없는 보스면 무작위로 돌아간다', () => {
    expect(reservedBoss(100, pinkBean.id)).toBeNull();
    expect(reservedBoss(200, 1234)).toBeNull();
    expect(scheduledBoss(100, pinkBean.id, fixed(0))).toBe(BOSSES[0]);
  });

  it('밀린 사냥을 몰아 치를 때 지정한 보스는 첫 보스 차례에 한 번만 나오고 보상은 같다', () => {
    const plain = resolveHunts(progress(18, 30), DEFAULT_PACE, 200, henesys, 30, fixed(0));
    const reserved = resolveHunts(progress(18, 30), DEFAULT_PACE, 200, henesys, 30, fixed(0), pinkBean.id);
    expect(reserved.reservationUsed).toBe(true);
    expect(reserved.bosses).toEqual({ 핑크빈: 1, 마노: 1 });
    expect(plain.bosses).toEqual({ 마노: 2 });
    expect(plain.reservationUsed).toBe(false);
    expect(reserved.xp).toBe(plain.xp);
    expect(reserved.meso).toBe(plain.meso);
  });
});
