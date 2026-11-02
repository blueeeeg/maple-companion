/** 서버는 10초에 5개까지 받는다. 그보다 조금 빡빡하게 막아 서버에서 거절당하지 않게 한다 */
export const CHAT_LIMIT = { count: 4, windowMs: 10_000, gapMs: 1000 };
/** 서버 check 제약과 같다 */
export const CHAT_MAX_LENGTH = 120;

export interface Throttle {
  /** 지금 보내려면 더 기다려야 하는 시간(ms). 0 이면 바로 보낼 수 있다 */
  wait(now: number): number;
  record(now: number): void;
}

export function createThrottle(limit = CHAT_LIMIT): Throttle {
  let sent: number[] = [];
  return {
    wait(now) {
      sent = sent.filter((at) => now - at < limit.windowMs);
      if (sent.length === 0) return 0;
      const gap = limit.gapMs - (now - sent[sent.length - 1]);
      const full = sent.length >= limit.count ? limit.windowMs - (now - sent[0]) : 0;
      return Math.max(0, gap, full);
    },
    record(now) {
      sent.push(now);
    },
  };
}

/** 앞뒤 빈칸을 뺀 글. 비었거나 너무 길면 null */
export function chatText(raw: string): string | null {
  const text = raw.trim();
  if (!text || Array.from(text).length > CHAT_MAX_LENGTH) return null;
  return text;
}
