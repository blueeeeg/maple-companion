import type { Town } from '../game/towns';
import { mapBgmUrl } from '../maple/api';

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

export interface Bgm {
  setTown(town: Town): void;
  /** 마을이 아닌 맵(보스 맵 등)의 BGM. 마을로 돌아가면 setTown 을 다시 부른다 */
  setMap(mapId: number): void;
  setEnabled(enabled: boolean): void;
  /** 0~1 */
  setVolume(volume: number): void;
}

/** 마을 맵에 걸린 원작 BGM 을 반복 재생한다. audio·input 은 테스트가 바꿔 끼운다 */
export function createBgm(audio: HTMLAudioElement = new Audio(), input: EventTarget = window): Bgm {
  audio.loop = true;
  let enabled = false;
  let track = '';
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function apply() {
    if (enabled && audio.src) audio.play().catch(() => {});
    else audio.pause();
  }

  // 웹뷰는 사용자 입력 전까지 소리를 막는다. 첫 클릭에 다시 시도한다
  input.addEventListener('pointerdown', () => apply(), { once: true });

  function load(url: string) {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
    track = url;
    audio.src = url;
    apply();
  }

  // 팬 API 는 맵 BGM 을 1분 넘게 붙잡다가 520 으로 끝내곤 한다. 오류가 난 audio 는 play() 를 계속 거절해서
  // 다시 받지 않으면 다른 맵으로 옮길 때까지 소리가 없다. 마을을 고정했으면 옮기지 않으니 계속 없다
  audio.addEventListener('error', () => {
    // 기다리는 사이 다른 맵으로 옮기면 load 가 이 타이머를 지운다
    if (track && retryTimer === null) retryTimer = setTimeout(() => load(track), BGM_RETRY_MS);
  });

  function setMap(mapId: number) {
    load(mapBgmUrl(mapId));
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
