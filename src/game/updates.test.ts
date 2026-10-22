import { describe, expect, it } from 'vitest';
import {
  CHECK_EVERY_MS,
  FIRST_CHECK_DELAY_MS,
  RETRY_AFTER_FAILURE_MS,
  isCheckDue,
  shouldNotifyUpdate,
  updateNotice,
} from './updates';

describe('언제 업데이트를 확인하나', () => {
  const startedAt = 1_000_000;

  it('켜고 조금 지난 뒤에 처음 묻는다', () => {
    const clock = { startedAt, lastCheckedAt: null, lastFailed: false };
    expect(isCheckDue(clock, startedAt)).toBe(false);
    expect(isCheckDue(clock, startedAt + FIRST_CHECK_DELAY_MS - 1)).toBe(false);
    expect(isCheckDue(clock, startedAt + FIRST_CHECK_DELAY_MS)).toBe(true);
  });

  it('물어본 뒤로는 몇 시간마다 묻는다', () => {
    const clock = { startedAt, lastCheckedAt: startedAt + FIRST_CHECK_DELAY_MS, lastFailed: false };
    expect(isCheckDue(clock, clock.lastCheckedAt + CHECK_EVERY_MS - 1)).toBe(false);
    expect(isCheckDue(clock, clock.lastCheckedAt + CHECK_EVERY_MS)).toBe(true);
  });

  it('실패하면 더 일찍 다시 묻는다', () => {
    const clock = { startedAt, lastCheckedAt: startedAt + FIRST_CHECK_DELAY_MS, lastFailed: true };
    expect(RETRY_AFTER_FAILURE_MS).toBeLessThan(CHECK_EVERY_MS);
    expect(isCheckDue(clock, clock.lastCheckedAt + RETRY_AFTER_FAILURE_MS - 1)).toBe(false);
    expect(isCheckDue(clock, clock.lastCheckedAt + RETRY_AFTER_FAILURE_MS)).toBe(true);
  });

  it('잠자기에서 깨어나 한참 지났으면 바로 묻는다', () => {
    const clock = { startedAt, lastCheckedAt: startedAt, lastFailed: false };
    expect(isCheckDue(clock, startedAt + 3 * CHECK_EVERY_MS)).toBe(true);
  });
});

describe('새 버전 알림은 버전마다 한 번', () => {
  it('처음 보는 버전만 알린다', () => {
    expect(shouldNotifyUpdate(null, '0.1.2')).toBe(true);
    expect(shouldNotifyUpdate('0.1.2', '0.1.2')).toBe(false);
    expect(shouldNotifyUpdate('0.1.2', '0.1.3')).toBe(true);
  });

  it('알림 문구에 v 가 한 번만 붙는다', () => {
    expect(updateNotice('0.1.2').title).toBe('새 버전 v0.1.2 가 나왔어요');
    expect(updateNotice('v0.1.2').title).toBe('새 버전 v0.1.2 가 나왔어요');
    expect(updateNotice('0.1.2').body).toContain('「업데이트 (v0.1.2)」');
  });
});
