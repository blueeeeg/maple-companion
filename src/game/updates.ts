/** 켜자마자 묻지 않는다. 처음 화면을 띄우는 동안 맵·캐릭터를 받는 것과 겹치지 않게 한다 */
export const FIRST_CHECK_DELAY_MS = 30 * 1000;
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
/** 네트워크가 끊겼던 것이면 6시간을 다 기다리지 않는다 */
export const RETRY_AFTER_FAILURE_MS = 30 * 60 * 1000;
/** 이 간격으로 때가 됐는지 본다. 잠자기에서 깨어나도 벽시계로 재서 오래 밀리지 않는다 */
export const CHECK_POLL_MS = 30 * 1000;

export interface CheckClock {
  startedAt: number;
  /** 마지막으로 물어본 때. 아직 안 물었으면 null */
  lastCheckedAt: number | null;
  lastFailed: boolean;
}

export function isCheckDue(clock: CheckClock, now: number): boolean {
  if (clock.lastCheckedAt === null) return now - clock.startedAt >= FIRST_CHECK_DELAY_MS;
  return now - clock.lastCheckedAt >= (clock.lastFailed ? RETRY_AFTER_FAILURE_MS : CHECK_EVERY_MS);
}

/** 버전마다 한 번만 알린다. 앱을 다시 켜도 같은 버전은 다시 알리지 않는다 */
export function shouldNotifyUpdate(notifiedVersion: string | null, version: string): boolean {
  return version !== notifiedVersion;
}

export function updateNotice(version: string): { title: string; body: string } {
  const label = `v${version.replace(/^v/, '')}`;
  return {
    title: `새 버전 ${label} 가 나왔어요`,
    body: `트레이 메뉴 「업데이트 (${label})」를 누르면 받아서 다시 켜요`,
  };
}
