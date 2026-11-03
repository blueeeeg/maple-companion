import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { isTauri } from './tauri';

export interface Notifier {
  /** OS 알림을 띄운다. 권한이 아직 정해지지 않았으면 이때 묻고, 거절됐으면 아무것도 안 한다. tag 는 누른 알림을 가르는 데 쓴다 */
  notify(title: string, body: string, tag?: string): void;
  /** 알림을 눌러 창이 열렸을 때. 창은 Rust 가 이미 띄워 둔다 */
  onOpen(handler: (tag: string) => void): void;
}

function tauriNotifier(): Notifier {
  // Rust 는 어느 알림을 눌렀는지 넘기지 않는다. 대개 마지막 알림을 누르니 그 tag 로 본다
  let lastTag = '';
  return {
    notify(title, body, tag = '') {
      lastTag = tag;
      isPermissionGranted()
        .then(async (granted) => granted || (await requestPermission()) === 'granted')
        .then((granted) => {
          // macOS 는 Rust 가 알림 오른쪽에 앱 아이콘 그림을 넣어 보낸다. 못 보내면 그림 없는 플러그인 알림
          if (granted) return invoke('show_notification', { title, body }).catch(() => sendNotification({ title, body }));
        })
        .catch(() => {});
    },
    onOpen(handler) {
      void listen('notification-opened', () => handler(lastTag));
    },
  };
}

/** 브라우저로 화면만 볼 때는 웹 Notification 으로 띄운다. 지원하지 않는 브라우저면 아무것도 안 한다 */
function browserNotifier(): Notifier {
  const openHandlers: ((tag: string) => void)[] = [];
  const show = (title: string, body: string, tag: string) => {
    const notification = new Notification(title, { body });
    notification.onclick = () => {
      window.focus();
      notification.close();
      openHandlers.forEach((handler) => handler(tag));
    };
  };
  return {
    notify(title, body, tag = '') {
      if (!('Notification' in window) || Notification.permission === 'denied') return;
      if (Notification.permission === 'granted') {
        show(title, body, tag);
        return;
      }
      Notification.requestPermission()
        .then((permission) => {
          if (permission === 'granted') show(title, body, tag);
        })
        .catch(() => {});
    },
    onOpen(handler) {
      openHandlers.push(handler);
    },
  };
}

export function createNotifier(): Notifier {
  return isTauri ? tauriNotifier() : browserNotifier();
}
