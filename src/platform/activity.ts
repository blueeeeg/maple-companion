import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './tauri';

/** Rust 쪽 `activity::DEFAULT_IDLE_LIMIT_SECONDS` 와 같은 값. 설정 화면에서 바꾼다 */
export const DEFAULT_IDLE_LIMIT_SECONDS = 120;
const MAX_SAMPLE_SECONDS = 30;
const BROWSER_STORAGE_KEY = 'maple-companion:browser-active-seconds';

export interface ActivitySnapshot {
  activeSeconds: number;
  idleSeconds: number;
  /** 입력 없이 이만큼 지나면 활동 시간이 멈춘다. idleSeconds 가 이 값 이상이면 쉬는 중이다 */
  idleLimitSeconds: number;
}

export interface ActivitySource {
  snapshot(): Promise<ActivitySnapshot>;
  /** 자리 비움 판정 시간. Tauri 에서는 Rust 가 저장해 앱을 다시 켜도, 프론트가 뜨기 전에도 이 값으로 잰다 */
  setIdleLimit(seconds: number): void;
}

function tauriSource(): ActivitySource {
  return {
    snapshot: () => invoke<ActivitySnapshot>('activity_snapshot'),
    setIdleLimit(seconds) {
      void invoke('set_idle_limit', { seconds }).catch(() => {});
    },
  };
}

/**
 * 브라우저로 화면만 띄워 개발할 때 쓰는 대체 구현. 이 페이지 안의 입력만 활동으로 센다.
 * `?speed=60` 을 붙이면 60배속으로 쌓인다.
 */
function browserSource(): ActivitySource {
  const speed = Number(new URLSearchParams(location.search).get('speed')) || 1;
  let idleLimitSeconds = DEFAULT_IDLE_LIMIT_SECONDS;
  let lastInputAt = Date.now();
  let lastSampleAt = Date.now();
  let activeSeconds = 0;
  try {
    activeSeconds = Number(localStorage.getItem(BROWSER_STORAGE_KEY)) || 0;
  } catch {
    // 저장소가 막혀 있으면 0부터 센다
  }

  ['pointermove', 'pointerdown', 'keydown', 'wheel'].forEach((type) =>
    window.addEventListener(type, () => (lastInputAt = Date.now()), { passive: true }),
  );

  return {
    async snapshot() {
      const now = Date.now();
      const idleSeconds = (now - lastInputAt) / 1000;
      const elapsed = Math.min((now - lastSampleAt) / 1000, MAX_SAMPLE_SECONDS);
      lastSampleAt = now;
      if (idleSeconds < idleLimitSeconds) activeSeconds += elapsed * speed;
      try {
        localStorage.setItem(BROWSER_STORAGE_KEY, String(activeSeconds));
      } catch {
        // 저장 실패는 다음 샘플에서 다시 시도한다
      }
      return { activeSeconds, idleSeconds, idleLimitSeconds };
    },
    setIdleLimit(seconds) {
      idleLimitSeconds = seconds;
    },
  };
}

export function createActivitySource(): ActivitySource {
  return isTauri ? tauriSource() : browserSource();
}
