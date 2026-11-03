// 온라인 특수판에서만 받는 모듈. src/onlineGate.ts 가 VITE_ONLINE=1 일 때만 import 한다
import './online.css';
import type { AlertView } from '../game/alerts';
import type { NotificationNotice } from '../platform/notification';
import type { ChatAlerts, Settings } from '../game/settings';
import type { Scene } from '../scene/scene';
import type { BossExtraAction } from '../ui/bossWindow';
import type { Hud } from '../ui/hud';
import type { Choice, SettingsRowKit } from '../ui/settings';
import { createChatAlerts, isReading, unreadBadge } from './chatAlerts';
import { createChatOverlay } from './chatOverlay';
import { type ChatStatus, chatButtonLabel, dotState, onlineNamesLine } from './chatStatus';
import { onlineConfig } from './config';
import { type CoopHost, createCoop } from './coopSession';
import { createCoopView } from './coopView';
import { createPasswordPrompt } from './passwordPrompt';
import { MOVE_INTERVAL_MS } from './presence';
import { type OnlineHost, type OnlineStatus, createOnlineSession } from './session';
import { createSupabaseTransport } from './supabaseTransport';
import type { OnlineTransport } from './transport';

export interface OnlineAppHost extends OnlineHost {
  root: HTMLElement;
  hud: Pick<Hud, 'addMenuItem' | 'addIndicator' | 'notify'>;
  scene: OnlineHost['scene'] & Pick<Scene, 'setBossHp' | 'showBossDamage' | 'endCoop'>;
  /** 펫 창은 눌러도 키보드 포커스가 안 올 때가 있다 */
  focusWindow(): void;
  /** 전직 알림과 같은 기준의 창 상태 */
  alertView(): AlertView;
  settings(): Settings;
  addSettingsRows(build: (kit: SettingsRowKit) => void): void;
  /** 전직 알림과 같은 OS 알림. 누르면 onNotificationOpen 이 불린다 */
  osNotify(title: string, body: string): void;
  onNotificationOpen(handler: () => void): void;
  /** 전직 알림과 같은 알림의 권한·상태 */
  notifications: {
    prepare(): Promise<void>;
    notice(): Promise<NotificationNotice>;
    openSettings(): void;
    /** 알림 하나를 바로 보낸다 */
    test(): void;
  };
  /** 트레이 글자 뒤에 붙인다. 빈 문자열이면 뗀다 */
  setTrayBadge(badge: string): void;
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
const CHAT_ALERT_CHOICES: Choice<ChatAlerts>[] = [
  { value: 'all', label: '모두' },
  { value: 'mentions', label: '이름 불렀을 때만' },
  { value: 'off', label: '끄기' },
];
const CHAT_ALERT_HINTS: Record<ChatAlerts, string> = {
  all: '다른 앱을 보거나 창이 숨었을 때 OS 알림 · 첫 글은 바로, 그 뒤 30초 안의 글은 묶어서 · 내 이름(@이름)은 늘 바로',
  mentions: '내 캐릭터 이름(@이름)이 나온 글만 바로 알려요 · 창을 보고 있으면 알리지 않아요',
  off: '채팅 OS 알림을 띄우지 않아요 · 안 읽은 수는 트레이 글자에 남아요',
};
const FRIEND_ALERT_HINT = '친구 접속: 다른 앱을 보는 동안 방에 누가 들어오면 OS 알림으로 알려요';

const NOTICE_OFF_TEXT = '알림이 꺼져 있어요';
const NOTICE_HINT: Record<NotificationNotice, string> = {
  ok: '테스트: OS 알림 하나를 바로 보내요',
  off: 'OS 설정에서 이 앱 알림이 꺼져 있어요. 「알림 설정 열기」로 켜요',
  unknown: '알림이 안 뜨면 「알림 설정 열기」에서 이 앱 알림을 켜요',
};

/**
 * 설정 창 높이에 줄이 더 안 들어가서 친구 접속 알림은 채팅 알림 줄에 붙인다.
 * 알림 상태 안내와 테스트·설정 열기 버튼은 그 아래 이름 칸 없는 줄에 둔다
 */
function addAlertRow(kit: SettingsRowKit, notifications: OnlineAppHost['notifications']): void {
  const { row, segments, checkbox, button, onRender, current, edit } = kit;
  let notice: NotificationNotice = 'ok';
  const control = row('채팅 알림', () => `${CHAT_ALERT_HINTS[current().chatAlerts]} · ${FRIEND_ALERT_HINT}`);
  control.closest('.settings-rows')?.classList.add('has-online-row');
  segments(control, CHAT_ALERT_CHOICES, () => current().chatAlerts, (chatAlerts) => edit({ chatAlerts }));
  checkbox(control, '친구 접속', () => current().friendAlerts, (friendAlerts) => edit({ friendAlerts }));

  const state = row('', () => NOTICE_HINT[notice]);
  state.closest('.settings-row')?.classList.add('online-alert-row');
  const offText = document.createElement('span');
  offText.className = 'online-alert-off';
  offText.textContent = NOTICE_OFF_TEXT;
  state.append(offText);
  const open = button(state, '알림 설정 열기', notifications.openSettings);
  button(state, '테스트', notifications.test);
  const show = (next: NotificationNotice) => {
    notice = next;
    offText.hidden = next !== 'off';
    open.hidden = next === 'ok';
  };
  show('ok');
  onRender(() => void notifications.notice().then(show));
}

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
  // 상태 글자 대신 💬 버튼 모서리 점으로 보인다. 입장 전에는 이 버튼이 비밀번호 창을 연다
  const chatButton = document.createElement('button');
  chatButton.type = 'button';
  chatButton.className = 'online-chat-button';
  chatButton.innerHTML = '💬<span class="online-chat-dot" aria-hidden="true"></span>';
  let names: string[] = [];
  const showStatus = (status: ChatStatus) => {
    const label = chatButtonLabel(status);
    const who = status === 'online' ? onlineNamesLine(names) : '';
    chatButton.dataset.dot = dotState(status);
    chatButton.title = who ? `${label}\n${who}` : status === 'online' ? `${label} (Enter)` : label;
    chatButton.setAttribute('aria-label', label);
  };
  showStatus(transport ? 'connecting' : 'unconfigured');
  host.hud.addIndicator(chatButton);
  host.addSettingsRows((kit) => addAlertRow(kit, host.notifications));
  if (!transport) {
    console.warn('[online] VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY 가 없어 온라인 기능을 숨긴다');
    return;
  }

  const prompt = createPasswordPrompt(host.root);
  const chat = createChatOverlay(host.root, {
    onSend: (text) => session.send(text),
    onFirstOpen: () => session.recent(),
    canOpen: () => host.isActive() && session.status === 'online',
    onTyping(open) {
      host.setTyping(open);
      if (!open) return;
      alerts.seen();
      refreshChatNotice();
    },
    onOpenAlertSettings: host.notifications.openSettings,
  });
  const refreshChatNotice = () => void host.notifications.notice().then((notice) => chat.setAlertsOff(notice === 'off'));
  const alertView = () => ({ ...host.alertView(), feedVisible: host.isActive() || chat.isOpen });
  const alerts = createChatAlerts({
    notify: host.osNotify,
    view: alertView,
    settings: host.settings,
    selfName: () => host.self()?.name ?? null,
    onUnread: (count) => host.setTrayBadge(unreadBadge(count)),
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
      // 방에 처음 들어온 때가 채팅 알림이 처음 필요해지는 때다. 아직 안 정했으면 macOS 가 이때 묻는다
      void host.notifications.prepare().then(() => {
        if (chat.isOpen) refreshChatNotice();
      });
      if (firstJoin()) chat.hint(CHAT_HINT);
    }
  };
  const session = createOnlineSession(transport, host, {
    status: (status) => {
      showStatus(status);
      onStatus(status);
    },
    members: (list) => {
      names = list;
      chat.setWho(onlineNamesLine(list));
      showStatus(session.status);
    },
    notice: (text) => chat.notice(text),
    message(message, mine) {
      chat.add(message, mine);
      alerts.message(message, mine);
    },
    joined: (name) => alerts.joined(name),
    pending: (message) => chat.pending(message),
    failed: (clientId, reason) => chat.fail(clientId, reason),
    askPassword: (failed) => prompt.ask(failed),
  });
  const openChat = () => {
    if (session.status === 'locked') void session.unlock();
    else if (chat.isOpen) chat.close();
    else chat.open();
  };
  host.hud.addMenuItem('💬 채팅', openChat);

  // 입력창이 열려 있을 때 눌러도 입력칸 포커스를 뺏지 않아야 닫기로 동작한다
  chatButton.addEventListener('mousedown', (event) => event.preventDefault());
  chatButton.addEventListener('click', () => {
    host.focusWindow();
    openChat();
  });
  // 알림을 눌렀으면 창은 이미 떠 있다. 💬 버튼과 달리 열려 있어도 닫지 않는다
  host.onNotificationOpen(() => {
    host.focusWindow();
    if (session.status === 'online') chat.open();
  });
  window.addEventListener('focus', () => alerts.seen());

  const poll = () => {
    session.tick();
    // 설정 창 등을 닫고 맵으로 돌아온 것처럼 포커스 이벤트 없이 채팅 줄이 보이게 된 때
    if (alerts.unread > 0 && isReading(alertView())) alerts.seen();
    window.setTimeout(poll, host.isActive() ? MOVE_INTERVAL_MS : INACTIVE_POLL_MS);
  };
  poll();
  window.setInterval(() => coop.tick(), COOP_TICK_MS);
  await session.connect();
}
