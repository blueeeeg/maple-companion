import { describe, expect, it } from 'vitest';
import { CHAT_LIMIT, CHAT_MAX_LENGTH, chatText, createThrottle } from './throttle';

describe('채팅 보내기 간격', () => {
  it('처음에는 바로 보낸다', () => {
    expect(createThrottle().wait(0)).toBe(0);
  });

  it('보낸 뒤 1초 안에는 남은 시간만큼 기다리게 한다', () => {
    const throttle = createThrottle();
    throttle.record(1000);
    expect(throttle.wait(1400)).toBe(600);
    expect(throttle.wait(2000)).toBe(0);
  });

  it('10초에 4개를 보냈으면 가장 오래된 것이 10초를 넘길 때까지 막는다', () => {
    const throttle = createThrottle();
    [0, 1000, 2000, 3000].forEach((at) => throttle.record(at));
    expect(throttle.wait(5000)).toBe(5000);
    expect(throttle.wait(9999)).toBe(1);
    expect(throttle.wait(10_000)).toBe(0);
  });

  it('서버 한도(10초 5개)보다 빡빡하다', () => {
    const throttle = createThrottle();
    let sent = 0;
    for (let now = 0; now < 10_000; now += 100) {
      if (throttle.wait(now) === 0) {
        throttle.record(now);
        sent += 1;
      }
    }
    expect(sent).toBe(CHAT_LIMIT.count);
    expect(sent).toBeLessThan(5);
  });
});

describe('채팅 글', () => {
  it('앞뒤 빈칸을 뺀다', () => {
    expect(chatText('  안녕 ')).toBe('안녕');
  });

  it('빈 글과 너무 긴 글은 안 보낸다', () => {
    expect(chatText('   ')).toBeNull();
    expect(chatText('가'.repeat(CHAT_MAX_LENGTH))).toHaveLength(CHAT_MAX_LENGTH);
    expect(chatText('가'.repeat(CHAT_MAX_LENGTH + 1))).toBeNull();
  });

  it('이모지는 한 글자로 센다(서버 char_length 와 같다)', () => {
    expect(chatText('😀'.repeat(CHAT_MAX_LENGTH))).not.toBeNull();
  });
});
