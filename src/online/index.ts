// 온라인 특수판에서만 받는 모듈. src/onlineGate.ts 가 VITE_ONLINE=1 일 때만 import 한다
import './online.css';
import type { Hud } from '../ui/hud';
import { createChatWindow } from './chatWindow';
import { onlineConfig } from './config';
import { createPasswordPrompt } from './passwordPrompt';
import { MOVE_INTERVAL_MS } from './presence';
import { type OnlineHost, createOnlineSession } from './session';
import { createStatusIndicator } from './statusIndicator';
import { createSupabaseTransport } from './supabaseTransport';
import type { OnlineTransport } from './transport';

export interface OnlineAppHost extends OnlineHost {
  root: HTMLElement;
  hud: Pick<Hud, 'addMenuItem' | 'addIndicator'>;
}

/** 창이 안 보이는 동안은 위치를 보내지 않고 이 간격으로만 다시 본다 */
const INACTIVE_POLL_MS = 1000;

async function pickTransport(): Promise<OnlineTransport | null> {
  // 개발 서버에서 서버 없이 두 창을 잇는다. 배포 빌드에는 들어가지 않는다
  if (import.meta.env.DEV && import.meta.env.VITE_ONLINE_FAKE === '1') {
    const { browserBus, createBusTransport } = await import('./fakeTransport');
    return createBusTransport(browserBus(), { password: 'maple', latencyMs: Number(import.meta.env.VITE_ONLINE_FAKE_LATENCY) || 0 });
  }
  // 필요한 두 값만 넘겨 다른 VITE_ 값이 번들에 같이 박히지 않게 한다
  const config = onlineConfig({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  });
  return config ? createSupabaseTransport(config) : null;
}

export async function startOnline(host: OnlineAppHost): Promise<void> {
  const transport = await pickTransport();
  let onIndicator = () => {};
  const indicator = createStatusIndicator(() => onIndicator());
  host.hud.addIndicator(indicator.element);
  if (!transport) {
    console.warn('[online] VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY 가 없어 온라인 기능을 숨긴다');
    indicator.set('unconfigured', 0);
    return;
  }

  const prompt = createPasswordPrompt(host.root);
  const chat = createChatWindow(host.root, {
    onSend: (text) => session.send(text),
    onFirstOpen: () => session.recent(),
  });
  const session = createOnlineSession(transport, host, {
    status: (status, count) => indicator.set(status, count),
    message: (message, mine) => chat.add(message, mine),
    pending: (message) => chat.pending(message),
    failed: (clientId, reason) => chat.fail(clientId, reason),
    askPassword: (failed) => prompt.ask(failed),
  });
  onIndicator = () => (session.status === 'locked' ? void session.unlock() : chat.toggle());
  host.hud.addMenuItem('💬 채팅', () => (session.status === 'locked' ? void session.unlock() : chat.toggle()));

  const poll = () => {
    session.tick();
    window.setTimeout(poll, host.isActive() ? MOVE_INTERVAL_MS : INACTIVE_POLL_MS);
  };
  poll();
  await session.connect();
}
