import type { startOnline } from './online/index';

/**
 * 온라인 특수판(VITE_ONLINE=1)에서만 온라인 모듈을 받는다. 조건이 빌드 때 상수로 정해져서
 * 보통 빌드에서는 아래 import 가 통째로 빠지고 Supabase 코드도 번들에 들어가지 않는다
 */
export async function loadOnline(): Promise<{ startOnline: typeof startOnline } | null> {
  if (import.meta.env.VITE_ONLINE !== '1') return null;
  return import('./online/index');
}

/** 화면 배치만 가를 때 쓴다. 온라인 모듈을 읽을지는 위 loadOnline 의 조건이 정한다 */
export function isOnlineEdition(): boolean {
  return import.meta.env.VITE_ONLINE === '1';
}
