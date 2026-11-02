export interface OnlineConfig {
  url: string;
  anonKey: string;
}

export interface OnlineEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

/** JWT 키의 role. JWT 가 아니면 null */
function jwtRole(key: string): string | null {
  const [, payload] = key.split('.');
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const role: unknown = JSON.parse(json).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

/**
 * 빌드할 때 넣은 Supabase 주소와 anon(publishable) 키. 비었거나 자리표시자 그대로면 null 이고 온라인 기능을 숨긴다.
 * 앱 번들에 그대로 들어가는 값이라 service_role·secret 키가 들어오면 쓰지 않는다
 */
export function onlineConfig(env: OnlineEnv): OnlineConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim() ?? '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
  if (!url || !anonKey || url.includes('<') || anonKey.includes('<')) return null;
  try {
    if (new URL(url).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  if (anonKey.startsWith('sb_secret_') || jwtRole(anonKey) === 'service_role') {
    console.error('[online] VITE_SUPABASE_ANON_KEY 에 service_role·secret 키가 들어 있어 온라인 기능을 끈다. anon 키를 넣어 주세요');
    return null;
  }
  return { url, anonKey };
}
