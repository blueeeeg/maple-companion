/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' 이면 온라인 특수판. `vite build --mode online` 도 이 값을 켠다(vite.config.ts) */
  readonly VITE_ONLINE?: string;
  /** 온라인 특수판의 Supabase 프로젝트 주소와 anon 키. .env.local 에 넣는다(.env.example) */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** 개발 서버 전용. '1' 이면 서버 없이 브라우저 탭끼리 가짜 연결로 잇는다 */
  readonly VITE_ONLINE_FAKE?: string;
}
