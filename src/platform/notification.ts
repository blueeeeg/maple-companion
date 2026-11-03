import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { isTauri } from './tauri';

/** Rust notification_permission.rs 의 AuthStatus. unknown 은 번들 밖 개발 실행·읽기 실패 */
export type NotificationAuth = 'notDetermined' | 'denied' | 'authorized' | 'provisional' | 'ephemeral' | 'unknown';

export interface NotificationState {
  status: NotificationAuth;
  /** 배너로 화면에 뜨는지. 모르면 null */
  alerts: boolean | null;
}

/** 'off' 면 「알림이 꺼져 있어요」와 설정 여는 버튼, 'unknown' 이면 버튼만 둔다 */
export type NotificationNotice = 'ok' | 'off' | 'unknown';

/** 묻기에 실패했으면(requestFailed) 아직 안 정한 상태로 남아도 알림이 뜰지 모르는 것으로 본다 */
export function noticeFor(state: NotificationState, requestFailed: boolean): NotificationNotice {
  if (state.status === 'denied') return 'off';
  if (state.status === 'unknown') return 'unknown';
  if (state.status === 'notDetermined') return requestFailed ? 'unknown' : 'ok';
  return state.alerts === false ? 'off' : 'ok';
}

export const TEST_NOTICE = { title: '알림 테스트', body: '알림이 이렇게 떠요' };

export interface Notifier {
  /** OS 알림을 띄운다. 권한을 아직 안 정했으면 먼저 묻는다. tag 는 누른 알림을 가르는 데 쓴다 */
  notify(title: string, body: string, tag?: string): void;
  /** 권한을 아직 안 정했으면 이때 묻는다(macOS 시스템 창). 이미 정했으면 아무것도 안 한다. 실행마다 한 번만 묻는다 */
  prepare(): Promise<void>;
  /** 지금 알림 상태로 띄울 안내 */
  notice(): Promise<NotificationNotice>;
  /** OS 의 이 앱 알림 설정 화면을 연다 */
  openSettings(): void;
  /** 알림을 눌러 창이 열렸을 때. 창은 Rust 가 이미 띄워 둔다 */
  onOpen(handler: (tag: string) => void): void;
}

function tauriNotifier(): Notifier {
  // Rust 는 어느 알림을 눌렀는지 넘기지 않는다. 대개 마지막 알림을 누르니 그 tag 로 본다
  let lastTag = '';
  let asking: Promise<void> | null = null;
  let requestFailed = false;
  const status = () => invoke<NotificationState>('notification_status');

  const prepare = () => {
    asking ??= status()
      .then(async (state) => {
        if (state.status !== 'notDetermined') return;
        const result = await invoke<{ granted: boolean; error: string | null }>('request_notification_permission');
        if (!result.error) return;
        // 임시 폴더에서 띄운 번들 등은 묻지 못한다. 그래도 보내기는 해 보고 안내는 「모름」으로 둔다
        requestFailed = true;
        console.warn('[notification] 알림 권한을 묻지 못했다', result.error);
      })
      .catch(() => {});
    return asking;
  };

  return {
    notify(title, body, tag = '') {
      lastTag = tag;
      void prepare().then(() =>
        // macOS 는 Rust 가 알림 오른쪽에 앱 아이콘 그림을 넣어 보낸다. 못 보내면 그림 없는 플러그인 알림
        invoke('show_notification', { title, body }).catch(() => sendNotification({ title, body })),
      );
    },
    prepare,
    notice: () =>
      status()
        .then((state) => noticeFor(state, requestFailed))
        .catch(() => 'unknown' as const),
    openSettings() {
      void invoke('open_notification_settings').catch(() => {});
    },
    onOpen(handler) {
      void listen('notification-opened', () => handler(lastTag));
    },
  };
}

/** 브라우저로 화면만 볼 때는 웹 Notification 으로 띄운다. 지원하지 않는 브라우저면 아무것도 안 한다 */
function browserNotifier(): Notifier {
  const openHandlers: ((tag: string) => void)[] = [];
  const supported = () => 'Notification' in window;
  const show = (title: string, body: string, tag: string) => {
    const notification = new Notification(title, { body });
    notification.onclick = () => {
      window.focus();
      notification.close();
      openHandlers.forEach((handler) => handler(tag));
    };
  };
  const prepare = async () => {
    if (!supported() || Notification.permission !== 'default') return;
    await Notification.requestPermission().catch(() => {});
  };
  return {
    notify(title, body, tag = '') {
      if (!supported()) return;
      void prepare().then(() => {
        if (Notification.permission === 'granted') show(title, body, tag);
      });
    },
    prepare,
    async notice() {
      if (!supported()) return 'unknown';
      return Notification.permission === 'denied' ? 'off' : 'ok';
    },
    openSettings() {},
    onOpen(handler) {
      openHandlers.push(handler);
    },
  };
}

export function createNotifier(): Notifier {
  return isTauri ? tauriNotifier() : browserNotifier();
}
