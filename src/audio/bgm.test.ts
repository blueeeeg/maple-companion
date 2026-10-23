import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOSSES } from '../game/bosses';
import { TOWNS } from '../game/towns';
import { musicUrl } from '../maple/api';
import type { BgmCacheEntry } from '../platform/bgmCache';
import {
  BGM_CACHE_BUDGET_BYTES,
  BGM_PREFETCH_GAP_MS,
  BGM_PREFETCH_RETRY_MS,
  BGM_RETRY_MS,
  BGM_STALL_MS,
  type BgmPlayback,
  bgmPlayback,
  createBgm,
  likelyBgmMaps,
  pickShuffleTrack,
  planBgmEviction,
  shouldPlayBgm,
} from './bgm';
import { bgmTrackKey, knownMapTrack } from './bgmTracks';

/** 받은 주소와 재생 여부만 남기는 audio. 오류·멈춤·메타데이터·곡 끝은 테스트가 직접 낸다 */
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
  emit(type: 'error' | 'waiting' | 'stalled' | 'timeupdate' | 'loadedmetadata' | 'ended') {
    this.dispatchEvent(new Event(type));
  }
}

const HENESYS = 100000000;
const ELLINIA = 101000000;
/** 헤네시스와 같은 곡(FloralLife)을 쓰는 머쉬맘 맵 */
const MUSHMOM = 100020101;
/** 앱이 모르는 맵. 곡은 WZ 에서 알아낸다 */
const ZAKUM = 211042300;
const FLORAL = knownMapTrack(HENESYS)!;
const MORNING = knownMapTrack(ELLINIA)!;
const ZAKUM_TRACK = 'Bgm03/Zakum';
const NIGHTMARE = 'Bgm00/Nightmare';
const GRAVITY = 'Bgm41/Gravity Lord';
const stream = (path: string) => musicUrl(path);
const blob = (path: string) => `blob:${path}`;
const track = (path: string) => new Blob([path], { type: 'audio/mpeg' });
const MB = 1024 * 1024;

/** 받기는 테스트가 끝내 줄 때까지 기다린다 */
interface Download {
  path: string;
  ok(): void;
  fail(): void;
}

function setup(cachedTracks: string[] = [], options: { legacy?: Record<string, string>; sizes?: Record<string, number>; random?: () => number } = {}) {
  const audio = new FakeAudio();
  const stored = new Map<string, Blob>(cachedTracks.map((path) => [bgmTrackKey(path), track(path)]));
  Object.entries(options.legacy ?? {}).forEach(([key, path]) => stored.set(key, track(path)));
  const usedAt = new Map<string, number>([...stored.keys()].map((key, index) => [key, index]));
  let clock = stored.size;
  const pathOf = new Map<Blob, string>();
  stored.forEach((value, key) => pathOf.set(value, cachedTracks.find((path) => bgmTrackKey(path) === key) ?? options.legacy?.[key] ?? key));
  const downloads: Download[] = [];
  const cache = {
    read: vi.fn(async (key: string) => stored.get(key) ?? null),
    has: vi.fn(async (key: string) => stored.has(key)),
    write: vi.fn(async (key: string, value: Blob) => {
      stored.set(key, value);
      usedAt.set(key, (clock += 1));
    }),
    remove: vi.fn(async (key: string) => void stored.delete(key)),
    list: vi.fn(
      async (): Promise<BgmCacheEntry[]> =>
        [...stored.keys()].map((key) => ({ key, bytes: options.sizes?.[key] ?? 1, usedAt: usedAt.get(key) ?? 0 })),
    ),
    rename: vi.fn(async (from: string, to: string) => {
      const value = stored.get(from);
      stored.delete(from);
      if (value) stored.set(to, value);
    }),
  };
  const download = vi.fn(
    (path: string) =>
      new Promise<Blob>((resolve, reject) => {
        downloads.push({
          path,
          ok: () => {
            const value = track(path);
            pathOf.set(value, path);
            resolve(value);
          },
          fail: () => reject(new Error('520')),
        });
      }),
  );
  const mapTrack = vi.fn(async (mapId: number) => {
    if (mapId === ZAKUM) return ZAKUM_TRACK;
    throw new Error(`모르는 맵 ${mapId}`);
  });
  const revokeUrl = vi.fn();
  const bgm = createBgm(audio as unknown as HTMLAudioElement, new EventTarget(), {
    cache,
    download,
    mapTrack,
    toUrl: (value) => `blob:${pathOf.get(value)}`,
    revokeUrl,
    random: options.random ?? (() => 0),
  });
  /** 그 곡(없으면 마지막) 받기를 끝낸다 */
  const finish = async (ok = true, path?: string) => {
    await flush();
    const target = [...downloads].reverse().find((each) => path === undefined || each.path === path)!;
    if (ok) target.ok();
    else target.fail();
    await flush();
  };
  const downloaded = () => download.mock.calls.map(([path]) => path);
  return { audio, bgm, cache, download, downloaded, mapTrack, stored, revokeUrl, finish };
}

/** 캐시 읽기 → 받기 → 틀기로 이어지는 promise 를 다 돌린다 */
async function flush() {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
}

const repeat = (path: string): BgmPlayback => ({ kind: 'repeat', track: path });
const shuffle = (...favorites: string[]): BgmPlayback => ({ kind: 'shuffle', favorites });

describe('BGM', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('남겨 둔 곡이 있으면 받지 않고 바로 튼다', async () => {
    const { audio, bgm, download } = setup([FLORAL]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    expect(download).not.toHaveBeenCalled();
    expect(audio.loads).toEqual([blob(FLORAL)]);
    expect(audio.paused).toBe(false);
  });

  it('남겨 둔 곡이 없는 맵으로 옮기면 앞 곡을 끊고 새 곡을 바로 스트리밍한다', async () => {
    const { audio, bgm, cache } = setup([FLORAL]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    bgm.setMap(ELLINIA);
    await flush();
    expect(audio.src).toBe(stream(MORNING));
    expect(audio.paused).toBe(false);
    await flush();
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('스트리밍하던 곡을 다 받으면 받은 파일로 바꿔 듣던 자리에서 잇고 곡 이름으로 남겨 둔다', async () => {
    const { audio, bgm, cache, finish, revokeUrl } = setup([FLORAL]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    bgm.setMap(ELLINIA);
    await flush();
    expect(revokeUrl).toHaveBeenCalledWith(blob(FLORAL));
    audio.currentTime = 42.5;
    await finish();
    expect(audio.loads).toEqual([blob(FLORAL), stream(MORNING), blob(MORNING)]);
    expect(cache.write).toHaveBeenCalledWith(bgmTrackKey(MORNING), expect.any(Blob));
    audio.emit('loadedmetadata');
    expect(audio.currentTime).toBe(42.5);
    expect(audio.paused).toBe(false);
  });

  it('같은 곡을 쓰는 맵으로 옮기면 곡을 끊지도 다시 받지도 않는다', async () => {
    const { audio, bgm, download } = setup([FLORAL]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    bgm.setMap(MUSHMOM);
    await flush();
    expect(download).not.toHaveBeenCalled();
    expect(audio.loads).toEqual([blob(FLORAL)]);
  });

  it('갈아 끼우는 사이 다른 맵으로 옮기면 새 곡을 앞 곡의 자리로 옮기지 않는다', async () => {
    const { audio, bgm, finish } = setup([FLORAL]);
    bgm.setEnabled(true);
    bgm.setMap(ELLINIA);
    await flush();
    audio.currentTime = 30;
    await finish();
    bgm.setMap(HENESYS);
    await flush();
    audio.emit('loadedmetadata');
    expect(audio.src).toBe(blob(FLORAL));
    expect(audio.currentTime).toBe(0);
  });

  it('스트리밍이 멈춰도 곡을 처음부터 다시 걸지 않고, 받은 파일로 바꾸면 멈춤 기다리기를 끝낸다', async () => {
    const { audio, bgm, finish } = setup();
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    audio.emit('waiting');
    vi.advanceTimersByTime(BGM_STALL_MS);
    expect(audio.loads).toEqual([stream(FLORAL)]);

    await finish();
    audio.emit('waiting');
    audio.emit('timeupdate');
    vi.advanceTimersByTime(BGM_STALL_MS);
    expect(audio.loads).toEqual([stream(FLORAL), blob(FLORAL)]);
  });

  it('같은 맵을 다시 부르면 처음부터 다시 틀지 않는다', async () => {
    const { audio, bgm, download, finish } = setup();
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    bgm.setMap(HENESYS);
    await finish();
    bgm.setMap(HENESYS);
    await flush();
    expect(download).toHaveBeenCalledTimes(1);
    expect(audio.loads).toEqual([stream(FLORAL), blob(FLORAL)]);
  });

  it('보스 맵 곡을 받는 사이 마을로 돌아오면 마을 곡으로 바로 바꾸고 늦게 온 보스 곡은 남기기만 한다', async () => {
    const { audio, bgm, finish, stored } = setup([FLORAL]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    bgm.setMap(ZAKUM);
    await flush();
    bgm.setMap(HENESYS);
    await flush();
    await finish(true, ZAKUM_TRACK);
    expect(audio.loads).toEqual([blob(FLORAL), stream(ZAKUM_TRACK), blob(FLORAL)]);
    expect(stored.has(bgmTrackKey(ZAKUM_TRACK))).toBe(true);
  });

  it('앱이 모르는 맵은 곡을 알아내서 틀고, 못 알아내면 잠시 뒤 다시 알아낸다', async () => {
    const { audio, bgm, mapTrack } = setup([FLORAL, ZAKUM_TRACK]);
    mapTrack.mockRejectedValueOnce(new Error('500'));
    bgm.setEnabled(true);
    bgm.setMap(ZAKUM);
    await flush();
    expect(audio.loads).toEqual([]);
    await vi.advanceTimersByTimeAsync(BGM_RETRY_MS);
    await flush();
    expect(mapTrack).toHaveBeenCalledTimes(2);
    expect(audio.src).toBe(blob(ZAKUM_TRACK));
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
    expect(audio.loads).toEqual([stream(FLORAL), blob(FLORAL)]);
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
    expect(audio.loads).toEqual([stream(FLORAL), stream(FLORAL)]);
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
    expect(downloaded()).toEqual([FLORAL, MORNING]);
  });

  it('소리를 꺼 둔 동안에는 틀지 않는다', async () => {
    const { audio, bgm, finish } = setup();
    bgm.setMap(HENESYS);
    await finish();
    expect(audio.src).toBe(blob(FLORAL));
    expect(audio.paused).toBe(true);
  });

  it('남겨 둔 곡을 못 읽으면 지우고 잠시 뒤 다시 받는다', async () => {
    const { audio, bgm, cache, download, finish } = setup([FLORAL]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    audio.emit('error');
    await flush();
    expect(cache.remove).toHaveBeenCalledWith(bgmTrackKey(FLORAL));

    await vi.advanceTimersByTimeAsync(BGM_RETRY_MS);
    await finish();
    expect(download).toHaveBeenCalledTimes(1);
    expect(audio.loads).toEqual([blob(FLORAL), stream(FLORAL), blob(FLORAL)]);
  });

  it('남겨 둔 곡 재생이 멈춘 채로 있으면 곡을 다시 건다', async () => {
    const { audio, bgm } = setup([FLORAL]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    audio.emit('waiting');
    audio.emit('stalled');
    vi.advanceTimersByTime(BGM_STALL_MS - 1);
    expect(audio.loads).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(audio.loads).toEqual([blob(FLORAL), blob(FLORAL)]);
    expect(audio.paused).toBe(false);
  });

  it('잠깐 멈췄다가 다시 흘러가면 곡을 다시 걸지 않는다', async () => {
    const { audio, bgm } = setup([FLORAL]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    audio.emit('waiting');
    audio.emit('timeupdate');
    vi.advanceTimersByTime(BGM_STALL_MS);
    expect(audio.loads).toHaveLength(1);
  });

  it('소리를 끄면 멈춤을 기다리지 않는다', async () => {
    const { audio, bgm } = setup([FLORAL]);
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    await flush();
    audio.emit('waiting');
    bgm.setEnabled(false);
    vi.advanceTimersByTime(BGM_STALL_MS);
    expect(audio.loads).toHaveLength(1);
    expect(audio.paused).toBe(true);
  });

  it('지금 곡과 받는 중인지를 알려 준다', async () => {
    const { bgm, finish } = setup();
    const changes = vi.fn();
    bgm.onChange(changes);
    expect(bgm.nowPlaying()).toEqual({ track: null, loading: false });
    bgm.setMap(HENESYS);
    await flush();
    expect(bgm.nowPlaying()).toEqual({ track: FLORAL, loading: true });
    await finish();
    expect(bgm.nowPlaying()).toEqual({ track: FLORAL, loading: false });
    expect(changes).toHaveBeenCalled();
  });

  describe('트는 방식', () => {
    it('한 곡 반복은 고른 곡을 반복하고 맵·보스 맵을 옮겨도 곡을 바꾸지 않는다', async () => {
      const { audio, bgm } = setup([FLORAL, GRAVITY]);
      bgm.setEnabled(true);
      bgm.setMap(HENESYS);
      await flush();
      bgm.setPlayback(repeat(GRAVITY));
      await flush();
      expect(audio.src).toBe(blob(GRAVITY));
      expect(audio.loop).toBe(true);
      bgm.setMap(ELLINIA);
      bgm.setMap(BOSSES[0].mapId);
      await flush();
      expect(audio.loads).toEqual([blob(FLORAL), blob(GRAVITY)]);
    });

    it('맵 따라가기로 돌아오면 그동안 옮긴 맵의 곡을 튼다', async () => {
      const { audio, bgm } = setup([FLORAL, MORNING, GRAVITY]);
      bgm.setEnabled(true);
      bgm.setPlayback(repeat(GRAVITY));
      bgm.setMap(HENESYS);
      bgm.setMap(ELLINIA);
      await flush();
      bgm.setPlayback({ kind: 'map' });
      await flush();
      expect(audio.loads).toEqual([blob(GRAVITY), blob(MORNING)]);
      expect(audio.loop).toBe(true);
    });

    it('맵 따라가기에서는 보스 맵으로 들어가면 보스 곡으로 바꾼다', async () => {
      const boss = BOSSES.find((each) => knownMapTrack(each.mapId) !== FLORAL)!;
      const bossTrack = knownMapTrack(boss.mapId)!;
      const { audio, bgm } = setup([FLORAL, bossTrack]);
      bgm.setEnabled(true);
      bgm.setMap(HENESYS);
      bgm.setMap(boss.mapId);
      await flush();
      expect(audio.src).toBe(blob(bossTrack));
    });

    it('즐겨찾기 무작위는 반복하지 않고, 곡이 끝나면 방금 곡이 아닌 즐겨찾기로 넘어간다', async () => {
      const { audio, bgm } = setup([FLORAL, NIGHTMARE, GRAVITY]);
      bgm.setEnabled(true);
      bgm.setMap(HENESYS);
      await flush();
      bgm.setPlayback(shuffle(NIGHTMARE, GRAVITY));
      await flush();
      expect(audio.loop).toBe(false);
      expect(audio.src).toBe(blob(NIGHTMARE));
      bgm.setMap(ELLINIA);
      await flush();
      expect(audio.src).toBe(blob(NIGHTMARE));
      audio.emit('ended');
      await flush();
      expect(audio.src).toBe(blob(GRAVITY));
      audio.emit('ended');
      await flush();
      expect(audio.loads).toEqual([blob(FLORAL), blob(NIGHTMARE), blob(GRAVITY), blob(NIGHTMARE)]);
    });

    it('즐겨찾기 무작위로 바꿀 때 지금 곡이 즐겨찾기에 있으면 끊지 않는다', async () => {
      const { audio, bgm } = setup([FLORAL, GRAVITY]);
      bgm.setEnabled(true);
      bgm.setMap(HENESYS);
      await flush();
      bgm.setPlayback(shuffle(GRAVITY, FLORAL));
      bgm.setPlayback(shuffle(GRAVITY, FLORAL, NIGHTMARE));
      await flush();
      expect(audio.loads).toEqual([blob(FLORAL)]);
    });

    it('즐겨찾기가 한 곡뿐이면 끝날 때 그 곡을 처음부터 다시 튼다', async () => {
      const { audio, bgm } = setup([GRAVITY]);
      bgm.setEnabled(true);
      bgm.setPlayback(shuffle(GRAVITY));
      await flush();
      audio.currentTime = 120;
      audio.paused = true;
      audio.emit('ended');
      expect(audio.currentTime).toBe(0);
      expect(audio.paused).toBe(false);
      expect(audio.loads).toEqual([blob(GRAVITY)]);
    });

    it('즐겨찾기 무작위는 맵 곡을 미리 받지 않고 다음 곡 하나만 받는다', async () => {
      const { bgm, downloaded } = setup([NIGHTMARE]);
      bgm.setPlayback(shuffle(NIGHTMARE, GRAVITY, MORNING));
      bgm.prefetch([HENESYS, ELLINIA]);
      await flush();
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS * 5);
      expect(downloaded()).toEqual([GRAVITY]);
    });

    it('한 곡 반복은 아무것도 미리 받지 않는다', async () => {
      const { bgm, download } = setup([GRAVITY]);
      bgm.setPlayback(repeat(GRAVITY));
      bgm.prefetch([HENESYS, ELLINIA]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS * 5);
      expect(download).not.toHaveBeenCalled();
    });
  });

  describe('미리 받기', () => {
    it('목록 앞에서부터 한 곡씩 받고, 이미 남긴 곡은 건너뛴다', async () => {
      const { bgm, downloaded, finish, stored } = setup([MORNING]);
      bgm.prefetch([HENESYS, ELLINIA, ZAKUM]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      expect(downloaded()).toEqual([FLORAL]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS * 5);
      expect(downloaded()).toEqual([FLORAL]);

      await finish(true, FLORAL);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      // 남긴 곡을 건너뛸 때는 쉬지 않는다. setTimeout(0) 은 1ms 로 돈다
      await vi.advanceTimersByTimeAsync(1);
      expect(downloaded()).toEqual([FLORAL, ZAKUM_TRACK]);
      await finish(true, ZAKUM_TRACK);
      expect([...stored.keys()].sort()).toEqual([FLORAL, MORNING, ZAKUM_TRACK].map(bgmTrackKey).sort());
    });

    it('같은 곡을 쓰는 맵은 한 번만 받는다', async () => {
      const { bgm, downloaded, finish } = setup();
      bgm.prefetch([HENESYS, MUSHMOM]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      await finish(true, FLORAL);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS * 5);
      expect(downloaded()).toEqual([FLORAL]);
    });

    it('미리 받아 둔 맵으로 옮기면 받지 않고 바로 튼다', async () => {
      const { audio, bgm, download, finish } = setup();
      bgm.setEnabled(true);
      bgm.prefetch([ELLINIA]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      await finish(true, MORNING);
      bgm.setMap(ELLINIA);
      await flush();
      expect(download).toHaveBeenCalledTimes(1);
      expect(audio.loads).toEqual([blob(MORNING)]);
    });

    it('미리 받던 곡의 맵으로 옮기면 바로 스트리밍하고 받던 것을 이어 쓴다', async () => {
      const { audio, bgm, download, finish } = setup();
      bgm.setEnabled(true);
      bgm.prefetch([ELLINIA]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      bgm.setMap(ELLINIA);
      await flush();
      expect(audio.src).toBe(stream(MORNING));
      await finish(true, MORNING);
      expect(download).toHaveBeenCalledTimes(1);
      expect(audio.src).toBe(blob(MORNING));
    });

    it('지금 맵 곡을 받는 동안에는 멈췄다가 다 받으면 이어 받는다', async () => {
      const { bgm, downloaded, finish } = setup();
      bgm.setEnabled(true);
      bgm.setMap(HENESYS);
      bgm.prefetch([ELLINIA]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS * 3);
      expect(downloaded()).toEqual([FLORAL]);

      await finish(true, FLORAL);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      expect(downloaded()).toEqual([FLORAL, MORNING]);
    });

    it('실패한 곡은 쉬었다가 다음 곡으로 넘어가고, 한참 뒤에 다시 받는다', async () => {
      const { bgm, downloaded, finish } = setup();
      bgm.prefetch([HENESYS, ELLINIA]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      await finish(false, FLORAL);
      await vi.advanceTimersByTimeAsync(BGM_RETRY_MS - 1);
      expect(downloaded()).toEqual([FLORAL]);
      await vi.advanceTimersByTimeAsync(1);
      expect(downloaded()).toEqual([FLORAL, MORNING]);

      await finish(true, MORNING);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      expect(downloaded()).toEqual([FLORAL, MORNING]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_RETRY_MS);
      expect(downloaded()).toEqual([FLORAL, MORNING, FLORAL]);
    });

    it('같은 목록을 다시 넘겨도 처음부터 다시 시작하지 않는다', async () => {
      const { bgm, downloaded } = setup();
      bgm.prefetch([HENESYS]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS);
      bgm.prefetch([HENESYS]);
      await vi.advanceTimersByTimeAsync(BGM_PREFETCH_GAP_MS * 3);
      expect(downloaded()).toEqual([FLORAL]);
    });
  });

  describe('기기에 남긴 곡', () => {
    it('예전 판이 맵 번호로 남긴 곡은 곡 이름으로 옮기고, 같은 곡이 또 있으면 지운다', async () => {
      const legacy = { 'KMS-389-100000000': FLORAL, 'KMS-389-100020101': FLORAL, 'KMS-389-211042300': ZAKUM_TRACK };
      const { audio, bgm, cache, download, stored } = setup([], { legacy });
      await flush();
      expect(cache.rename).toHaveBeenCalledWith('KMS-389-100000000', bgmTrackKey(FLORAL));
      expect(cache.remove).toHaveBeenCalledWith('KMS-389-100020101');
      // 앱이 모르는 맵의 예전 파일은 두었다가 용량을 넘으면 지운다
      expect([...stored.keys()].sort()).toEqual([bgmTrackKey(FLORAL), 'KMS-389-211042300'].sort());
      bgm.setEnabled(true);
      bgm.setMap(MUSHMOM);
      await flush();
      expect(download).not.toHaveBeenCalled();
      expect(audio.src).toBe(blob(FLORAL));
    });

    it('곡을 남겨 용량을 넘으면 오래 안 들은 곡부터 지우고 지금 곡은 남긴다', async () => {
      const sizes = { [bgmTrackKey(NIGHTMARE)]: 200 * MB, [bgmTrackKey(GRAVITY)]: 90 * MB, [bgmTrackKey(FLORAL)]: 20 * MB };
      const { bgm, cache, finish, stored } = setup([NIGHTMARE, GRAVITY], { sizes });
      bgm.setMap(HENESYS);
      await finish();
      await flush();
      expect(cache.remove).toHaveBeenCalledWith(bgmTrackKey(NIGHTMARE));
      expect([...stored.keys()].sort()).toEqual([GRAVITY, FLORAL].map(bgmTrackKey).sort());
      // 지운 곡은 다시 고르면 받는다
      bgm.setPlayback(repeat(NIGHTMARE));
      await flush();
      expect(cache.read).toHaveBeenLastCalledWith(bgmTrackKey(NIGHTMARE));
    });
  });
});

describe('planBgmEviction', () => {
  const entry = (key: string, bytes: number, usedAt: number): BgmCacheEntry => ({ key, bytes, usedAt });

  it('넘지 않으면 아무것도 지우지 않는다', () => {
    expect(planBgmEviction([entry('a', 100, 1), entry('b', 100, 2)], 200, new Set())).toEqual([]);
  });

  it('넘은 만큼만 오래 안 쓴 곡부터 지운다', () => {
    const entries = [entry('new', 100, 30), entry('old', 100, 10), entry('mid', 100, 20)];
    expect(planBgmEviction(entries, 200, new Set())).toEqual(['old']);
    expect(planBgmEviction(entries, 100, new Set())).toEqual(['old', 'mid']);
  });

  it('지키는 곡은 오래됐어도 건너뛰고, 그것만으로 넘으면 넘은 채 둔다', () => {
    const entries = [entry('playing', 300, 1), entry('old', 100, 2), entry('new', 100, 3)];
    expect(planBgmEviction(entries, 250, new Set(['playing']))).toEqual(['old', 'new']);
  });

  it('용량은 300MB 다', () => {
    expect(BGM_CACHE_BUDGET_BYTES).toBe(300 * MB);
  });
});

describe('pickShuffleTrack', () => {
  it('두 곡 이상이면 방금 곡을 바로 다시 고르지 않는다', () => {
    const favorites = [FLORAL, NIGHTMARE, GRAVITY];
    for (let i = 0; i < 100; i += 1) {
      const random = i / 100;
      for (const current of favorites) expect(pickShuffleTrack(favorites, current, () => random)).not.toBe(current);
    }
  });

  it('남은 곡을 고르게 고른다', () => {
    const favorites = [FLORAL, NIGHTMARE, GRAVITY];
    expect(pickShuffleTrack(favorites, FLORAL, () => 0)).toBe(NIGHTMARE);
    expect(pickShuffleTrack(favorites, FLORAL, () => 0.99)).toBe(GRAVITY);
  });

  it('한 곡뿐이면 그 곡, 없으면 null', () => {
    expect(pickShuffleTrack([GRAVITY], GRAVITY)).toBe(GRAVITY);
    expect(pickShuffleTrack([], null)).toBeNull();
  });
});

describe('bgmPlayback', () => {
  const base = { bgmMode: 'map' as const, bgmTrack: null, bgmFavorites: [] };
  it('기본은 맵 따라가기', () => expect(bgmPlayback(base)).toEqual({ kind: 'map' }));
  it('한 곡 반복은 고른 곡', () => {
    expect(bgmPlayback({ ...base, bgmMode: 'repeat', bgmTrack: GRAVITY })).toEqual(repeat(GRAVITY));
  });
  it('즐겨찾기가 비었으면 맵 따라가기로 튼다', () => {
    expect(bgmPlayback({ ...base, bgmMode: 'shuffle' })).toEqual({ kind: 'map' });
    expect(bgmPlayback({ ...base, bgmMode: 'shuffle', bgmFavorites: [GRAVITY] })).toEqual(shuffle(GRAVITY));
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
  it('BGM 고르기 창에서도 재생한다', () => expect(shouldPlayBgm({ ...base, screen: 'music' })).toBe(true));
  it('창이 숨겨져도 재생한다', () => expect(shouldPlayBgm({ ...base, windowVisible: false })).toBe(true));
  it('음소거나 음량 0 이면 멈춘다', () => {
    expect(shouldPlayBgm({ ...base, muted: true })).toBe(false);
    expect(shouldPlayBgm({ ...base, volume: 0 })).toBe(false);
  });
  it('지도 밖 화면에서는 멈춘다', () => {
    for (const screen of ['select', 'shop', 'settings'] as const) expect(shouldPlayBgm({ ...base, screen })).toBe(false);
  });
});
