import { createChatLog } from './chatLog';
import { CHAT_MAX_LENGTH } from './throttle';
import type { ChatMessage } from './transport';

/** 창에 남겨 두는 글 수. 서버도 24시간 안 100개까지만 준다 */
const LOG_LIMIT = 100;

export interface ChatWindowHandlers {
  /** 보내지 못했으면 까닭을 돌려준다 */
  onSend(text: string): Promise<string | null>;
  /** 처음 열 때 지난 24시간 글을 받는다 */
  onFirstOpen(): Promise<{ message: ChatMessage; mine: boolean }[]>;
}

export interface ChatWindow {
  toggle(): void;
  open(): void;
  close(): void;
  /** 서버가 확정한 글. 먼저 띄운 내 글이 있으면 그 줄이 확정으로 바뀐다 */
  add(message: ChatMessage, mine: boolean): void;
  pending(message: ChatMessage): void;
  fail(clientId: string, reason: string): void;
  readonly isOpen: boolean;
}

const timeOf = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export function createChatWindow(root: HTMLElement, handlers: ChatWindowHandlers): ChatWindow {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <section class="online-chat" aria-label="채팅" hidden>
      <header class="online-chat-head">
        <span class="online-chat-title">채팅</span>
        <span class="online-chat-hint">24시간 뒤 지워져요</span>
        <button class="online-chat-close" type="button" aria-label="채팅 닫기">×</button>
      </header>
      <ol class="online-chat-log" aria-live="polite"></ol>
      <form class="online-chat-form">
        <input class="online-chat-input" type="text" maxlength="${CHAT_MAX_LENGTH}" autocomplete="off" spellcheck="false"
          placeholder="Enter 보내기 · Esc 닫기" aria-label="채팅 입력" />
      </form>
      <p class="online-chat-error" role="status" hidden></p>
    </section>
    `,
  );
  const panel = root.querySelector<HTMLElement>('.online-chat')!;
  const log = panel.querySelector<HTMLOListElement>('.online-chat-log')!;
  const form = panel.querySelector<HTMLFormElement>('.online-chat-form')!;
  const input = panel.querySelector<HTMLInputElement>('.online-chat-input')!;
  const error = panel.querySelector<HTMLElement>('.online-chat-error')!;
  const chatLog = createChatLog(LOG_LIMIT);
  let loaded = false;
  let sending = false;
  let errorTimer = 0;

  function showError(text: string | null): void {
    window.clearTimeout(errorTimer);
    error.hidden = text === null;
    error.textContent = text ?? '';
    if (text) errorTimer = window.setTimeout(() => (error.hidden = true), 4000);
  }

  /** 지난 글과 새 글이 섞여 와도 보낸 시각 순으로 그린다. 남의 글은 textContent 로만 넣는다 */
  function render(): void {
    const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 4;
    log.replaceChildren(
      ...chatLog.lines.map(({ message, mine, state, reason }) => {
        const line = document.createElement('li');
        line.className = `online-chat-line${mine ? ' is-mine' : ''}${state === 'sent' ? '' : ` is-${state}`}`;
        line.title = timeOf(message.createdAt);
        const name = document.createElement('span');
        name.className = 'online-chat-name';
        name.textContent = message.name;
        line.append(name, ` : ${message.text}`);
        if (reason) {
          const note = document.createElement('span');
          note.className = 'online-chat-fail';
          note.textContent = ` (${reason})`;
          line.append(note);
        }
        return line;
      }),
    );
    if (stick || !panel.hidden) log.scrollTop = log.scrollHeight;
  }

  function open(): void {
    panel.hidden = false;
    input.focus({ preventScroll: true });
    render();
    if (loaded) return;
    loaded = true;
    handlers.onFirstOpen().then(
      (history) => {
        history.forEach(({ message, mine }) => chatLog.add(message, mine));
        render();
      },
      () => {
        // 다음에 열 때 다시 받는다
        loaded = false;
      },
    );
  }

  function close(): void {
    panel.hidden = true;
    input.blur();
    showError(null);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (sending || !input.value.trim()) return;
    sending = true;
    const text = input.value;
    handlers
      .onSend(text)
      .then((reason) => {
        showError(reason);
        if (!reason && input.value === text) input.value = '';
      })
      .finally(() => (sending = false));
  });
  // 채팅 입력 중 키가 직접 조작·HUD 단축키로 새지 않게 여기서 멈춘다
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
  panel.querySelector('.online-chat-close')!.addEventListener('click', close);

  return {
    toggle: () => (panel.hidden ? open() : close()),
    open,
    close,
    add(message, mine) {
      chatLog.add(message, mine);
      render();
    },
    pending(message) {
      chatLog.pending(message);
      render();
    },
    fail(clientId, reason) {
      chatLog.fail(clientId, reason);
      render();
    },
    get isOpen() {
      return !panel.hidden;
    },
  };
}
