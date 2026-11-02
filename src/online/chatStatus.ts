import type { OnlineStatus } from './session';

export type ChatStatus = OnlineStatus | 'unconfigured';
export type DotState = 'online' | 'connecting' | 'offline';

/** 💬 버튼 모서리 점. 입장 전(locked)과 설정 없음은 연결 안 됨과 같은 회색이다 */
export function dotState(status: ChatStatus): DotState {
  if (status === 'online') return 'online';
  return status === 'connecting' ? 'connecting' : 'offline';
}

/** 버튼의 aria-label·title 첫 줄 */
export function chatButtonLabel(status: ChatStatus): string {
  if (status === 'online') return '채팅 · 연결됨';
  if (status === 'connecting') return '채팅 · 연결 중';
  if (status === 'locked') return '채팅 · 입장하기';
  return '채팅 · 연결 안 됨';
}

export const ONLINE_NAMES_SHOWN = 4;
const UNKNOWN_NAME = '모험가';

/** 「접속 중 · 단풍이, 주황버섯」. 많으면 앞 몇 명만 두고 「외 N명」. 아무도 없으면 빈 문자열 */
export function onlineNamesLine(names: readonly string[], shown = ONLINE_NAMES_SHOWN): string {
  if (names.length === 0) return '';
  const list = names.slice(0, shown).map((name) => name || UNKNOWN_NAME);
  const rest = names.length - list.length;
  return `접속 중 · ${list.join(', ')}${rest > 0 ? ` 외 ${rest}명` : ''}`;
}
