import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from './appearance';
import { DEFAULT_PACE, resolveHunts } from './bosses';
import { ENCOUNTER_EVERY_ACTIVE_SECONDS, KILL_XP, encountersDue } from './encounters';
import { ADVANCEMENT_LEVELS, advancementTier, describeJob } from './jobs';
import { MAX_LEVEL, XP_PER_ACTIVE_SECOND, levelInfo, totalXpForLevel } from './progression';
import { TOWNS, pickNextTown } from './towns';

/** 사냥 보너스까지 합친 활동 1초당 경험치 */
const XP_PER_SECOND = XP_PER_ACTIVE_SECOND + KILL_XP / ENCOUNTER_EVERY_ACTIVE_SECONDS;
const hoursToReach = (level: number) => totalXpForLevel(level) / XP_PER_SECOND / 3600;

describe('경험치 곡선', () => {
  it('1차 전직은 첫날 몇 분 안에 온다', () => {
    expect(hoursToReach(10) * 60).toBeLessThan(10);
  });

  it('6차 전직은 하루 4시간 기준 5~6주 걸린다', () => {
    const days = hoursToReach(260) / 4;
    expect(days).toBeGreaterThan(30);
    expect(days).toBeLessThan(45);
  });

  it('누적 경험치로 레벨과 진행률을 구한다', () => {
    expect(levelInfo(0)).toMatchObject({ level: 1, xpIntoLevel: 0 });
    const lv30 = totalXpForLevel(30);
    expect(levelInfo(lv30).level).toBe(30);
    expect(levelInfo(lv30 - 1).level).toBe(29);
    expect(levelInfo(lv30 + 1).ratio).toBeGreaterThan(0);
  });

  it('만렙을 넘는 경험치는 만렙에서 멈춘다', () => {
    expect(levelInfo(Number.MAX_SAFE_INTEGER)).toMatchObject({ level: MAX_LEVEL, ratio: 1 });
  });
});

describe('전직', () => {
  it('전직 레벨마다 차수가 오른다', () => {
    expect(advancementTier(9)).toBe(0);
    expect(ADVANCEMENT_LEVELS.map(advancementTier)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('직업을 안 고르면 레벨이 올라도 초보자로 남고 전직 가능 표시가 뜬다', () => {
    expect(describeJob(5, null, DEFAULT_APPEARANCE)).toMatchObject({ title: '초보자', canChooseJob: false });
    expect(describeJob(45, null, DEFAULT_APPEARANCE)).toMatchObject({ title: '초보자', canChooseJob: true });
  });

  it('이름 뒤에 차수를 붙이고 5·6차는 4차 이름을 쓴다', () => {
    expect(describeJob(65, 'hero', DEFAULT_APPEARANCE).title).toBe('크루세이더 · 3차');
    expect(describeJob(265, 'bowmaster', DEFAULT_APPEARANCE).title).toBe('보우마스터 · 6차');
  });
});

describe('사냥', () => {
  it('정산한 수만큼만 남은 사냥이 줄어든다', () => {
    const T = ENCOUNTER_EVERY_ACTIVE_SECONDS;
    const clock = (activeSeconds: number, resolved: number) => ({ activeSeconds, huntSeconds: resolved * T, huntBonusSeconds: 0 });
    const active = T * 5 + 10;
    expect(encountersDue(clock(active, 0), T)).toBe(5);
    expect(encountersDue(clock(active, 3), T)).toBe(2);
    // 활동 기록이 초기화돼도 음수가 되지 않는다
    expect(encountersDue(clock(0, 3), T)).toBe(0);
  });

  it('밀린 사냥을 한 번에 정산한다', () => {
    const T = ENCOUNTER_EVERY_ACTIVE_SECONDS;
    const progress = { activeSeconds: T * 4, huntSeconds: 0, huntBonusSeconds: 0, encountersResolved: 0, bossChargeSeconds: 0 };
    const result = resolveHunts(progress, DEFAULT_PACE, 1, TOWNS[0], 4, () => 0);
    expect(progress.encountersResolved).toBe(4);
    expect(encountersDue(progress, T)).toBe(0);
    expect(result.xp).toBe(KILL_XP * 4);
    expect(Object.values(result.kills).reduce((sum, count) => sum + count, 0)).toBe(4);
  });
});

describe('마을', () => {
  it('지금 마을은 다시 고르지 않고 레벨이 모자란 마을은 안 간다', () => {
    for (let trial = 0; trial < 50; trial += 1) {
      const town = pickNextTown(12, 'henesys');
      expect(town.id).not.toBe('henesys');
      expect(town.minLevel).toBeLessThanOrEqual(12);
    }
  });
});
