// 직접 조작 키. 창에 포커스가 있을 때만 받는다(전역 단축키를 쓰지 않는다)

export interface ManualKeys {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  attack: boolean;
}

export type ManualKey = keyof ManualKeys;

/** 키보드 배열·한글 입력과 상관없이 같은 자리 키로 읽게 event.code 로 본다. 점프는 원작 기본 키(Alt)도 받는다 */
const KEY_CODES: Record<string, ManualKey | 'exit'> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Space: 'jump',
  AltLeft: 'jump',
  AltRight: 'jump',
  KeyA: 'attack',
  Escape: 'exit',
};

export function keyAction(code: string): ManualKey | 'exit' | null {
  return KEY_CODES[code] ?? null;
}

export const KEY_LEGEND = '직접 조작 · ←→ 이동 · ↑↓ 사다리·포털 · Space/Alt 점프 · A 공격 · Esc 끄기';

const released = (): ManualKeys => ({ left: false, right: false, up: false, down: false, jump: false, attack: false });

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export function createManualKeys(
  target: Window,
  handlers: { enabled(): boolean; onPress(): void; onExit(): void },
): { read(): ManualKeys; clear(): void } {
  let keys = released();
  target.addEventListener('keydown', (event) => {
    if (!handlers.enabled() || isTyping(event.target)) return;
    const action = keyAction(event.code);
    if (!action) return;
    event.preventDefault();
    if (action === 'exit') {
      keys = released();
      handlers.onExit();
      return;
    }
    keys[action] = true;
    handlers.onPress();
  });
  target.addEventListener('keyup', (event) => {
    const action = keyAction(event.code);
    if (!action || action === 'exit') return;
    if (handlers.enabled()) event.preventDefault();
    keys[action] = false;
  });
  // 창이 포커스를 잃으면 keyup 이 안 와서 누른 채로 남는다
  target.addEventListener('blur', () => (keys = released()));
  return {
    read: () => keys,
    clear: () => (keys = released()),
  };
}
