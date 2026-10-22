import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BGM_RETRY_MS, BGM_STALL_MS, createBgm, shouldPlayBgm } from './bgm';

/** 받은 주소와 재생 여부만 남기는 audio. 오류·멈춤은 테스트가 직접 낸다 */
class FakeAudio extends EventTarget {
  loads: string[] = [];
  paused = true;
  loop = false;
  volume = 1;
  private current = '';

  get src() {
    return this.current;
  }
  set src(url: string) {
    this.current = url;
    this.loads.push(url);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  emit(type: 'error' | 'waiting' | 'stalled' | 'timeupdate') {
    this.dispatchEvent(new Event(type));
  }
}

const HENESYS = 100000000;
const ELLINIA = 101000000;
const ZAKUM = 211042300;

/** 곡마다 맵 번호를 붙여 두고, object URL 은 `blob:{맵}` 로 만든다 */
const track = (mapId: number) => new Blob([String(mapId)], { type: 'audio/mpeg' });

/** 받기는 테스트가 끝내 줄 때까지 기다린다 */
interface Download {
  mapId: number;
  ok(): void;
  fail(): void;
}

function setup(cached: number[] = []) {
  const audio = new FakeAudio();
  const stored = new Map(cached.map((mapId) => [mapId, track(mapId)]));
  const mapOf = new Map<Blob, number>([...stored].map(([mapId, blob]) => [blob, mapId]));
  const downloads: Download[] = [];
  const cache = {
    read: vi.fn(async (mapId: number) => stored.get(mapId) ?? null),
    write: vi.fn(async (mapId: number, blob: Blob) => void stored.set(mapId, blob)),
    remove: vi.fn(async (mapId: number) => void stored.delete(mapId)),
  };
  const download = vi.fn(
    (mapId: number) =>
      new Promise<Blob>((resolve, reject) => {
        downloads.push({
          mapId,
          ok: () => {
            const blob = track(mapId);
            mapOf.set(blob, mapId);
            resolve(blob);
          },
          fail: () => reject(new Error('520')),
        });
      }),
  );
  const revokeUrl = vi.fn();
  const bgm = createBgm(audio as unknown as HTMLAudioElement, new EventTarget(), {
    cache,
    download,
    toUrl: (blob) => `blob:${mapOf.get(blob)}`,
    revokeUrl,
  });
  /** 마지막 받기를 끝낸다 */
  const finish = async (ok = true) => {
    await flush();
    const last = downloads[downloads.length - 1];
    if (ok) last.ok();
    else last.fail();
    await flush();
  };
  return { audio, bgm, cache, download, downloads, stored, revokeUrl, finish };
}

/** 캐시 읽기 → 받기 → 틀기로 이어지는 promise 를 다 돌린다 */
async function flush() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe('BGM', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('곡을 통째로 받아 기기에 남기고 거기서 튼다', async () => {
    const { audio, bgm, cache, finish } = setup();
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await finish();
    expect(audio.loads).toEqual([`blob:${HENESYS}`]);
    expect(audio.paused).toBe(false);
    expect(cache.write).toHaveBeenCalledWith(HENESYS, expect.any(Blob));
  });

  it('남겨 둔 곡이 있으면 받지 않고 바로 튼다', async () => {
    const { audio, bgm, download } = setup([HENESYS]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    expect(download).not.toHaveBeenCalled();
    expect(audio.loads).toEqual([`blob:${HENESYS}`]);
  });

  it('같은 곡을 다시 부르면 처음부터 다시 틀지 않는다', async () => {
    const { audio, bgm, download, finish } = setup();
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    bgm.setMap(HENESYS);
    await finish();
    bgm.setMap(HENESYS);
    await flush();
    expect(download).toHaveBeenCalledTimes(1);
    expect(audio.loads).toEqual([`blob:${HENESYS}`]);
  });

  it('새 곡을 받는 동안 앞 곡을 계속 틀고, 다 받으면 바꾼다', async () => {
    const { audio, bgm, finish, revokeUrl } = setup([HENESYS]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    bgm.setMap(ELLINIA);
    await flush();
    expect(audio.src).toBe(`blob:${HENESYS}`);
    expect(audio.paused).toBe(false);
    await finish();
    expect(audio.loads).toEqual([`blob:${HENESYS}`, `blob:${ELLINIA}`]);
    expect(revokeUrl).toHaveBeenCalledWith(`blob:${HENESYS}`);
  });

  it('보스 맵 곡을 받는 사이 마을로 돌아오면 마을 곡을 그대로 두고 늦게 온 보스 곡은 틀지 않는다', async () => {
    const { audio, bgm, finish } = setup([HENESYS]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    bgm.setMap(ZAKUM);
    await flush();
    bgm.setMap(HENESYS);
    await finish();
    expect(audio.loads).toEqual([`blob:${HENESYS}`]);
  });

  it('곡을 못 받으면 잠시 뒤 같은 곡을 다시 받아 튼다', async () => {
    const { audio, bgm, download, finish } = setup();
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await finish(false);

    await vi.advanceTimersByTimeAsync(BGM_RETRY_MS - 1);
    expect(download).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await finish();
    expect(download).toHaveBeenCalledTimes(2);
    expect(audio.loads).toEqual([`blob:${HENESYS}`]);
    expect(audio.paused).toBe(false);
  });

  it('다시 받아도 또 실패하면 계속 다시 받는다', async () => {
    const { bgm, download, finish } = setup();
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await finish(false);
    await vi.advanceTimersByTimeAsync(BGM_RETRY_MS);
    await finish(false);
    await vi.advanceTimersByTimeAsync(BGM_RETRY_MS);
    await flush();
    expect(download).toHaveBeenCalledTimes(3);
  });

  it('다시 받기 전에 다른 맵으로 옮기면 실패한 곡을 다시 받지 않는다', async () => {
    const { bgm, download, finish } = setup();
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await finish(false);
    bgm.setMap(ELLINIA);
    await finish();
    await vi.advanceTimersByTimeAsync(BGM_RETRY_MS);
    expect(download.mock.calls.map(([mapId]) => mapId)).toEqual([HENESYS, ELLINIA]);
  });

  it('소리를 꺼 둔 동안 받으면 틀지 않는다', async () => {
    const { audio, bgm, finish } = setup();
    bgm.setMap(HENESYS);
    await finish();
    expect(audio.loads).toEqual([`blob:${HENESYS}`]);
    expect(audio.paused).toBe(true);
  });

  it('남겨 둔 곡을 못 읽으면 지우고 잠시 뒤 다시 받는다', async () => {
    const { audio, bgm, cache, download, finish } = setup([HENESYS]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    audio.emit('error');
    await flush();
    expect(cache.remove).toHaveBeenCalledWith(HENESYS);

    await vi.advanceTimersByTimeAsync(BGM_RETRY_MS);
    await finish();
    expect(download).toHaveBeenCalledTimes(1);
    expect(audio.loads).toEqual([`blob:${HENESYS}`, `blob:${HENESYS}`]);
  });

  it('재생이 멈춘 채로 있으면 곡을 다시 건다', async () => {
    const { audio, bgm } = setup([HENESYS]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    audio.emit('waiting');
    audio.emit('stalled');
    vi.advanceTimersByTime(BGM_STALL_MS - 1);
    expect(audio.loads).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(audio.loads).toEqual([`blob:${HENESYS}`, `blob:${HENESYS}`]);
    expect(audio.paused).toBe(false);
  });

  it('잠깐 멈췄다가 다시 흘러가면 곡을 다시 걸지 않는다', async () => {
    const { audio, bgm } = setup([HENESYS]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    audio.emit('waiting');
    audio.emit('timeupdate');
    vi.advanceTimersByTime(BGM_STALL_MS);
    expect(audio.loads).toHaveLength(1);
  });

  it('소리를 끄면 멈춤을 기다리지 않는다', async () => {
    const { audio, bgm } = setup([HENESYS]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    audio.emit('waiting');
    bgm.setEnabled(false);
    vi.advanceTimersByTime(BGM_STALL_MS);
    expect(audio.loads).toHaveLength(1);
    expect(audio.paused).toBe(true);
  });
});

describe('shouldPlayBgm', () => {
  const base = { muted: false, volume: 0.5, screen: 'map' as const, windowVisible: true };
  it('지도 화면에서 소리가 켜져 있으면 재생한다', () => expect(shouldPlayBgm(base)).toBe(true));
  it('창이 숨겨져도 재생한다', () => expect(shouldPlayBgm({ ...base, windowVisible: false })).toBe(true));
  it('음소거나 음량 0 이면 멈춘다', () => {
    expect(shouldPlayBgm({ ...base, muted: true })).toBe(false);
    expect(shouldPlayBgm({ ...base, volume: 0 })).toBe(false);
  });
  it('지도 밖 화면에서는 멈춘다', () => {
    for (const screen of ['select', 'shop', 'settings'] as const) expect(shouldPlayBgm({ ...base, screen })).toBe(false);
  });
});
