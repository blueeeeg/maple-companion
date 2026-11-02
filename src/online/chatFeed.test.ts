import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManualKeys } from '../ui/manualKeys';
import { FEED_FADE_MS, FEED_LINES, FEED_SHOW_MS, createChatFeed, feedLines, inputChatKey, windowChatKey } from './chatFeed';

describe('EXP 바 위 채팅 줄', () => {
  it('새 글이 오면 마지막 몇 줄만 띄운다', () => {
    expect(FEED_LINES).toBeGreaterThanOrEqual(2);
    expect(FEED_LINES).toBeLessThanOrEqual(3);
    expect(feedLines(['a', 'b', 'c', 'd', 'e'])).toEqual(['c', 'd', 'e']);
    expect(feedLines(['a'])).toEqual(['a']);
    expect(feedLines([])).toEqual([]);
  });

  it('또렷하게 있다가 마지막에 흐려져 약 8초 뒤 사라지고, 새 글이 오면 다시 센다', () => {
    const feed = createChatFeed();
    expect(feed.opacity(0)).toBe(0);
    feed.poke(1000);
    expect(feed.opacity(1000)).toBe(1);
    expect(feed.opacity(1000 + FEED_SHOW_MS - FEED_FADE_MS)).toBe(1);
    expect(feed.opacity(1000 + FEED_SHOW_MS - FEED_FADE_MS / 2)).toBeCloseTo(0.5);
    expect(feed.opacity(1000 + FEED_SHOW_MS)).toBe(0);
    expect(feed.fadeIn(1000)).toBe(FEED_SHOW_MS - FEED_FADE_MS);
    expect(FEED_SHOW_MS).toBeGreaterThanOrEqual(7000);
    expect(FEED_SHOW_MS).toBeLessThanOrEqual(9000);

    feed.poke(6000);
    expect(feed.opacity(1000 + FEED_SHOW_MS)).toBe(1);
    expect(feed.opacity(6000 + FEED_SHOW_MS)).toBe(0);
    feed.hide();
    expect(feed.opacity(6001)).toBe(0);
  });
});

describe('Enter 입력창과 직접 조작 키', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('창에서 Enter 를 누르면 연다. 다른 칸에 쓰는 중·한글 조합 중·누르고 있는 Enter·조합키는 넘긴다', () => {
    const closed = { open: false, typing: false, allowed: true };
    expect(windowChatKey({ key: 'Enter' }, closed)).toBe('open');
    expect(windowChatKey({ key: 'Enter' }, { ...closed, open: true })).toBeNull();
    expect(windowChatKey({ key: 'Enter' }, { ...closed, typing: true })).toBeNull();
    expect(windowChatKey({ key: 'Enter' }, { ...closed, allowed: false })).toBeNull();
    expect(windowChatKey({ key: 'Enter', isComposing: true }, closed)).toBeNull();
    expect(windowChatKey({ key: 'Enter', repeat: true }, closed)).toBeNull();
    expect(windowChatKey({ key: 'Enter', metaKey: true }, closed)).toBeNull();
    expect(windowChatKey({ key: 'a' }, closed)).toBeNull();
  });

  it('입력창에서 Enter 는 보내고 Esc 는 닫는다. 한글을 확정하는 Enter 는 보내지 않는다', () => {
    expect(inputChatKey({ key: 'Enter' })).toBe('send');
    expect(inputChatKey({ key: 'Enter', isComposing: true })).toBeNull();
    expect(inputChatKey({ key: 'Escape' })).toBe('cancel');
    expect(inputChatKey({ key: 'a' })).toBeNull();
  });

  it('직접 조작 중 Enter 로 연 입력창이 열려 있는 동안은 조작 키·Esc 가 직접 조작으로 가지 않는다', () => {
    // node 에는 DOM 이 없어 직접 조작의 입력칸 판정만 흉내 낸다
    vi.stubGlobal('HTMLElement', class {});
    const target = new EventTarget();
    let chatOpen = false;
    let exits = 0;
    const manual = createManualKeys(target as unknown as Window, {
      enabled: () => !chatOpen,
      onPress: () => {},
      onExit: () => (exits += 1),
    });
    target.addEventListener('keydown', (event) => {
      if (windowChatKey(event as unknown as KeyboardEvent, { open: chatOpen, typing: false, allowed: true }) !== 'open') return;
      event.preventDefault();
      chatOpen = true;
    });
    const press = (code: string, key: string) => {
      const event = Object.assign(new Event('keydown', { cancelable: true }), { code, key });
      target.dispatchEvent(event);
      return event;
    };

    const enter = press('Enter', 'Enter');
    expect(chatOpen).toBe(true);
    expect(enter.defaultPrevented).toBe(true);
    expect(Object.values(manual.read()).some(Boolean)).toBe(false);

    const typedA = press('KeyA', 'a');
    press('ArrowLeft', 'ArrowLeft');
    expect(typedA.defaultPrevented).toBe(false);
    expect(manual.read().attack).toBe(false);
    expect(manual.read().left).toBe(false);
    press('Escape', 'Escape');
    expect(exits).toBe(0);

    chatOpen = false;
    press('KeyA', 'a');
    expect(manual.read().attack).toBe(true);
  });
});
