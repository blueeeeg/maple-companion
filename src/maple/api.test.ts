import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FETCH_TIMEOUT_MS, fetchJson, fetchWithin } from './api';

/** 응답하지 않는 서버. signal 이 끊기면 그 이유로 실패한다 */
function hangingFetch(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
}

describe('fetchWithin', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('응답이 없으면 시간이 지나 실패한다', async () => {
    vi.stubGlobal('fetch', vi.fn(hangingFetch));
    const result = fetchWithin('https://example.test/a', async () => 'ok', 1000);
    const settled = expect(result).rejects.toThrow('1000ms 안에 응답 없음');
    await vi.advanceTimersByTimeAsync(1000);
    await settled;
  });

  it('헤더는 왔는데 본문이 멈춰도 시간이 지나 실패한다', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Response('{}');
      }),
    );
    const result = fetchWithin(
      'https://example.test/b',
      () => new Promise((_, reject) => signal!.addEventListener('abort', () => reject(signal!.reason))),
      1000,
    );
    const settled = expect(result).rejects.toThrow('응답 없음');
    await vi.advanceTimersByTimeAsync(1000);
    await settled;
  });

  it('제때 오면 읽은 값을 돌려주고 타이머를 남기지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('hello')));
    await expect(fetchWithin('https://example.test/c', (response) => response.text(), 1000)).resolves.toBe('hello');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fetchJson 도 기본 제한 시간에 끊긴다', async () => {
    vi.stubGlobal('fetch', vi.fn(hangingFetch));
    const settled = expect(fetchJson('https://example.test/d')).rejects.toThrow('응답 없음');
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    await settled;
  });

  it('fetchJson 은 5xx 를 실패로 돌려준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 520 })));
    await expect(fetchJson('https://example.test/e')).rejects.toThrow('520');
  });
});
