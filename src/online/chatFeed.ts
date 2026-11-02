// 원작처럼 채팅창 없이 EXP 바 위에 잠깐 뜨는 줄과 Enter 입력창의 규칙. DOM 없이 시험한다

/** 새 글이 오면 EXP 바 위에 띄우는 마지막 줄 수 */
export const FEED_LINES = 3;
/** 마지막 글이 오고 이만큼 지나면 다 사라진다 */
export const FEED_SHOW_MS = 8000;
/** 사라지기 전 흐려지는 시간 */
export const FEED_FADE_MS = 1000;

export const feedLines = <T>(lines: readonly T[], count = FEED_LINES): T[] => lines.slice(Math.max(0, lines.length - count));

/** 줄 묶음의 투명도. 새 글이 올 때마다(poke) 처음부터 다시 센다 */
export function createChatFeed(showMs = FEED_SHOW_MS, fadeMs = FEED_FADE_MS) {
  let shownAt = -Infinity;
  return {
    poke(now: number): void {
      shownAt = now;
    },
    hide(): void {
      shownAt = -Infinity;
    },
    opacity(now: number): number {
      const left = showMs - (now - shownAt);
      if (left <= 0) return 0;
      return Math.min(1, left / fadeMs);
    },
    /** 흐려지기 시작할 때까지(ms). 이미 흐려지는 중이면 0 */
    fadeIn(now: number): number {
      return Math.max(0, showMs - fadeMs - (now - shownAt));
    },
  };
}

export interface KeyLike {
  key: string;
  isComposing?: boolean;
  repeat?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

/**
 * 창 전체에서 받은 키. 입력창이 닫혀 있고 다른 입력칸에 쓰는 중이 아닐 때 Enter 면 입력창을 연다.
 * 한글 조합을 끝내는 Enter·누르고 있는 Enter·조합키는 넘긴다
 */
export function windowChatKey(event: KeyLike, context: { open: boolean; typing: boolean; allowed: boolean }): 'open' | null {
  if (event.key !== 'Enter' || event.isComposing || event.repeat) return null;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  if (context.open || context.typing || !context.allowed) return null;
  return 'open';
}

/** 입력창 안에서 받은 키. 조합 중인 Enter 는 글자를 확정하는 것이라 보내지 않는다 */
export function inputChatKey(event: KeyLike): 'send' | 'cancel' | null {
  if (event.key === 'Escape') return 'cancel';
  if (event.key === 'Enter' && !event.isComposing) return 'send';
  return null;
}
