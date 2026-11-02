import { describe, expect, it } from 'vitest';
import { onlineConfig } from './config';

const jwt = (role: string) => `x.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.y`;
const URL_OK = 'https://abcdefgh.supabase.co';

describe('온라인 설정', () => {
  it('주소와 anon 키가 있으면 쓴다', () => {
    expect(onlineConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: jwt('anon') })).toEqual({
      url: URL_OK,
      anonKey: jwt('anon'),
    });
  });

  it('비었거나 자리표시자 그대로면 온라인을 숨긴다', () => {
    expect(onlineConfig({})).toBeNull();
    expect(onlineConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: '<REPLACE_WITH_SECRET_MANAGER>' })).toBeNull();
  });

  it('https 가 아니면 쓰지 않는다', () => {
    expect(onlineConfig({ VITE_SUPABASE_URL: 'http://abcdefgh.supabase.co', VITE_SUPABASE_ANON_KEY: jwt('anon') })).toBeNull();
  });

  it('service_role·secret 키는 번들에 넣어도 쓰지 않는다', () => {
    expect(onlineConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: jwt('service_role') })).toBeNull();
    expect(onlineConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: 'sb_secret_abc' })).toBeNull();
  });
});
