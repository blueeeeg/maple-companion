import type { OnlineStatus } from './session';

export type IndicatorStatus = OnlineStatus | 'unconfigured';

/** HUD 의 점 + 글자. 방에 들어가 있으면 접속한 사람 수, 아니면 지금 상태 */
export function statusLabel(status: IndicatorStatus, count: number): string {
  if (status === 'online') return `접속 ${count}명`;
  if (status === 'connecting') return '연결 중';
  if (status === 'locked') return '입장하기';
  return '연결 안 됨';
}

export function createStatusIndicator(onClick: () => void): { element: HTMLButtonElement; set(status: IndicatorStatus, count: number): void } {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'online-status';
  element.innerHTML = '<span class="online-dot" aria-hidden="true"></span><span class="online-count"></span>';
  const label = element.querySelector<HTMLElement>('.online-count')!;
  element.addEventListener('click', onClick);
  return {
    element,
    set(status, count) {
      element.dataset.status = status;
      label.textContent = statusLabel(status, count);
      element.title = status === 'online' ? '채팅 열기' : status === 'locked' ? '방 비밀번호 넣기' : statusLabel(status, count);
    },
  };
}
