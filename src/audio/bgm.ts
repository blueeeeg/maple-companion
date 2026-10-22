import { BOSSES, BOSS_CANDIDATE_POOL } from '../game/bosses';
import { RECENT_TOWN_POOL, type Town, unlockedTowns } from '../game/towns';
import { mapBgmUrl } from '../maple/api';
import { type BgmCache, createBgmCache } from '../platform/bgmCache';

/** 창이 숨겨져도 BGM 은 이어진다. 끄는 것은 음소거(음량 0 포함)와 지도 밖 화면뿐이다 */
export function shouldPlayBgm(input: {
  muted: boolean;
  volume: number;
  screen: 'map' | 'select' | 'shop' | 'settings';
  windowVisible: boolean;
}): boolean {
  return !input.muted && input.volume > 0 && input.screen === 'map';
}

/** 곡을 못 받았을 때 같은 곡을 다시 받기까지 쉬는 시간 */
export const BGM_RETRY_MS = 15 * 1000;
/** 팬 API 는 1분 넘게 붙잡고 있다가 520 으로 끝내곤 한다. 그보다 길게 걸리면 끊고 다시 받는다 */
export const BGM_DOWNLOAD_TIMEOUT_MS = 2 * 60 * 1000;
/** 재생이 이만큼 멈춰 있으면 곡을 다시 건다 */
export const BGM_STALL_MS = 10 * 1000;
/** 미리 받기는 한 곡씩 이만큼 쉬어 가며 받는다. 지금 맵 곡을 받는 동안에는 멈춘다 */
export const BGM_PREFETCH_GAP_MS = 3 * 1000;
/** 미리 받기에 실패한 곡은 이만큼 지나서 다시 받는다. 그동안 다른 곡을 받는다 */
export const BGM_PREFETCH_RETRY_MS = 5 * 60 * 1000;

/** 이 레벨에서 곧 들어갈 만한 맵. 마을을 돌 때 고르는 최근 마을, 보스 후보, 고정할 수 있는 나머지 마을 순서다 */
export function likelyBgmMaps(level: number): number[] {
  const towns = unlockedTowns(level).reverse();
  const bosses = BOSSES.filter((boss) => boss.minLevel <= level).sort((a, b) => b.minLevel - a.minLevel);
  const ordered = [
    ...towns.slice(0, RECENT_TOWN_POOL),
    ...bosses.slice(0, BOSS_CANDIDATE_POOL),
    ...towns.slice(RECENT_TOWN_POOL),
  ];
  return [...new Set(ordered.map((map) => map.mapId))];
}

export interface Bgm {
  setTown(town: Town): void;
  /** 마을이 아닌 맵(보스 맵 등)의 BGM. 마을로 돌아가면 setTown 을 다시 부른다 */
  setMap(mapId: number): void;
  setEnabled(enabled: boolean): void;
  /** 0~1 */
  setVolume(volume: number): void;
  /** 이 맵들의 곡을 앞에서부터 미리 받아 둔다. 같은 목록을 다시 넘기면 아무것도 안 한다 */
  prefetch(mapIds: number[]): void;
}

export interface BgmDeps {
  cache: BgmCache;
  download(mapId: number): Promise<Blob>;
  toUrl(track: Blob): string;
  revokeUrl(url: string): void;
}

async function downloadBgm(mapId: number): Promise<Blob> {
  const response = await fetch(mapBgmUrl(mapId), { signal: AbortSignal.timeout(BGM_DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${response.status} ${response.url}`);
  const track = await response.blob();
  // 오류 페이지를 곡으로 남기면 다음 실행부터 계속 못 튼다
  if (!track.type.startsWith('audio/')) throw new Error(`BGM 이 아니다: ${track.type}`);
  return track;
}

const defaultDeps = (): BgmDeps => ({
  cache: createBgmCache(),
  download: downloadBgm,
  toUrl: (track) => URL.createObjectURL(track),
  revokeUrl: (url) => URL.revokeObjectURL(url),
});

/**
 * 마을 맵에 걸린 원작 BGM 을 반복 재생한다. audio·input·deps 는 테스트가 바꿔 끼운다.
 * 곡은 통째로 받아 기기에 남기고 거기서 튼다. 팬 API 주소를 audio 에 계속 걸어 두면 WebKit 이 구간마다 따로 받고
 * 디스크 캐시에도 안 남겨서, 곡 중간이나 반복할 때 서버가 늦으면 소리가 끊긴다.
 * 남긴 곡이 없는 맵으로 옮기면 그 주소를 바로 스트리밍해 곡을 맞추고, 다 받으면 받은 파일로 갈아 끼운다
 */
export function createBgm(
  audio: HTMLAudioElement = new Audio(),
  input: EventTarget = window,
  deps: BgmDeps = defaultDeps(),
): Bgm {
  audio.loop = true;
  let enabled = false;
  /** 틀어야 할 맵 */
  let wanted: number | null = null;
  /** audio 에 걸려 있는 맵. 남긴 곡을 읽는 동안에는 wanted 와 다르다 */
  let playing: number | null = null;
  let playingUrl = '';
  /** audio 가 팬 API 주소를 스트리밍 중이다. 다 받으면 받은 파일로 바꾼다 */
  let streaming = false;
  let streamBroken = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  // 미리 받던 곡으로 옮기면 받던 것을 이어 쓴다
  const downloads = new Map<number, Promise<Blob>>();
  /** 기기에 남은 것을 확인한 맵 */
  const cached = new Set<number>();
  let prefetchList: number[] = [];
  let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
  let prefetching = false;
  const prefetchFailedAt = new Map<number, number>();

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

  function playTrack(mapId: number, track: Blob) {
    playing = mapId;
    streaming = false;
    setSource(deps.toUrl(track));
    apply();
    kickPrefetch();
  }

  function stream(mapId: number) {
    playing = mapId;
    streaming = true;
    streamBroken = false;
    setSource(mapBgmUrl(mapId));
    apply();
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
    kickPrefetch();
  }

  function downloadAndStore(mapId: number): Promise<Blob> {
    let task = downloads.get(mapId);
    if (!task) {
      task = deps
        .download(mapId)
        .then((track) => {
          cached.add(mapId);
          deps.cache.write(mapId, track).catch(() => cached.delete(mapId));
          return track;
        })
        .finally(() => downloads.delete(mapId));
      downloads.set(mapId, task);
    }
    return task;
  }

  function fetchFull(mapId: number) {
    downloadAndStore(mapId).then(
      (track) => {
        if (wanted !== mapId || (playing === mapId && !streaming)) return;
        if (playing === mapId) swapToTrack(track);
        else playTrack(mapId, track);
      },
      () => retryLater(mapId),
    );
  }

  async function load(mapId: number) {
    const track = await deps.cache.read(mapId).catch(() => null);
    if (wanted !== mapId) return;
    if (track) {
      cached.add(mapId);
      playTrack(mapId, track);
      return;
    }
    // 다 받을 때까지 앞 맵 곡을 틀어 두면 맵과 곡이 한참 어긋난다
    stream(mapId);
    fetchFull(mapId);
  }

  function retryLater(mapId: number) {
    // 기다리는 사이 다른 맵으로 옮기면 setMap 이 이 타이머를 지운다
    if (wanted !== mapId || retryTimer !== null) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      // 스트리밍이 멀쩡하면 곡을 처음부터 다시 걸지 않고 받기만 다시 한다
      if (playing === mapId && streaming && !streamBroken) fetchFull(mapId);
      else void load(mapId);
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
    deps.cache
      .remove(broken)
      .catch(() => {})
      .then(() => retryLater(broken));
  });

  // 기기에 있는 곡이라 멈출 일이 드물지만, 멈춘 채로 두면 다른 맵으로 옮길 때까지 소리가 없다.
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

  /** 지금 맵 곡을 아직 다 받지 못했으면 미리 받기를 멈춘다. 다 받으면 playTrack·swapToTrack 이 다시 깨운다 */
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
      (mapId) => !cached.has(mapId) && now - (prefetchFailedAt.get(mapId) ?? -Infinity) >= BGM_PREFETCH_RETRY_MS,
    );
    if (next === undefined) {
      // 남은 것은 실패하고 쉬는 곡뿐이다. 가장 먼저 쉬기가 끝나는 때에 다시 본다
      const waits = prefetchList
        .filter((mapId) => !cached.has(mapId))
        .map((mapId) => (prefetchFailedAt.get(mapId) ?? now) + BGM_PREFETCH_RETRY_MS - now);
      if (waits.length > 0) kickPrefetch(Math.min(...waits));
      return;
    }
    prefetching = true;
    let delay = BGM_PREFETCH_GAP_MS;
    try {
      if (await deps.cache.has(next).catch(() => false)) {
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

  function setMap(mapId: number) {
    if (mapId === wanted) return;
    wanted = mapId;
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
    if (mapId !== playing) void load(mapId);
    else if (streaming) fetchFull(mapId);
    else kickPrefetch();
  }

  return {
    setTown(town) {
      setMap(town.mapId);
    },
    setMap,
    setEnabled(next) {
      enabled = next;
      apply();
    },
    setVolume(volume) {
      audio.volume = Math.min(1, Math.max(0, volume));
    },
    prefetch(mapIds) {
      if (mapIds.join() === prefetchList.join()) return;
      prefetchList = mapIds;
      kickPrefetch();
    },
  };
}
