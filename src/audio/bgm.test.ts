import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOSSES } from '../game/bosses';
import { TOWNS } from '../game/towns';
import { mapBgmUrl } from '../maple/api';
import {
  BGM_PREFETCH_GAP_MS,
  BGM_PREFETCH_RETRY_MS,
  BGM_RETRY_MS,
  BGM_STALL_MS,
  createBgm,
  likelyBgmMaps,
  shouldPlayBgm,
} from './bgm';

/** 받은 주소와 재생 여부만 남기는 audio. 오류·멈춤·메타데이터는 테스트가 직접 낸다 */
class FakeAudio extends EventTarget {
  loads: string[] = [];
  paused = true;
  loop = false;
  volume = 1;
  currentTime = 0;
  private current = '';

  get src() {
    return this.current;
  }
  set src(url: string) {
    this.current = url;
    this.currentTime = 0;
    this.loads.push(url);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  emit(type: 'error' | 'waiting' | 'stalled' | 'timeupdate' | 'loadedmetadata') {
    this.dispatchEvent(new Event(type));
  }
}

const HENESYS = 100000000;
const ELLINIA = 101000000;
const ZAKUM = 211042300;
const stream = (mapId: number) => mapBgmUrl(mapId);
const blob = (mapId: number) => `blob:${mapId}`;

/** 곡마다 맵 번호를 붙여 두고, object URL 은 `blob:{맵}` 로 만든다 */
const track = (mapId: number) => new Blob([String(mapId)], { type: 'audio/mpeg' });

/** 받기는 테스트가 끝내 줄 때까지 기다린다 */
interface Download {
  mapId: number;
  ok(): void;
  fail(): void;
}

function setup(cachedMaps: number[] = []) {
  const audio = new FakeAudio();
  const stored = new Map(cachedMaps.map((mapId) => [mapId, track(mapId)]));
  const mapOf = new Map<Blob, number>([...stored].map(([mapId, blob]) => [blob, mapId]));
  const downloads: Download[] = [];
  const cache = {
    read: vi.fn(async (mapId: number) => stored.get(mapId) ?? null),
    has: vi.fn(async (mapId: number) => stored.has(mapId)),
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
  /** 그 맵(없으면 마지막) 받기를 끝낸다 */
  const finish = async (ok = true, mapId?: number) => {
    await flush();
    const target = [...downloads].reverse().find((d) => mapId === undefined || d.mapId === mapId)!;
    if (ok) target.ok();
    else target.fail();
    await flush();
  };
  const downloaded = () => download.mock.calls.map(([mapId]) => mapId);
  return { audio, bgm, cache, download, downloaded, stored, revokeUrl, finish };
}

/** 캐시 읽기 → 받기 → 틀기로 이어지는 promise 를 다 돌린다 */
async function flush() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe('BGM', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('남겨 둔 곡이 있으면 받지 않고 바로 튼다', async () => {
    const { audio, bgm, download } = setup([HENESYS]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    expect(download).not.toHaveBeenCalled();
    expect(audio.loads).toEqual([blob(HENESYS)]);
    expect(audio.paused).toBe(false);
  });

  it('남겨 둔 곡이 없는 맵으로 옮기면 앞 곡을 끊고 새 곡을 바로 스트리밍한다', async () => {
    const { audio, bgm, cache } = setup([HENESYS]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    bgm.setMap(ELLINIA);
    await flush();
    expect(audio.src).toBe(stream(ELLINIA));
    expect(audio.paused).toBe(false);
    await flush();
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('스트리밍하던 곡을 다 받으면 받은 파일로 바꿔 듣던 자리에서 잇고 남겨 둔다', async () => {
    const { audio, bgm, cache, finish, revokeUrl } = setup([HENESYS]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    bgm.setMap(ELLINIA);
    await flush();
    expect(revokeUrl).toHaveBeenCalledWith(blob(HENESYS));
    audio.currentTime = 42.5;
    await finish();
    expect(audio.loads).toEqual([blob(HENESYS), stream(ELLINIA), blob(ELLINIA)]);
    expect(cache.write).toHaveBeenCalledWith(ELLINIA, expect.any(Blob));
    audio.emit('loadedmetadata');
    expect(audio.currentTime).toBe(42.5);
    expect(audio.paused).toBe(false);
  });

  it('갈아 끼우는 사이 다른 맵으로 옮기면 새 곡을 앞 곡의 자리로 옮기지 않는다', async () => {
    const { audio, bgm, finish } = setup([HENESYS]);
    bgm.setEnabled(true);
    bgm.setMap(ELLINIA);
    await flush();
    audio.currentTime = 30;
    await finish();
    bgm.setMap(HENESYS);
    await flush();
    audio.emit('loadedmetadata');
    expect(audio.src).toBe(blob(HENESYS));
    expect(audio.currentTime).toBe(0);
  });

  it('스트리밍이 멈춰도 곡을 처음부터 다시 걸지 않고, 받은 파일로 바꾸면 멈춤 기다리기를 끝낸다', async () => {
    const { audio, bgm, finish } = setup();
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    audio.emit('waiting');
    vi.advanceTimersByTime(BGM_STALL_MS);
    expect(audio.loads).toEqual([stream(HENESYS)]);

    await finish();
    audio.emit('waiting');
    audio.emit('timeupdate');
    vi.advanceTimersByTime(BGM_STALL_MS);
    expect(audio.loads).toEqual([stream(HENESYS), blob(HENESYS)]);
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
    expect(audio.loads).toEqual([stream(HENESYS), blob(HENESYS)]);
  });

  it('보스 맵 곡을 받는 사이 마을로 돌아오면 마을 곡으로 바로 바꾸고 늦게 온 보스 곡은 남기기만 한다', async () => {
    const { audio, bgm, finish, stored } = setup([HENESYS]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    bgm.setMap(ZAKUM);
    await flush();
    bgm.setMap(HENESYS);
    await flush();
    await finish(true, ZAKUM);
    expect(audio.loads).toEqual([blob(HENESYS), stream(ZAKUM), blob(HENESYS)]);
    expect(stored.has(ZAKUM)).toBe(true);
  });

  it('스트리밍은 되는데 받기만 실패하면 잠시 뒤 받기만 다시 한다', async () => {
    const { audio, bgm, download, finish } = setup();
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await finish(false);

    await vi.advanceTimersByTimeAsync(BGM_RETRY_MS - 1);
    expect(download).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await finish();
    expect(download).toHaveBeenCalledTimes(2);
    expect(audio.loads).toEqual([stream(HENESYS), blob(HENESYS)]);
  });

  it('스트리밍도 끊기고 받기도 실패하면 잠시 뒤 스트리밍과 받기를 다시 한다', async () => {
    const { audio, bgm, download, finish } = setup();
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    audio.emit('error');
    await finish(false);
    await vi.advanceTimersByTimeAsync(BGM_RETRY_MS);
    await flush();
    expect(download).toHaveBeenCalledTimes(2);
    expect(audio.loads).toEqual([stream(HENESYS), stream(HENESYS)]);
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
    const { bgm, downloaded, finish } = setup();
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await finish(false);
    bgm.setMap(ELLINIA);
    await finish();
    await vi.advanceTimersByTimeAsync(BGM_RETRY_MS);
    expect(downloaded()).toEqual([HENESYS, ELLINIA]);
  });

  it('소리를 꺼 둔 동안에는 틀지 않는다', async () => {
    const { audio, bgm, finish } = setup();
    bgm.setMap(HENESYS);
    await finish();
    expect(audio.src).toBe(blob(HENESYS));
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
    expect(audio.loads).toEqual([blob(HENESYS), stream(HENESYS), blob(HENESYS)]);
  });

  it('남겨 둔 곡 재생이 멈춘 채로 있으면 곡을 다시 건다', async () => {
    const { audio, bgm } = setup([HENESYS]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    audio.emit('waiting');
    audio.emit('stalled');
    vi.advanceTimersByTime(BGM_STALL_MS - 1);
    expect(audio.loads).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(audio.loads).toEqual([blob(HENESYS), blob(HENESYS)]);
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

  describe('미리 받기', () => {
    it('목록 앞에서부터 한 곡씩 받고, 이미 남긴 곡은 건너뛴다', async () => {
      const { bgm, downloaded, finish, stored } = setup([ELLINIA]);
      bgm.prefetch([HENESYS, ELLINIA, ZAKUM]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      expect(downloaded()).toEqual([HENESYS]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS * 5);
      expect(downloaded()).toEqual([HENESYS]);

      await finish(true, HENESYS);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      // 남긴 곡을 건너뛸 때는 쉬지 않는다. setTimeout(0) 은 1ms 로 돈다
      await vi.advanceTimersByTimeAsync(1);
      expect(downloaded()).toEqual([HENESYS, ZAKUM]);
      await finish(true, ZAKUM);
      expect([...stored.keys()].sort()).toEqual([ELLINIA, HENESYS, ZAKUM].sort());
    });

    it('미리 받아 둔 맵으로 옮기면 받지 않고 바로 튼다', async () => {
      const { audio, bgm, download, finish } = setup();
      bgm.setEnabled(true);
      bgm.prefetch([ELLINIA]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      await finish(true, ELLINIA);
      bgm.setMap(ELLINIA);
      await flush();
      expect(download).toHaveBeenCalledTimes(1);
      expect(audio.loads).toEqual([blob(ELLINIA)]);
    });

    it('미리 받던 곡의 맵으로 옮기면 바로 스트리밍하고 받던 것을 이어 쓴다', async () => {
      const { audio, bgm, download, finish } = setup();
      bgm.setEnabled(true);
      bgm.prefetch([ELLINIA]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      bgm.setMap(ELLINIA);
      await flush();
      expect(audio.src).toBe(stream(ELLINIA));
      await finish(true, ELLINIA);
      expect(download).toHaveBeenCalledTimes(1);
      expect(audio.src).toBe(blob(ELLINIA));
    });

    it('지금 맵 곡을 받는 동안에는 멈췄다가 다 받으면 이어 받는다', async () => {
      const { bgm, downloaded, finish } = setup();
      bgm.setEnabled(true);
      bgm.setMap(HENESYS);
      bgm.prefetch([ELLINIA]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS * 3);
      expect(downloaded()).toEqual([HENESYS]);

      await finish(true, HENESYS);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      expect(downloaded()).toEqual([HENESYS, ELLINIA]);
    });

    it('실패한 곡은 쉬었다가 다음 곡으로 넘어가고, 한참 뒤에 다시 받는다', async () => {
      const { bgm, downloaded, finish } = setup();
      bgm.prefetch([HENESYS, ELLINIA]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      await finish(false, HENESYS);
      await vi.advanceTimersByTimeAsync(BGM_RETRY_MS - 1);
      expect(downloaded()).toEqual([HENESYS]);
      await vi.advanceTimersByTimeAsync(1);
      expect(downloaded()).toEqual([HENESYS, ELLINIA]);

      await finish(true, ELLINIA);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      expect(downloaded()).toEqual([HENESYS, ELLINIA]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_RETRY_MS);
      expect(downloaded()).toEqual([HENESYS, ELLINIA, HENESYS]);
    });

    it('같은 목록을 다시 넘겨도 처음부터 다시 시작하지 않는다', async () => {
      const { bgm, downloaded } = setup();
      bgm.prefetch([HENESYS]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      bgm.prefetch([HENESYS]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS * 3);
      expect(downloaded()).toEqual([HENESYS]);
    });
  });
});

describe('likelyBgmMaps', () => {
  it('최근에 열린 마을 네 곳, 잡을 수 있는 보스 전부, 나머지 열린 마을 순서다', () => {
    const level = 70;
    const towns = TOWNS.filter((town) => town.minLevel <= level).map((town) => town.mapId);
    const bosses = BOSSES.filter((boss) => boss.minLevel <= level)
      .sort((a, b) => b.minLevel - a.minLevel)
      .map((boss) => boss.mapId);
    const maps = likelyBgmMaps(level);
    expect(maps.slice(0, 4)).toEqual(towns.slice(-4).reverse());
    expect(maps.slice(4, 4 + bosses.length)).toEqual(bosses);
    expect(new Set(maps)).toEqual(new Set([...towns, ...bosses]));
  });

  it('아직 열리지 않은 마을과 보스는 넣지 않는다', () => {
    const maps = likelyBgmMaps(1);
    expect(maps).toEqual(TOWNS.filter((town) => town.minLevel <= 1).map((town) => town.mapId));
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
