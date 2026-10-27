import { describe, expect, it } from 'vitest';
import { DEFAULT_PACE, type HuntProgress, settleHunt } from './bosses';
import { manualRewardBudget, settleManualKill } from './manualHunt';
import { TOWNS } from './towns';

const town = TOWNS[0];
const progress = (activeSeconds: number): HuntProgress => ({
  activeSeconds,
  huntSeconds: 0,
  huntBonusSeconds: 0,
  encountersResolved: 0,
  bossChargeSeconds: 0,
});
const fixed = () => 0.5;

describe('직접 조작 사냥 보상', () => {
  it('자동 사냥과 같은 사냥 시계에서 한 마리 몫씩 꺼낸다', () => {
    const clock = progress(DEFAULT_PACE.encounterSeconds * 2);
    expect(manualRewardBudget(clock, DEFAULT_PACE)).toBe(2);
    const reward = settleManualKill(clock, DEFAULT_PACE, town, 'huntClock', fixed);
    expect(reward).toEqual(settleHunt(progress(DEFAULT_PACE.encounterSeconds * 2), DEFAULT_PACE, town, false, fixed));
    expect(manualRewardBudget(clock, DEFAULT_PACE)).toBe(1);
    expect(clock.encountersResolved).toBe(1);
    expect(clock.bossChargeSeconds).toBe(DEFAULT_PACE.encounterSeconds);
  });

  it('시계가 비면 보상도 보스 몫도 없고 시계를 건드리지 않는다', () => {
    const clock = progress(DEFAULT_PACE.encounterSeconds - 1);
    expect(settleManualKill(clock, DEFAULT_PACE, town)).toBeNull();
    expect(clock).toEqual(progress(DEFAULT_PACE.encounterSeconds - 1));
  });

  it('한 시간 동안 아무리 많이 잡아도 자동 사냥만큼만 받는다', () => {
    const clock = progress(3600);
    const rewards = Array.from({ length: 100 }, () => settleManualKill(clock, DEFAULT_PACE, town, 'huntClock', fixed));
    expect(rewards.filter(Boolean)).toHaveLength(3600 / DEFAULT_PACE.encounterSeconds);
  });

  it('몬스터를 꺼 두면 보상이 없다', () => {
    const clock = progress(3600);
    expect(manualRewardBudget(clock, null)).toBe(0);
    expect(settleManualKill(clock, null, town)).toBeNull();
  });

  it('perKill 이면 시계와 상관없이 잡을 때마다 한 마리 보상을 준다', () => {
    const clock = progress(0);
    expect(manualRewardBudget(clock, DEFAULT_PACE, 'perKill')).toBe(Infinity);
    expect(settleManualKill(clock, DEFAULT_PACE, town, 'perKill', fixed)?.xp).toBeGreaterThan(0);
    expect(clock).toEqual(progress(0));
  });
});
