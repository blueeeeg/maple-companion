import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEAVE_DELAY_MS, SETTLE_MS, createPresenceNotices } from './presenceNotice';

const room = (...pairs: [string, string][]) => new Map(pairs);

function setup() {
  const lines: string[] = [];
  const notices = createPresenceNotices((text) => lines.push(text), () => 'me');
  return { lines, notices };
}

describe('입장·퇴장 알림', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('처음 받은 접속자 목록은 알리지 않는다', () => {
    const { lines, notices } = setup();
    notices.update(room(['me', '단풍이'], ['b', '주황버섯']));
    expect(lines).toEqual([]);
  });

  it('입장 직후 몇 초 동안 늘어나는 접속자도 알리지 않는다', () => {
    const { lines, notices } = setup();
    notices.update(room(['me', '단풍이']));
    vi.advanceTimersByTime(SETTLE_MS - 1);
    notices.update(room(['me', '단풍이'], ['b', '주황버섯']));
    expect(lines).toEqual([]);
  });

  it('그 뒤 들어오면 바로, 나가면 잠시 뒤 알린다', () => {
    const { lines, notices } = setup();
    notices.update(room(['me', '단풍이']));
    vi.advanceTimersByTime(SETTLE_MS);
    notices.update(room(['me', '단풍이'], ['b', '주황버섯']));
    expect(lines).toEqual(['주황버섯님이 들어왔어요']);
    notices.update(room(['me', '단풍이']));
    expect(lines).toHaveLength(1);
    vi.advanceTimersByTime(LEAVE_DELAY_MS);
    expect(lines).toEqual(['주황버섯님이 들어왔어요', '주황버섯님이 나갔어요']);
  });

  it('나갔다 곧바로 다시 들어오면 둘 다 알리지 않는다', () => {
    const { lines, notices } = setup();
    notices.update(room(['me', '단풍이'], ['b', '주황버섯']));
    vi.advanceTimersByTime(SETTLE_MS);
    notices.update(room(['me', '단풍이']));
    vi.advanceTimersByTime(LEAVE_DELAY_MS - 1);
    notices.update(room(['me', '단풍이'], ['b', '주황버섯']));
    vi.advanceTimersByTime(LEAVE_DELAY_MS * 2);
    expect(lines).toEqual([]);
  });

  it('나는 알리지 않고, reset 하면 다시 처음 목록으로 본다', () => {
    const { lines, notices } = setup();
    notices.update(room(['me', '단풍이'], ['b', '주황버섯']));
    vi.advanceTimersByTime(SETTLE_MS);
    notices.update(room(['b', '주황버섯']));
    vi.advanceTimersByTime(LEAVE_DELAY_MS);
    expect(lines).toEqual([]);
    notices.reset();
    notices.update(room(['b', '주황버섯'], ['c', '슬라임']));
    expect(lines).toEqual([]);
  });
});
