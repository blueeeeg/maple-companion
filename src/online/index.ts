// 온라인 특수판에서만 받는 모듈. src/onlineGate.ts 가 VITE_ONLINE=1 일 때만 import 한다
import './online.css';
import type { Scene } from '../scene/scene';
import type { BossExtraAction } from '../ui/bossWindow';
import type { Hud } from '../ui/hud';
import { createChatOverlay } from './chatOverlay';
import { onlineConfig } from './config';
import { type CoopHost, createCoop } from './coopSession';
import { createCoopView } from './coopView';
import { createPasswordPrompt } from './passwordPrompt';
import { MOVE_INTERVAL_MS } from './presence';
import { type OnlineHost, type OnlineStatus, createOnlineSession } from './session';
import { createStatusIndicator } from './statusIndicator';
import { createSupabaseTransport } from './supabaseTransport';
import type { OnlineTransport } from './transport';

export interface OnlineAppHost extends OnlineHost {
  root: HTMLElement;
  hud: Pick<Hud, 'addMenuItem' | 'addIndicator' | 'notify'>;
  scene: OnlineHost['scene'] & Pick<Scene, 'setBossHp' | 'showBossDamage' | 'endCoop'>;
  /** 펫 창은 눌러도 키보드 포커스가 안 올 때가 있다 */
  focusWindow(): void;
  /** 채팅 입력창이 열려 있는 동안 직접 조작 키를 막는다 */
  setTyping(open: boolean): void;
  coop: Omit<CoopHost, 'notify' | 'scene'>;
  /** 보스 도전 창 「지금 도전」 옆 버튼. null 이면 뺀다 */
  setBossAction(action: BossExtraAction | null): void;
}

/** 창이 안 보이는 동안은 위치를 보내지 않고 이 간격으로만 다시 본다 */
const INACTIVE_POLL_MS = 1000;
const COOP_TICK_MS = 100;
const HINT_KEY = 'maple-companion:online-chat-hint';
const CHAT_HINT = '엔터 또는 💬 로 채팅';

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

/** 처음 방에 들어온 한 번만 true */
function firstJoin(): boolean {
  try {
    if (localStorage.getItem(HINT_KEY)) return false;
    localStorage.setItem(HINT_KEY, '1');
    return true;
  } catch {
    return false;
  }
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
  const chat = createChatOverlay(host.root, {
    onSend: (text) => session.send(text),
    onFirstOpen: () => session.recent(),
    canOpen: () => host.isActive() && session.status === 'online',
    onTyping: host.setTyping,
  });
  const coop = createCoop(
    transport,
    { ...host.coop, notify: host.hud.notify, scene: host.scene },
    createCoopView(host.root, {
      onJoin: (id) => coop.join(id),
      onStartNow: () => coop.startNow(),
      onCancel: () => coop.cancel(),
    }),
  );
  const bossAction: BossExtraAction = {
    label: '같이 도전',
    title: '방에 있는 같은 시대 친구에게 30초 동안 초대를 보내고 같이 싸워요. 보상은 혼자 잡을 때와 같아요',
    idleTitle: '보스 차례가 와야 같이 도전할 수 있어요',
    run: (bossId) => coop.invite(bossId),
  };
  let joined = false;
  let wasOnline = false;
  const onStatus = (status: OnlineStatus) => {
    const online = status === 'online';
    coop.setUser(online ? session.userId : null);
    if (online === wasOnline) return;
    wasOnline = online;
    host.setBossAction(online ? bossAction : null);
    if (online && !joined) {
      joined = true;
      if (firstJoin()) chat.hint(CHAT_HINT);
    }
  };
  const session = createOnlineSession(transport, host, {
    status: (status, count) => {
      indicator.set(status, count);
      onStatus(status);
    },
    message: (message, mine) => chat.add(message, mine),
    pending: (message) => chat.pending(message),
    failed: (clientId, reason) => chat.fail(clientId, reason),
    askPassword: (failed) => prompt.ask(failed),
  });
  const openChat = () => {
    if (session.status === 'locked') void session.unlock();
    else if (chat.isOpen) chat.close();
    else chat.open();
  };
  onIndicator = openChat;
  host.hud.addMenuItem('💬 채팅', openChat);

  const chatButton = document.createElement('button');
  chatButton.type = 'button';
  chatButton.className = 'online-chat-button';
  chatButton.textContent = '💬';
  chatButton.title = '채팅 (Enter)';
  chatButton.setAttribute('aria-label', '채팅');
  // 입력창이 열려 있을 때 눌러도 입력칸 포커스를 뺏지 않아야 닫기로 동작한다
  chatButton.addEventListener('mousedown', (event) => event.preventDefault());
  chatButton.addEventListener('click', () => {
    host.focusWindow();
    openChat();
  });
  host.hud.addIndicator(chatButton);

  const poll = () => {
    session.tick();
    window.setTimeout(poll, host.isActive() ? MOVE_INTERVAL_MS : INACTIVE_POLL_MS);
  };
  poll();
  window.setInterval(() => coop.tick(), COOP_TICK_MS);
  await session.connect();
}
