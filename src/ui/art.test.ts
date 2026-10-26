import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATA_KEY } from '../maple/api';
import { type ArtBackend, createArtStore } from '../maple/artStore';
import { ART_BACKOFF_MS, type Wake, createArtLoader, createCropCache, keepTrying } from './art';

const URL_A = 'https://maplestory.io/api/wz/img/KMS/389/UI/_Canvas/StatusBar.img/StatKey/normal/0';
const URL_B = 'https://maplestory.io/api/wz/img/KMS/389/UI/_Canvas/StatusBar.img/SkillKey/normal/0';

function memoryBackend() {
  const data = new Map<string, unknown>();
  const backend: ArtBackend = {
    read: async <T>(key: string) => data.get(key) as T | undefined,
    write: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  };
  return { data, backend };
}

/** 창이 다시 보이거나 네트워크가 돌아온 것처럼 깨운다 */
function fakeWake() {
  const listeners = new Set<() => void>();
  const wake: Wake = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return { wake, fire: () => [...listeners].forEach((listener) => listener()), listening: () => listeners.size };
}

const png = () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } });
const offline = (): Promise<Response> => Promise.reject(new TypeError('Load failed'));

function loaderWith(backend: ArtBackend, wake: Wake) {
  let opened = 0;
  return createArtLoader({
    fetchStored: createArtStore(backend).fetch,
    open: async (blob) => `blob:${blob.type}#${(opened += 1)}`,
    wait: async () => {},
    wake,
  });
}

describe('될 때까지 다시 하기', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('실패하면 15초·30초… 뒤 다시 하고, 간격은 마지막 값에서 멈춘다', async () => {
    const task = vi.fn(() => Promise.reject(new Error('busy')));
    const { wake } = fakeWake();
    keepTrying(task, { wake });
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(ART_BACKOFF_MS[0] - 1);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(ART_BACKOFF_MS[1]);
    expect(task).toHaveBeenCalledTimes(3);
    const rest = ART_BACKOFF_MS.slice(2).reduce((sum, ms) => sum + ms, 0);
    await vi.advanceTimersByTimeAsync(rest);
    expect(task).toHaveBeenCalledTimes(3 + ART_BACKOFF_MS.length - 2);
    await vi.advanceTimersByTimeAsync(ART_BACKOFF_MS[ART_BACKOFF_MS.length - 1]);
    expect(task).toHaveBeenCalledTimes(4 + ART_BACKOFF_MS.length - 2);
  });

  it('깨우거나 찌르면 기다리지 않고 바로 다시 하고, 되면 더 듣지 않는다', async () => {
    let fail = true;
    const task = vi.fn(() => (fail ? Promise.reject(new Error('offline')) : Promise.resolve('ok')));
    const { wake, fire, listening } = fakeWake();
    const patient = keepTrying(task, { wake });
    await vi.advanceTimersByTimeAsync(0);
    expect(listening()).toBe(1);
    fire();
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(2);
    fail = false;
    patient.poke();
    await expect(patient.promise).resolves.toBe('ok');
    expect(task).toHaveBeenCalledTimes(3);
    expect(listening()).toBe(0);
    await vi.advanceTimersByTimeAsync(ART_BACKOFF_MS[0] * 10);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('isFinal 인 실패는 다시 하지 않고 거절한다', async () => {
    const task = vi.fn(() => Promise.reject(new Error('404')));
    const patient = keepTrying(task, { wake: fakeWake().wake, isFinal: () => true });
    await expect(patient.promise).rejects.toThrow('404');
    await vi.advanceTimersByTimeAsync(ART_BACKOFF_MS[0] * 2);
    expect(task).toHaveBeenCalledTimes(1);
  });
});

describe('UI 그림 받기', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('처음 받은 그림을 기기에 남겨, 다음 실행은 네트워크 없이 그것으로 건다', async () => {
    const { backend } = memoryBackend();
    const network = vi.fn(async () => png());
    vi.stubGlobal('fetch', network);
    const first = loaderWith(backend, fakeWake().wake);
    expect(await first.load(URL_A)).toBe('blob:image/png#1');
    expect(first.ready(URL_A)).toBe('blob:image/png#1');
    expect(await first.load(URL_A)).toBe('blob:image/png#1');
    expect(network).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);

    vi.stubGlobal('fetch', vi.fn(offline));
    const next = loaderWith(backend, fakeWake().wake);
    expect(await next.load(URL_A)).toBe('blob:image/png#1');
  });

  it('네트워크가 없고 기기에도 없으면 기다리다가, 돌아오면 바로 받는다', async () => {
    const { backend } = memoryBackend();
    const network = vi.fn(offline);
    vi.stubGlobal('fetch', network);
    const { wake, fire } = fakeWake();
    const loader = loaderWith(backend, wake);
    const loading = loader.load(URL_A);
    let src: string | undefined;
    void loading.then((value) => (src = value));
    await vi.advanceTimersByTimeAsync(0);
    expect(network).toHaveBeenCalledTimes(3);
    expect(src).toBeUndefined();

    network.mockImplementation(async () => png());
    fire();
    await vi.advanceTimersByTimeAsync(0);
    expect(src).toBe('blob:image/png#1');
  });

  it('기다리는 그림을 다시 부르면(창을 다시 열면) 같은 요청을 바로 다시 한다', async () => {
    const { backend } = memoryBackend();
    const network = vi.fn(offline);
    vi.stubGlobal('fetch', network);
    const loader = loaderWith(backend, fakeWake().wake);
    const first = loader.load(URL_B);
    await vi.advanceTimersByTimeAsync(0);
    network.mockImplementation(async () => png());
    const second = loader.load(URL_B);
    expect(second).toBe(first);
    await vi.advanceTimersByTimeAsync(0);
    await expect(second).resolves.toBe('blob:image/png#1');
  });

  it('그림이 없다는 404 는 기다리지 않고 거절하고, 다음에 부르면 다시 받는다', async () => {
    const { backend, data } = memoryBackend();
    const network = vi.fn(async () => new Response('missing', { status: 404 }));
    vi.stubGlobal('fetch', network);
    const loader = loaderWith(backend, fakeWake().wake);
    await expect(loader.load(URL_A)).rejects.toThrow('404');
    expect(network).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(ART_BACKOFF_MS[0] * 2);
    expect(network).toHaveBeenCalledTimes(1);
    expect([...data.keys()].some((key) => key.includes(':art:'))).toBe(false);
    network.mockImplementation(async () => png());
    await expect(loader.load(URL_A)).resolves.toBe('blob:image/png#1');
  });

  it('못 그리는 그림은 기기에 남기지 않는다', async () => {
    const { backend, data } = memoryBackend();
    vi.stubGlobal('fetch', vi.fn(async () => png()));
    let broken = true;
    const loader = createArtLoader({
      fetchStored: createArtStore(backend).fetch,
      open: async () => (broken ? Promise.reject(new Error('decode')) : 'blob:ok'),
      wait: async () => {},
      wake: fakeWake().wake,
    });
    void loader.load(URL_A);
    await vi.advanceTimersByTimeAsync(0);
    expect([...data.keys()].some((key) => key.includes(':art:'))).toBe(false);
    broken = false;
    await vi.advanceTimersByTimeAsync(ART_BACKOFF_MS[0]);
    expect(loader.ready(URL_A)).toBe('blob:ok');
  });

  it('data·blob 주소는 받지 않고 그대로 쓴다', async () => {
    const network = vi.fn(offline);
    vi.stubGlobal('fetch', network);
    const loader = loaderWith(memoryBackend().backend, fakeWake().wake);
    expect(await loader.load('data:image/png;base64,AA')).toBe('data:image/png;base64,AA');
    expect(network).not.toHaveBeenCalled();
  });
});

describe('뗀 그림 남기기', () => {
  it('한 번 뗀 것은 다시 떼지 않고, 판 이름이 다르면 새로 뗀다', async () => {
    const { backend, data } = memoryBackend();
    const crop = createCropCache(backend);
    const make = vi.fn(async () => 'data:image/png;base64,GLYPH');
    expect(await crop(`v1:${URL_A}`, make)).toBe('data:image/png;base64,GLYPH');
    expect(data.get(`${DATA_KEY}:crop:v1:${URL_A}`)).toBe('data:image/png;base64,GLYPH');
    expect(await createCropCache(backend)(`v1:${URL_A}`, make)).toBe('data:image/png;base64,GLYPH');
    expect(make).toHaveBeenCalledTimes(1);
    await crop(`v2:${URL_A}`, make);
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('떼다 실패하면 남기지 않는다', async () => {
    const { backend, data } = memoryBackend();
    await expect(createCropCache(backend)('v1:x', () => Promise.reject(new Error('비었다')))).rejects.toThrow('비었다');
    expect(data.size).toBe(0);
  });
});
