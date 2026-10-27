import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const isTauri = '__TAURI_INTERNALS__' in window;

export type DisplayMode = 'pet' | 'panel';

export interface DesktopBridge {
  onVisibilityChange(handler: (visible: boolean) => void): void;
  onModeChange(handler: (mode: DisplayMode) => void): void;
  initialMode(): Promise<DisplayMode>;
  /** 창 크기 배율(360x230 기준). 트레이 메뉴 「창 크기」에서 고른다. 1 이상은 맵을 넓게 보여 주고, 1 아래는 화면을 통째로 줄인다 */
  onScaleChange(handler: (scale: number) => void): void;
  initialScale(): Promise<number>;
  setTrayStatus(text: string): void;
  /** 트레이 메뉴 「설정」 */
  onOpenSettings(handler: () => void): void;
  /** 트레이 아이콘을 이 그림으로 바꾼다. Rust 가 받아 둔 것을 다음 실행부터 바로 쓰고, 못 받으면 지금 아이콘을 그대로 둔다 */
  refreshTrayIcon(url: string): void;
  /** 직접 조작 키를 받게 창에 키보드 포커스를 준다. 이미 있으면 그대로다 */
  focusWindow(): void;
}

const browserBridge: DesktopBridge = {
  onVisibilityChange: () => {},
  onModeChange: () => {},
  initialMode: async () => 'pet',
  onScaleChange: () => {},
  // 브라우저로 볼 때는 `?scale=1.5` 로 크기를 확인한다
  initialScale: async () => {
    const scale = Number(new URLSearchParams(location.search).get('scale'));
    return scale > 0 ? scale : 1;
  },
  setTrayStatus: () => {},
  onOpenSettings: () => {},
  refreshTrayIcon: () => {},
  focusWindow: () => window.focus(),
};

const tauriBridge: DesktopBridge = {
  onVisibilityChange(handler) {
    void listen<boolean>('panel-visibility', (event) => handler(event.payload));
  },
  onModeChange(handler) {
    void listen<DisplayMode>('mode-changed', (event) => handler(event.payload));
  },
  initialMode: () => invoke<DisplayMode>('display_mode'),
  onScaleChange(handler) {
    void listen<number>('scale-changed', (event) => handler(event.payload));
  },
  initialScale: () => invoke<number>('display_scale'),
  setTrayStatus(text) {
    void invoke('set_tray_status', { text });
  },
  onOpenSettings(handler) {
    void listen('open-settings', () => handler());
  },
  refreshTrayIcon(url) {
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${url}`);
        return response.arrayBuffer();
      })
      .then((buffer) => invoke('set_tray_icon', { png: Array.from(new Uint8Array(buffer)) }))
      .catch(() => {});
  },
  focusWindow() {
    if (document.hasFocus()) return;
    getCurrentWindow()
      .setFocus()
      .catch(() => {});
  },
};

export const desktop: DesktopBridge = isTauri ? tauriBridge : browserBridge;
