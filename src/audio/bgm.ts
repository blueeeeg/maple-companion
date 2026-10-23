import { BOSSES } from '../game/bosses';
import type { Settings } from '../game/settings';
import { RECENT_TOWN_POOL, type Town, unlockedTowns } from '../game/towns';
import { mapBgmNodeUrl, musicUrl } from '../maple/api';
import { type BgmCache, type BgmCacheEntry, createBgmCache } from '../platform/bgmCache';
import { loadStoredJson } from '../ui/cashAssets';
import { bgmTrackKey, canonicalTrack, knownMapTrack, legacyMapKeyId } from './bgmTracks';

/** 창이 숨겨져도 BGM 은 이어진다. 끄는 것은 음소거(음량 0 포함)와 지도 밖 화면뿐이다. BGM 고르기 창은 들어 보며 고르니 튼다 */
export function shouldPlayBgm(input: {
  muted: boolean;
  volume: number;
  screen: 'map' | 'select' | 'shop' | 'settings' | 'music';
  windowVisible: boolean;
}): boolean {
  return !input.muted && input.volume > 0 && (input.screen === 'map' || input.screen === 'music');
}

/** 곡을 못 받았을 때 같은 곡을 다시 받기까지 쉬는 시간 */
export const BGM_RETRY_MS = 15 * 1000;
/** 팬 API 는 1분 넘게 붙잡고 있다가 520 으로 끝내곤 한다. 그보다 길게 걸리면 끊고 다시 받는다 */
export const BGM_DOWNLOAD_TIMEOUT_MS = 2 * 60 * 1000;
/** 재생이 이만큼 멈춰 있으면 곡을 다시 건다 */
export const BGM_STALL_MS = 10 * 1000;
/** 미리 받기는 한 곡씩 이만큼 쉬어 가며 받는다. 지금 곡을 받는 동안에는 멈춘다 */
export const BGM_PREFETCH_GAP_MS = 3 * 1000;
/** 미리 받기에 실패한 곡은 이만큼 지나서 다시 받는다. 그동안 다른 곡을 받는다 */
export const BGM_PREFETCH_RETRY_MS = 5 * 60 * 1000;
/**
 * 기기에 남기는 곡 전체 용량. 원작 곡은 한 곡에 대개 1~3MB 라 100곡 넘게 들어간다. 넘으면 오래 안 들은 곡부터 지운다.
 * 맵 따라가기로 미리 받는 곡(마을·사냥터·보스 맵 50여 곳, 겹치는 곡이 많다)은 이 안에 넉넉히 들어간다
 */
export const BGM_CACHE_BUDGET_BYTES = 300 * 1024 * 1024;
const MAP_TRACK_TIMEOUT_MS = 30 * 1000;

/** 이 레벨에서 곧 들어갈 만한 맵. 마을을 돌 때 고르는 최근 마을, 잡을 수 있는 보스(센 것부터), 고정할 수 있는 나머지 마을 순서다 */
export function likelyBgmMaps(level: number): number[] {
  const towns = unlockedTowns(level).reverse();
  const bosses = BOSSES.filter((boss) => boss.minLevel <= level).sort((a, b) => b.minLevel - a.minLevel);
  const ordered = [
    ...towns.slice(0, RECENT_TOWN_POOL),
    ...bosses,
    ...towns.slice(RECENT_TOWN_POOL),
  ];
  return [...new Set(ordered.map((map) => map.mapId))];
}

export type BgmPlayback = { kind: 'map' } | { kind: 'repeat'; track: string } | { kind: 'shuffle'; favorites: string[] };

/** 설정대로 실제로 트는 방식. 즐겨찾기가 비었으면 「즐겨찾기 무작위」 를 골라 둬도 맵 따라가기로 튼다 */
export function bgmPlayback(settings: Pick<Settings, 'bgmMode' | 'bgmTrack' | 'bgmFavorites'>): BgmPlayback {
  if (settings.bgmMode === 'repeat' && settings.bgmTrack) return { kind: 'repeat', track: settings.bgmTrack };
  if (settings.bgmMode === 'shuffle' && settings.bgmFavorites.length > 0) return { kind: 'shuffle', favorites: settings.bgmFavorites };
  return { kind: 'map' };
}

/** 즐겨찾기 중 다음 곡. 두 곡 이상이면 방금 곡은 다시 고르지 않는다 */
export function pickShuffleTrack(favorites: readonly string[], current: string | null, random: () => number = Math.random): string | null {
  const candidates = favorites.length > 1 ? favorites.filter((track) => track !== current) : favorites;
  if (candidates.length === 0) return null;
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}

/** 용량을 넘은 만큼 오래 안 쓴 곡부터 지울 이름. keep(지금 곡·곧 틀 곡)은 지우지 않아서, 그것만으로 넘으면 넘은 채 둔다 */
export function planBgmEviction(entries: readonly BgmCacheEntry[], budgetBytes: number, keep: ReadonlySet<string>): string[] {
  let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  const evict: string[] = [];
  for (const entry of [...entries].sort((a, b) => a.usedAt - b.usedAt)) {
    if (total <= budgetBytes) break;
    if (keep.has(entry.key)) continue;
    evict.push(entry.key);
    total -= entry.bytes;
  }
  return evict;
}

export interface BgmNowPlaying {
  /** 틀어야 할 곡. 맵 곡을 아직 못 알아냈으면 앞 곡이나 null */
  track: string | null;
  /** 남긴 곡을 읽거나 받는 중이다 */
  loading: boolean;
}

export interface Bgm {
  setTown(town: Town): void;
  /** 마을이 아닌 맵(보스 맵 등)의 BGM. 마을로 돌아가면 setTown 을 다시 부른다. 맵 따라가기가 아니면 맵만 기억해 둔다 */
  setMap(mapId: number): void;
  setPlayback(playback: BgmPlayback): void;
  setEnabled(enabled: boolean): void;
  /** 0~1 */
  setVolume(volume: number): void;
  /** 맵 따라가기일 때 이 맵들의 곡을 앞에서부터 미리 받아 둔다. 같은 목록을 다시 넘기면 아무것도 안 한다 */
  prefetch(mapIds: number[]): void;
  nowPlaying(): BgmNowPlaying;
  /** 지금 곡이나 받는 상태가 바뀌면 부른다 */
  onChange(listener: () => void): void;
}

export interface BgmDeps {
  cache: BgmCache;
  download(track: string): Promise<Blob>;
  /** 앱이 모르는 맵의 곡 경로 */
  mapTrack(mapId: number): Promise<string>;
  toUrl(track: Blob): string;
  revokeUrl(url: string): void;
  random(): number;
}

async function downloadBgm(path: string): Promise<Blob> {
  const response = await fetch(musicUrl(path), { signal: AbortSignal.timeout(BGM_DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${response.status} ${response.url}`);
  const track = await response.blob();
  // 오류 페이지를 곡으로 남기면 다음 실행부터 계속 못 튼다
  if (!track.type.startsWith('audio/')) throw new Error(`BGM 이 아니다: ${track.type}`);
  return track;
}

/** 맵 → 곡은 바뀌지 않아서 한 번 알아낸 것은 기기(IndexedDB)에 남긴다 */
const fetchMapTrack = (mapId: number) =>
  loadStoredJson<{ value: string }, string>(mapBgmNodeUrl(mapId), (raw) => canonicalTrack(raw.value), MAP_TRACK_TIMEOUT_MS);

const defaultDeps = (): BgmDeps => ({
  cache: createBgmCache(),
  download: downloadBgm,
  mapTrack: fetchMapTrack,
  toUrl: (track) => URL.createObjectURL(track),
  revokeUrl: (url) => URL.revokeObjectURL(url),
  random: Math.random,
});

/**
 * 원작 BGM 을 튼다. 맵 따라가기는 지금 맵 곡을, 한 곡 반복은 고른 곡을 반복하고, 즐겨찾기 무작위는 한 곡이 끝나면 다른 곡으로 넘어간다.
 * audio·input·deps 는 테스트가 바꿔 끼운다.
 * 곡은 통째로 받아 기기에 남기고 거기서 튼다. 팬 API 주소를 audio 에 계속 걸어 두면 WebKit 이 구간마다 따로 받고
 * 디스크 캐시에도 안 남겨서, 곡 중간이나 반복할 때 서버가 늦으면 소리가 끊긴다.
 * 남긴 곡이 없으면 그 주소를 바로 스트리밍해 곡을 맞추고, 다 받으면 받은 파일로 갈아 끼운다.
 * 곡은 경로(`Bgm00/FloralLife`)로 다뤄서 여러 맵이 같은 곡이면 한 번만 받는다
 */
export function createBgm(
  audio: HTMLAudioElement = new Audio(),
  input: EventTarget = window,
  deps: BgmDeps = defaultDeps(),
): Bgm {
  audio.loop = true;
  let enabled = false;
  let playback: BgmPlayback = { kind: 'map' };
  /** 지금 캐릭터가 있는 맵. 다른 방식에서 맵 따라가기로 돌아오면 이 맵 곡을 튼다 */
  let currentMap: number | null = null;
  /** 즐겨찾기 무작위에서 지금 곡 다음에 틀 곡. 이 곡만 미리 받는다 */
  let shuffleNext: string | null = null;
  /** 틀어야 할 곡 */
  let wanted: string | null = null;
  /** audio 에 걸려 있는 곡. 남긴 곡을 읽는 동안에는 wanted 와 다르다 */
  let playing: string | null = null;
  let playingUrl = '';
  /** audio 가 팬 API 주소를 스트리밍 중이다. 다 받으면 받은 파일로 바꾼다 */
  let streaming = false;
  let streamBroken = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let mapRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  // 미리 받던 곡으로 옮기면 받던 것을 이어 쓴다
  const downloads = new Map<string, Promise<Blob>>();
  /** 기기에 남은 것을 확인한 곡 */
  const cached = new Set<string>();
  /** WZ 에서 알아낸, 앱이 모르는 맵의 곡 */
  const mapTracks = new Map<number, string>();
  const mapLookups = new Map<number, Promise<string>>();
  let prefetchMaps: number[] = [];
  let prefetchList: string[] = [];
  let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
  let prefetching = false;
  const prefetchFailedAt = new Map<string, number>();
  let budgetRunning = false;
  let budgetAgain = false;
  const listeners: (() => void)[] = [];

  const notify = () => listeners.forEach((listener) => listener());

  function clearStall() {
    if (stallTimer !== null) clearTimeout(stallTimer);
    stallTimer = null;
  }

  function apply() {
    if (enabled && playingUrl) audio.play().catch(() => {});
    else {
      clearStall();
      audio.pause();
    }
  }

  // 웹뷰는 사용자 입력 전까지 소리를 막는다. 첫 클릭에 다시 시도한다
  input.addEventListener('pointerdown', () => apply(), { once: true });

  function setSource(url: string) {
    const before = playingUrl;
    playingUrl = url;
    clearStall();
    audio.src = url;
    if (before.startsWith('blob:') && before !== url) deps.revokeUrl(before);
  }

  function playTrack(path: string, track: Blob) {
    playing = path;
    streaming = false;
    setSource(deps.toUrl(track));
    apply();
    notify();
    kickPrefetch();
  }

  function stream(path: string) {
    playing = path;
    streaming = true;
    streamBroken = false;
    setSource(musicUrl(path));
    apply();
    notify();
  }

  /** 스트리밍하던 곡을 받은 파일로 바꾸고 듣던 자리로 옮긴다 */
  function swapToTrack(track: Blob) {
    const at = audio.currentTime;
    streaming = false;
    const url = deps.toUrl(track);
    setSource(url);
    // 길이를 읽기 전에 옮기면 WebKit 이 무시할 수 있어서 메타데이터를 읽은 뒤 옮긴다. 재생은 그 뒤에 시작된다
    if (at > 0) {
      audio.addEventListener(
        'loadedmetadata',
        () => {
          if (playingUrl === url) audio.currentTime = at;
        },
        { once: true },
      );
    }
    apply();
    notify();
    kickPrefetch();
  }

  /** 지금 곡과 곧 틀 곡은 용량을 넘어도 지우지 않는다. 미리 받는 곡까지 지우면 지우고 다시 받기를 되풀이한다 */
  function protectedKeys(): Set<string> {
    return new Set([wanted, playing, ...prefetchList].filter((path): path is string => path !== null).map(bgmTrackKey));
  }

  /** 용량을 넘었으면 오래 안 들은 곡부터 지운다. 지우는 중에 또 부르면 끝난 뒤 한 번 더 본다 */
  async function enforceBudget() {
    if (budgetRunning) {
      budgetAgain = true;
      return;
    }
    budgetRunning = true;
    try {
      do {
        budgetAgain = false;
        const evict = new Set(planBgmEviction(await deps.cache.list(), BGM_CACHE_BUDGET_BYTES, protectedKeys()));
        cached.forEach((path) => {
          if (evict.has(bgmTrackKey(path))) cached.delete(path);
        });
        await Promise.all([...evict].map((key) => deps.cache.remove(key).catch(() => {})));
      } while (budgetAgain);
    } catch {
      // 목록을 못 읽으면 다음에 곡을 남길 때 다시 본다
    }
    budgetRunning = false;
  }

  function downloadAndStore(path: string): Promise<Blob> {
    let task = downloads.get(path);
    if (!task) {
      task = deps
        .download(path)
        .then((track) => {
          cached.add(path);
          deps.cache.write(bgmTrackKey(path), track).then(enforceBudget, () => cached.delete(path));
          return track;
        })
        .finally(() => downloads.delete(path));
      downloads.set(path, task);
    }
    return task;
  }

  function fetchFull(path: string) {
    downloadAndStore(path).then(
      (track) => {
        if (wanted !== path || (playing === path && !streaming)) return;
        if (playing === path) swapToTrack(track);
        else playTrack(path, track);
      },
      () => retryLater(path),
    );
  }

  async function load(path: string) {
    const track = await deps.cache.read(bgmTrackKey(path)).catch(() => null);
    if (wanted !== path) return;
    if (track) {
      cached.add(path);
      playTrack(path, track);
      return;
    }
    // 다 받을 때까지 앞 곡을 틀어 두면 맵과 곡이 한참 어긋난다
    stream(path);
    fetchFull(path);
  }

  function retryLater(path: string) {
    // 기다리는 사이 다른 곡으로 옮기면 want 가 이 타이머를 지운다
    if (wanted !== path || retryTimer !== null) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      // 스트리밍이 멀쩡하면 곡을 처음부터 다시 걸지 않고 받기만 다시 한다
      if (playing === path && streaming && !streamBroken) fetchFull(path);
      else void load(path);
    }, BGM_RETRY_MS);
  }

  audio.addEventListener('error', () => {
    const broken = playing;
    if (broken === null) return;
    clearStall();
    // 스트리밍이 끊긴 것은 받는 중인 파일로 바꾸면 풀린다. 받기도 실패하면 retryLater 가 다시 건다
    if (streaming) {
      streamBroken = true;
      return;
    }
    // 받아 둔 곡을 못 읽으면 남긴 파일이 깨졌다고 보고 지운 뒤 다시 받는다
    playing = null;
    cached.delete(broken);
    notify();
    deps.cache
      .remove(bgmTrackKey(broken))
      .catch(() => {})
      .then(() => retryLater(broken));
  });

  // 기기에 있는 곡이라 멈출 일이 드물지만, 멈춘 채로 두면 다른 곡으로 옮길 때까지 소리가 없다.
  // 스트리밍이 멈춘 것은 다시 걸면 또 서버에서 받으니 받은 파일로 바꿀 때까지 둔다
  const onStall = () => {
    if (stallTimer !== null || !playingUrl || streaming) return;
    stallTimer = setTimeout(() => {
      stallTimer = null;
      if (!enabled || !playingUrl || streaming) return;
      audio.src = playingUrl;
      apply();
    }, BGM_STALL_MS);
  };
  audio.addEventListener('waiting', onStall);
  audio.addEventListener('stalled', onStall);
  audio.addEventListener('playing', clearStall);
  audio.addEventListener('timeupdate', clearStall);

  // 즐겨찾기 무작위만 반복을 꺼 두어 곡이 끝난다
  audio.addEventListener('ended', () => {
    if (playback.kind !== 'shuffle') return;
    const next = shuffleNext ?? pickShuffleTrack(playback.favorites, wanted, deps.random);
    if (next === null) return;
    shuffleNext = pickShuffleTrack(playback.favorites, next, deps.random);
    updatePrefetch();
    if (next !== wanted) return want(next);
    // 즐겨찾기가 한 곡뿐이면 같은 곡을 처음부터 다시 튼다
    audio.currentTime = 0;
    apply();
  });

  /** 지금 곡을 다 받지 못했으면 미리 받기를 멈춘다. 다 받으면 playTrack·swapToTrack 이 다시 깨운다 */
  const foregroundBusy = () => wanted !== null && (playing !== wanted || streaming || retryTimer !== null);

  function kickPrefetch(delay = BGM_PREFETCH_GAP_MS) {
    if (prefetchTimer !== null || prefetching) return;
    prefetchTimer = setTimeout(() => {
      prefetchTimer = null;
      void prefetchNext();
    }, delay);
  }

  async function prefetchNext() {
    if (prefetching || foregroundBusy()) return;
    const now = Date.now();
    const next = prefetchList.find(
      (path) => !cached.has(path) && now - (prefetchFailedAt.get(path) ?? -Infinity) >= BGM_PREFETCH_RETRY_MS,
    );
    if (next === undefined) {
      // 남은 것은 실패하고 쉬는 곡뿐이다. 가장 먼저 쉬기가 끝나는 때에 다시 본다
      const waits = prefetchList
        .filter((path) => !cached.has(path))
        .map((path) => (prefetchFailedAt.get(path) ?? now) + BGM_PREFETCH_RETRY_MS - now);
      if (waits.length > 0) kickPrefetch(Math.min(...waits));
      return;
    }
    prefetching = true;
    let delay = BGM_PREFETCH_GAP_MS;
    try {
      if (await deps.cache.has(bgmTrackKey(next)).catch(() => false)) {
        cached.add(next);
        delay = 0;
      } else {
        await downloadAndStore(next);
      }
    } catch {
      prefetchFailedAt.set(next, Date.now());
      delay = BGM_RETRY_MS;
    }
    prefetching = false;
    kickPrefetch(delay);
  }

  /** 맵 곡을 알면 바로, 모르면 WZ 에서 알아내기 시작하고 null */
  function mapTrack(mapId: number): string | null {
    const known = knownMapTrack(mapId) ?? mapTracks.get(mapId);
    if (known) return known;
    if (!mapLookups.has(mapId)) {
      const lookup = deps.mapTrack(mapId);
      mapLookups.set(mapId, lookup);
      lookup.then(
        (path) => {
          mapTracks.set(mapId, path);
          if (playback.kind !== 'map') return;
          if (mapId === currentMap) follow();
          if (prefetchMaps.includes(mapId)) updatePrefetch();
        },
        // 다음에 이 맵 곡을 찾을 때 다시 알아낸다
        () => mapLookups.delete(mapId),
      );
    }
    return null;
  }

  /** 맵 따라가기는 맵들의 곡, 즐겨찾기 무작위는 다음 곡 하나만 미리 받는다. 한 곡 반복은 받지 않는다 */
  function updatePrefetch() {
    const list =
      playback.kind === 'map'
        ? prefetchMaps.map(mapTrack).filter((path): path is string => path !== null)
        : playback.kind === 'shuffle' && shuffleNext !== null
          ? [shuffleNext]
          : [];
    const unique = [...new Set(list)];
    if (unique.join('\n') === prefetchList.join('\n')) return;
    prefetchList = unique;
    kickPrefetch();
  }

  function want(path: string) {
    if (path === wanted) return;
    wanted = path;
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
    notify();
    if (path !== playing) void load(path);
    else if (streaming) fetchFull(path);
    else kickPrefetch();
  }

  function follow() {
    if (mapRetryTimer !== null) clearTimeout(mapRetryTimer);
    mapRetryTimer = null;
    if (currentMap === null || playback.kind !== 'map') return;
    const mapId = currentMap;
    const path = mapTrack(mapId);
    if (path !== null) return want(path);
    // 곡을 알아내지 못했으면 잠시 뒤 다시 알아낸다. 그 사이 다른 맵으로 옮기면 setMap 이 이 타이머를 지운다
    mapLookups.get(mapId)?.catch(() => {
      if (currentMap === mapId && mapRetryTimer === null) mapRetryTimer = setTimeout(follow, BGM_RETRY_MS);
    });
  }

  function setMap(mapId: number) {
    if (mapId === currentMap) return;
    currentMap = mapId;
    follow();
  }

  function setPlayback(next: BgmPlayback) {
    if (JSON.stringify(next) === JSON.stringify(playback)) return;
    const before = playback;
    playback = next;
    audio.loop = next.kind !== 'shuffle';
    if (next.kind === 'map') {
      shuffleNext = null;
      follow();
    } else if (next.kind === 'repeat') {
      shuffleNext = null;
      want(next.track);
    } else {
      // 즐겨찾기만 고쳤거나 지금 곡이 즐겨찾기에 있으면 듣던 곡을 끊지 않는다
      const keep = wanted !== null && (before.kind === 'shuffle' || next.favorites.includes(wanted));
      if (!keep) want(pickShuffleTrack(next.favorites, wanted, deps.random)!);
      if (shuffleNext === null || shuffleNext === wanted || !next.favorites.includes(shuffleNext)) {
        shuffleNext = pickShuffleTrack(next.favorites, wanted, deps.random);
      }
    }
    updatePrefetch();
  }

  /** 예전 판이 맵 번호로 남긴 곡을 곡 이름으로 옮긴다. 앱이 모르는 맵 곡은 두면 용량을 넘을 때 지워진다 */
  async function migrateLegacy() {
    const entries = await deps.cache.list();
    const keys = new Set(entries.map((entry) => entry.key));
    for (const { key } of entries) {
      const mapId = legacyMapKeyId(key);
      const path = mapId === null ? null : knownMapTrack(mapId);
      if (path === null) continue;
      const target = bgmTrackKey(path);
      // 여러 맵이 같은 곡이면 하나만 옮기고 나머지는 지운다
      if (keys.has(target)) await deps.cache.remove(key);
      else await deps.cache.rename(key, target);
      keys.add(target);
    }
  }
  void migrateLegacy().catch(() => {});

  return {
    setTown(town) {
      setMap(town.mapId);
    },
    setMap,
    setPlayback,
    setEnabled(next) {
      enabled = next;
      apply();
    },
    setVolume(volume) {
      audio.volume = Math.min(1, Math.max(0, volume));
    },
    prefetch(mapIds) {
      if (mapIds.join() === prefetchMaps.join()) return;
      prefetchMaps = mapIds;
      updatePrefetch();
    },
    nowPlaying: () => ({ track: wanted, loading: wanted !== null && (playing !== wanted || streaming) }),
    onChange(listener) {
      listeners.push(listener);
    },
  };
}
