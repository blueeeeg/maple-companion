// 창 안(HUD 「—」·⚙️ 메뉴·⌘W)에서 창을 숨긴다. 숨기는 일은 트레이 「캐릭터 숨기기」와 같은 Rust 경로가 한다

export const IS_MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);
export const HIDE_SHORTCUT_LABEL = IS_MAC ? '⌘W' : 'Ctrl+W';

/** 처음 숨길 때 안내를 띄워 두는 시간. 창이 사라지면 안내도 같이 사라져서 숨기기 전에 읽을 틈을 둔다 */
export const HIDE_HINT_MS = 2500;
const HINT_KEY = 'maple-companion:window-hide-hint-seen';

export function hideHint(mac: boolean): string {
  return mac ? '메뉴바의 버섯 아이콘을 누르면 다시 보여요' : '작업 표시줄 오른쪽 아이콘을 누르면 다시 보여요';
}

export type ShortcutKey = Pick<KeyboardEvent, 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>;

/**
 * 'hide' 는 숨긴다. 'swallow' 는 글을 쓰는 중이라 숨기지 않고 키만 막는다. macOS 기본 메뉴의 「윈도우 닫기」(⌘W)가
 * 대신 창을 닫지 않게 하려는 것이다. 한글 입력 중에도 같은 자리 키로 읽게 code 로 본다
 */
export function hideKeyAction(event: ShortcutKey, options: { mac: boolean; typing: boolean }): 'hide' | 'swallow' | null {
  if (event.code !== 'KeyW' || event.altKey || event.shiftKey) return null;
  const pressed = options.mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!pressed) return null;
  return options.typing ? 'swallow' : 'hide';
}

/** 처음 한 번만 true. 기기마다 한 번이면 되는 안내라 저장 파일에 넣지 않는다. 저장소가 막혔으면 이번 실행 동안만 기억한다 */
export function createHintOnce(storage: () => Pick<Storage, 'getItem' | 'setItem'>): () => boolean {
  let shown = false;
  return () => {
    if (shown) return false;
    shown = true;
    try {
      const store = storage();
      if (store.getItem(HINT_KEY) !== null) return false;
      store.setItem(HINT_KEY, '1');
    } catch {
      // 이번 실행 동안만 다시 띄우지 않는다
    }
    return true;
  };
}

export interface WindowHide {
  /** 처음이면 안내를 띄우고 잠시 뒤에, 아니면 바로 숨긴다. 안내를 띄운 동안 또 누르면 바로 숨긴다 */
  request(): void;
}

export function createWindowHide(root: HTMLElement, hide: () => void, isTyping: (target: EventTarget | null) => boolean): WindowHide {
  root.insertAdjacentHTML('beforeend', '<div class="window-hide-hint" role="status" hidden></div>');
  const hint = root.querySelector<HTMLElement>('.window-hide-hint')!;
  const firstHint = createHintOnce(() => localStorage);
  let timer: number | null = null;

  const hideNow = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    hint.hidden = true;
    hide();
  };

  const request = () => {
    if (timer !== null || !firstHint()) {
      hideNow();
      return;
    }
    hint.textContent = hideHint(IS_MAC);
    hint.hidden = false;
    timer = window.setTimeout(hideNow, HIDE_HINT_MS);
  };

  // 채팅 입력칸은 키가 바깥으로 새지 않게 막아 두어서 캡처 단계에서 본다
  window.addEventListener(
    'keydown',
    (event) => {
      const action = hideKeyAction(event, { mac: IS_MAC, typing: isTyping(event.target) });
      if (!action) return;
      event.preventDefault();
      if (action === 'hide') request();
    },
    true,
  );

  return { request };
}
