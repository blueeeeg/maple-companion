import type { Town } from '../game/towns';
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

export interface Bgm {
  setTown(town: Town): void;
  /** 마을이 아닌 맵(보스 맵 등)의 BGM. 마을로 돌아가면 setTown 을 다시 부른다 */
  setMap(mapId: number): void;
  setEnabled(enabled: boolean): void;
  /** 0~1 */
  setVolume(volume: number): void;
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
 * 곡은 통째로 받아 기기에 남기고 거기서 튼다. 팬 API 주소를 audio 에 바로 걸면 WebKit 이 구간마다 따로 받고
 * 디스크 캐시에도 안 남겨서, 곡 중간이나 반복할 때 서버가 늦으면 소리가 끊긴다
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
  /** audio 에 걸려 있는 맵. 받는 동안에는 wanted 와 다르다 */
  let playing: number | null = null;
  let playingUrl = '';
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  // 보스 맵에 다녀오는 사이처럼 받는 중인 곡을 다시 부르면 받던 것을 이어 쓴다
  const pending = new Map<number, Promise<Blob>>();

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

  function play(mapId: number, track: Blob) {
    const before = playingUrl;
    playing = mapId;
    playingUrl = deps.toUrl(track);
    audio.src = playingUrl;
    if (before) deps.revokeUrl(before);
    apply();
  }

  function retryLater(mapId: number) {
    // 기다리는 사이 다른 맵으로 옮기면 setMap 이 이 타이머를 지운다
    if (wanted !== mapId || retryTimer !== null) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      load(mapId);
    }, BGM_RETRY_MS);
  }

  async function fetchTrack(mapId: number): Promise<Blob> {
    const cached = await deps.cache.read(mapId).catch(() => null);
    if (cached) return cached;
    const track = await deps.download(mapId);
    deps.cache.write(mapId, track).catch(() => {});
    return track;
  }

  // 받는 동안에는 앞 곡을 계속 틀고, 다 받으면 바꾼다
  function load(mapId: number) {
    let task = pending.get(mapId);
    if (!task) {
      task = fetchTrack(mapId).finally(() => pending.delete(mapId));
      pending.set(mapId, task);
    }
    task.then(
      (track) => {
        if (wanted === mapId && playing !== mapId) play(mapId, track);
      },
      () => retryLater(mapId),
    );
  }

  // 받아 둔 곡을 못 읽으면 남긴 파일이 깨졌다고 보고 지운 뒤 다시 받는다
  audio.addEventListener('error', () => {
    const broken = playing;
    if (broken === null) return;
    playing = null;
    clearStall();
    deps.cache
      .remove(broken)
      .catch(() => {})
      .then(() => retryLater(broken));
  });

  // 기기에 있는 곡이라 멈출 일이 드물지만, 멈춘 채로 두면 다른 맵으로 옮길 때까지 소리가 없다
  const onStall = () => {
    if (stallTimer !== null || !playingUrl) return;
    stallTimer = setTimeout(() => {
      stallTimer = null;
      if (!enabled || !playingUrl) return;
      audio.src = playingUrl;
      apply();
    }, BGM_STALL_MS);
  };
  audio.addEventListener('waiting', onStall);
  audio.addEventListener('stalled', onStall);
  audio.addEventListener('playing', clearStall);
  audio.addEventListener('timeupdate', clearStall);

  function setMap(mapId: number) {
    if (mapId === wanted) return;
    wanted = mapId;
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
    // 보스 맵 곡을 받는 사이 마을로 돌아오면 듣던 마을 곡을 처음부터 다시 틀지 않는다
    if (mapId !== playing) load(mapId);
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
  };
}
