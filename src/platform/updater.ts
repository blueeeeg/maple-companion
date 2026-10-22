import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { CHECK_POLL_MS, type CheckClock, isCheckDue, shouldNotifyUpdate } from '../game/updates';
import { isTauri } from './tauri';

/** 마지막으로 OS 알림을 띄운 새 버전 */
const NOTIFIED_KEY = 'maple-companion:update-notified';

export interface UpdateHandlers {
  /** 새 버전을 찾을 때마다 부른다. firstTime 은 이 버전을 처음 찾았는지(다시 켠 뒤에도 이어진다) */
  onFound(version: string, firstTime: boolean): void;
  /** 트레이 메뉴 「업데이트」를 눌러 받기 시작했을 때 */
  onStarted(version: string): void;
  onFailed(): void;
}

let notifiedInMemory: string | null = null;

function firstNoticeFor(version: string): boolean {
  let notified = notifiedInMemory;
  try {
    notified = localStorage.getItem(NOTIFIED_KEY) ?? notified;
  } catch {
    // 저장소가 막혀 있으면 이번 실행 동안만 기억한다
  }
  if (!shouldNotifyUpdate(notified, version)) return false;
  notifiedInMemory = version;
  try {
    localStorage.setItem(NOTIFIED_KEY, version);
  } catch {
    // 위와 같다
  }
  return true;
}

/** 확인·받기·설치는 Rust(updater.rs)가 하고 여기서는 언제 물을지와 알릴지만 정한다. 브라우저로 볼 때는 아무것도 안 한다 */
export function startUpdateChecks(handlers: UpdateHandlers): void {
  if (!isTauri) return;
  void listen<string>('update-started', (event) => handlers.onStarted(event.payload));
  void listen('update-failed', () => handlers.onFailed());

  const clock: CheckClock = { startedAt: Date.now(), lastCheckedAt: null, lastFailed: false };
  let checking = false;
  window.setInterval(() => {
    const now = Date.now();
    if (checking || !isCheckDue(clock, now)) return;
    checking = true;
    clock.lastCheckedAt = now;
    invoke<string | null>('check_update')
      .then((version) => {
        clock.lastFailed = false;
        if (version) handlers.onFound(version, firstNoticeFor(version));
      })
      .catch((error) => {
        clock.lastFailed = true;
        console.warn('[updater] 업데이트를 확인하지 못했다', error);
      })
      .finally(() => (checking = false));
  }, CHECK_POLL_MS);
}
