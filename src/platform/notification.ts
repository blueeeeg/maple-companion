import { listen } from '@tauri-apps/api/event';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { isTauri } from './tauri';

export interface Notifier {
  /** OS 알림을 띄운다. 권한이 아직 정해지지 않았으면 이때 묻고, 거절됐으면 아무것도 안 한다 */
  notify(title: string, body: string): void;
  /** 알림을 눌러 창이 열렸을 때. 창은 Rust 가 이미 띄워 둔다 */
  onOpen(handler: () => void): void;
}

function tauriNotifier(): Notifier {
  return {
    notify(title, body) {
      isPermissionGranted()
        .then(async (granted) => granted || (await requestPermission()) === 'granted')
        .then((granted) => {
          if (granted) sendNotification({ title, body });
        })
        .catch(() => {});
    },
    onOpen(handler) {
      void listen('notification-opened', () => handler());
    },
  };
}

/** 브라우저로 화면만 볼 때는 웹 Notification 으로 띄운다. 지원하지 않는 브라우저면 아무것도 안 한다 */
function browserNotifier(): Notifier {
  let openHandler = () => {};
  const show = (title: string, body: string) => {
    const notification = new Notification(title, { body });
    notification.onclick = () => {
      window.focus();
      notification.close();
      openHandler();
    };
  };
  return {
    notify(title, body) {
      if (!('Notification' in window) || Notification.permission === 'denied') return;
      if (Notification.permission === 'granted') {
        show(title, body);
        return;
      }
      Notification.requestPermission()
        .then((permission) => {
          if (permission === 'granted') show(title, body);
        })
        .catch(() => {});
    },
    onOpen(handler) {
      openHandler = handler;
    },
  };
}

export function createNotifier(): Notifier {
  return isTauri ? tauriNotifier() : browserNotifier();
}
