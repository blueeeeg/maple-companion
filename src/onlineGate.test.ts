import { afterEach, describe, expect, it, vi } from 'vitest';

const evaluated = vi.hoisted(() => ({ count: 0 }));

// 온라인 모듈이 실제로 읽혔는지만 센다. 진짜 모듈은 Supabase·CSS 를 끌어온다
vi.mock('./online/index', () => {
  evaluated.count += 1;
  return { startOnline: vi.fn() };
});

afterEach(() => {
  vi.unstubAllEnvs();
  evaluated.count = 0;
});

describe('온라인 특수판 빌드 플래그', () => {
  it('플래그가 없으면 온라인 모듈을 읽지 않는다', async () => {
    vi.stubEnv('VITE_ONLINE', '');
    const { loadOnline } = await import('./onlineGate');
    expect(await loadOnline()).toBeNull();
    expect(evaluated.count).toBe(0);
  });

  it('1 이 아니면 켜지 않는다', async () => {
    vi.stubEnv('VITE_ONLINE', 'true');
    const { loadOnline } = await import('./onlineGate');
    expect(await loadOnline()).toBeNull();
    expect(evaluated.count).toBe(0);
  });

  it('VITE_ONLINE=1 이면 읽는다', async () => {
    vi.stubEnv('VITE_ONLINE', '1');
    const { loadOnline } = await import('./onlineGate');
    const online = await loadOnline();
    expect(online?.startOnline).toBeTypeOf('function');
    expect(evaluated.count).toBe(1);
  });
});
