import { afterEach, describe, expect, it, vi } from 'vitest';
import { DATA_KEY } from './api';
import { type ArtBackend, type ArtIndex, type StoredArt, artEvictionPlan, artKey, createArtStore, underBase } from './artStore';

function memoryBackend() {
  const data = new Map<string, unknown>();
  const backend: ArtBackend = {
    read: async <T>(key: string) => data.get(key) as T | undefined,
    write: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  };
  return { data, backend };
}

const art = (size: number, status = 200): StoredArt => ({ status, type: 'image/png', bytes: new Uint8Array(size).buffer });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const URL_A = 'https://maplestory.io/api/KMS/389/map/100000000/render/0';
const URL_B = 'https://maplestory.io/api/KMS/389/map/104000000/render/0';

describe('그림 저장 키', () => {
  it('KMS 버전과 요청 주소 그대로로 짓는다', () => {
    expect(artKey(URL_A)).toBe(`${DATA_KEY}:art:${URL_A}`);
    expect(artKey(`${URL_A}?x=1`)).not.toBe(artKey(URL_A));
  });

  it('지키는 주소는 그 경로 아래만 붙잡는다', () => {
    const base = 'https://maplestory.io/api/KMS/389/map/100000000';
    expect(underBase(base, base)).toBe(true);
    expect(underBase(`${base}/render/0`, base)).toBe(true);
    expect(underBase('https://maplestory.io/api/KMS/389/map/1000000000', base)).toBe(false);
  });
});

describe('그림 저장 예산', () => {
  const index: ArtIndex = { a: { bytes: 30, usedAt: 300 }, b: { bytes: 30, usedAt: 100 }, c: { bytes: 30, usedAt: 200 } };

  it('예산 안이면 아무것도 안 지운다', () => {
    expect(artEvictionPlan(index, 90)).toEqual([]);
  });

  it('넘으면 마지막으로 쓴 때가 오래된 것부터 예산 안에 들 때까지 지운다', () => {
    expect(artEvictionPlan(index, 60)).toEqual(['b']);
    expect(artEvictionPlan(index, 30)).toEqual(['b', 'c']);
  });

  it('지금 맵·모습은 오래됐어도 건너뛰고 그다음 것을 지운다', () => {
    expect(artEvictionPlan(index, 60, (url) => url === 'b')).toEqual(['c']);
  });
});

describe('그림 저장소', () => {
  it('남긴 것을 그대로 돌려주고 목록에 크기를 센다', async () => {
    const { backend } = memoryBackend();
    const store = createArtStore(backend);
    await store.put(URL_A, art(10));
    expect(await store.has(URL_A)).toBe(true);
    expect((await store.get(URL_A))?.bytes.byteLength).toBe(10);
    expect(await store.get(URL_B)).toBeUndefined();
  });

  it('목록은 모았다가 한 번에 쓰고, 다시 열면 그 목록으로 읽는다', async () => {
    const { backend, data } = memoryBackend();
    const store = createArtStore(backend, { saveDelayMs: 60_000 });
    await store.put(URL_A, art(10));
    await store.put(URL_B, art(20));
    expect(data.has(`${DATA_KEY}:art-index`)).toBe(false);
    store.flush();
    expect(Object.keys(data.get(`${DATA_KEY}:art-index`) as ArtIndex)).toEqual([URL_A, URL_B]);
    expect(await createArtStore(backend).has(URL_B)).toBe(true);
  });

  it('데이터가 사라졌으면 목록에서 빼고, 목록에 없던 데이터는 읽을 때 목록에 넣는다', async () => {
    const { backend, data } = memoryBackend();
    const store = createArtStore(backend);
    await store.put(URL_A, art(10));
    data.delete(artKey(URL_A));
    expect(await store.get(URL_A)).toBeUndefined();
    expect(await store.has(URL_A)).toBe(false);
    data.set(artKey(URL_B), art(5));
    expect(await store.get(URL_B)).toBeDefined();
    expect(await store.has(URL_B)).toBe(true);
  });

  it('너무 큰 응답은 남기지 않는다', async () => {
    const { backend, data } = memoryBackend();
    const store = createArtStore(backend, { cap: 8 });
    await store.put(URL_A, art(9));
    expect(data.has(artKey(URL_A))).toBe(false);
  });

  it('예산을 넘으면 오래 안 쓴 것을 지우되 지금 맵은 남긴다', async () => {
    const { backend, data } = memoryBackend();
    let clock = 0;
    const store = createArtStore(backend, { budget: 25, now: () => (clock += 1) });
    const kept = 'https://maplestory.io/api/KMS/389/map/1';
    await store.put(`${kept}/render/0`, art(10));
    await store.put(URL_A, art(10));
    store.keep('map', [kept]);
    await store.put(URL_B, art(10));
    expect(data.has(artKey(`${kept}/render/0`))).toBe(true);
    expect(data.has(artKey(URL_A))).toBe(false);
    expect(await store.has(URL_A)).toBe(false);
    expect(data.has(artKey(URL_B))).toBe(true);
  });
});

describe('기기에 남기며 받기', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const readBytes = async (response: Response) => {
    if (!response.ok) throw new Error(String(response.status));
    return new Uint8Array(await response.arrayBuffer()).length;
  };

  it('처음엔 받아서 남기고, 다음엔 네트워크 없이 같은 바이트를 돌려준다', async () => {
    const network = vi.fn(async () => new Response(new Uint8Array(7), { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', network);
    const { backend, data } = memoryBackend();
    const store = createArtStore(backend);
    expect(await store.fetch(URL_A, readBytes)).toBe(7);
    await settle();
    expect((data.get(artKey(URL_A)) as StoredArt).type).toBe('image/png');
    expect(await store.fetch(URL_A, readBytes)).toBe(7);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('5xx 와 read 가 거절한 응답은 남기지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })));
    const { backend, data } = memoryBackend();
    const store = createArtStore(backend);
    await expect(store.fetch(URL_A, readBytes)).rejects.toThrow('503');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not png')));
    await expect(store.fetch(URL_B, async () => Promise.reject(new Error('깨진 그림')))).rejects.toThrow('깨진 그림');
    await settle();
    expect(data.size).toBe(0);
  });

  it('남긴 것을 못 읽으면 지우고 다시 받는다', async () => {
    const network = vi.fn(async () => new Response(new Uint8Array(3)));
    vi.stubGlobal('fetch', network);
    const { backend, data } = memoryBackend();
    data.set(artKey(URL_A), art(0, 500));
    const store = createArtStore(backend);
    expect(await store.fetch(URL_A, readBytes)).toBe(3);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('keepMissing 이면 빈 레이어(404)도 남겨 다음엔 받지 않는다', async () => {
    const network = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', network);
    const { backend } = memoryBackend();
    const store = createArtStore(backend);
    const readOptional = async (response: Response) => (response.status === 404 ? null : response.status);
    expect(await store.fetch(URL_A, readOptional, undefined, { keepMissing: true })).toBeNull();
    await settle();
    expect(await store.fetch(URL_A, readOptional, undefined, { keepMissing: true })).toBeNull();
    expect(network).toHaveBeenCalledTimes(1);
    expect(await store.fetch(URL_B, readOptional)).toBeNull();
    await settle();
    expect(await store.has(URL_B)).toBe(false);
  });

  it('data: 주소는 남기지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(2))));
    const { backend, data } = memoryBackend();
    const store = createArtStore(backend);
    expect(await store.fetch('data:image/png;base64,AAAA', readBytes)).toBe(2);
    await settle();
    expect(data.size).toBe(0);
  });
});
