import { wzImageUrl } from '../maple/api';
import { cropArt } from '../ui/art';
import { type ChatLine, createChatLog } from './chatLog';
import { createChatFeed, feedLines, FEED_FADE_MS, inputChatKey, windowChatKey } from './chatFeed';
import { CHAT_MAX_LENGTH } from './throttle';
import type { ChatMessage } from './transport';

/** 남겨 두는 글 수. 서버도 24시간 안 100개까지만 준다 */
const LOG_LIMIT = 100;
const ERROR_MS = 4000;

/**
 * 빅뱅 전 상태 바(v83 StatusBar.img/base/backgrnd, 800×71)의 맨 위 흰 띠가 원작 채팅 입력칸이다.
 * 위아래 그림자 줄을 빼고 (0, 3) 에서 27줄을 떼어 입력칸 바탕으로 늘린다
 */
const INPUT_ART_RECT = { y: 3, height: 27 };
function chatInputArt(): Promise<string> {
  const { y, height } = INPUT_ART_RECT;
  return cropArt(wzImageUrl('UI/StatusBar.img/base/backgrnd', 'classic'), `v83-chat-input-${y},${height}`, (image) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(image, 0, y, canvas.width, height, 0, 0, canvas.width, height);
    return canvas.toDataURL();
  });
}

export interface ChatOverlayHandlers {
  /** 보내지 못했으면 까닭을 돌려준다 */
  onSend(text: string): Promise<string | null>;
  /** 처음 열 때 지난 24시간 글을 받는다 */
  onFirstOpen(): Promise<{ message: ChatMessage; mine: boolean }[]>;
  /** Enter 로 입력창을 열어도 되는지(맵 화면이 보이고 방에 들어가 있다) */
  canOpen(): boolean;
  /** 입력창이 열리고 닫힐 때. 여는 동안 직접 조작 키를 막는다 */
  onTyping(open: boolean): void;
}

export interface ChatOverlay {
  open(): void;
  close(): void;
  add(message: ChatMessage, mine: boolean): void;
  pending(message: ChatMessage): void;
  fail(clientId: string, reason: string): void;
  /** 들어왔어요·나갔어요 시스템 줄 */
  notice(text: string): void;
  /** 입력창 위에 보이는 접속자 줄. 빈 문자열이면 감춘다 */
  setWho(line: string): void;
  /** 처음 들어왔을 때 한 번 띄우는 안내 */
  hint(text: string): void;
  readonly isOpen: boolean;
}

const timeOf = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  // 대화창 버튼에 포커스가 있으면 Enter 는 그 버튼 몫이다
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.closest('[role="dialog"]') !== null;
}

/** 남의 글은 textContent 로만 넣는다 */
function lineElement({ message, mine, state, reason }: ChatLine): HTMLLIElement {
  const line = document.createElement('li');
  line.className = `online-chat-line${mine ? ' is-mine' : ''}${state === 'sent' ? '' : ` is-${state}`}`;
  if (state === 'system') {
    line.textContent = message.text;
    return line;
  }
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
}

export function createChatOverlay(root: HTMLElement, handlers: ChatOverlayHandlers): ChatOverlay {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <ol class="online-chat-feed" aria-live="polite" hidden></ol>
    <section class="online-chat" aria-label="채팅" hidden>
      <p class="online-chat-who" hidden></p>
      <ol class="online-chat-log"></ol>
      <p class="online-chat-error" role="status" hidden></p>
      <div class="online-chat-bar">
        <input class="online-chat-input" type="text" maxlength="${CHAT_MAX_LENGTH}" autocomplete="off" spellcheck="false"
          placeholder="Enter 보내기 · Esc 닫기 · 24시간 뒤 지워져요" aria-label="채팅 입력" />
      </div>
    </section>
    `,
  );
  const feedList = root.querySelector<HTMLOListElement>('.online-chat-feed')!;
  const panel = root.querySelector<HTMLElement>('.online-chat')!;
  const log = panel.querySelector<HTMLOListElement>('.online-chat-log')!;
  const bar = panel.querySelector<HTMLElement>('.online-chat-bar')!;
  const input = panel.querySelector<HTMLInputElement>('.online-chat-input')!;
  const error = panel.querySelector<HTMLElement>('.online-chat-error')!;
  const who = panel.querySelector<HTMLElement>('.online-chat-who')!;
  const chatLog = createChatLog(LOG_LIMIT);
  const feed = createChatFeed();
  let hintText: string | null = null;
  let loaded = false;
  let sending = false;
  let errorTimer = 0;
  let fadeTimer = 0;
  let hideTimer = 0;

  chatInputArt().then(
    (url) => {
      bar.style.setProperty('--chat-input-art', `url("${url}")`);
      bar.classList.add('has-art');
    },
    () => {},
  );

  function showError(text: string | null): void {
    window.clearTimeout(errorTimer);
    error.hidden = text === null;
    error.textContent = text ?? '';
    if (text) errorTimer = window.setTimeout(() => (error.hidden = true), ERROR_MS);
  }

  function renderFeed(): void {
    const items = feedLines(chatLog.lines).map(lineElement);
    if (hintText) {
      const hint = document.createElement('li');
      hint.className = 'online-chat-line is-hint';
      hint.textContent = hintText;
      items.push(hint);
    }
    feedList.replaceChildren(...items);
  }

  /** 새 글이 오면 마지막 몇 줄을 다시 또렷하게 띄우고, 정해진 시간 뒤 흐려져 사라진다 */
  function pokeFeed(): void {
    renderFeed();
    if (!panel.hidden) return;
    const now = performance.now();
    feed.poke(now);
    window.clearTimeout(fadeTimer);
    window.clearTimeout(hideTimer);
    feedList.hidden = false;
    feedList.style.transition = 'none';
    feedList.style.opacity = '1';
    fadeTimer = window.setTimeout(() => {
      feedList.style.transition = `opacity ${FEED_FADE_MS}ms linear`;
      feedList.style.opacity = '0';
      hideTimer = window.setTimeout(() => {
        feedList.hidden = true;
        hintText = null;
      }, FEED_FADE_MS);
    }, feed.fadeIn(now));
  }

  function renderLog(): void {
    log.replaceChildren(...chatLog.lines.map(lineElement));
    log.scrollTop = log.scrollHeight;
  }

  function open(): void {
    if (!panel.hidden) {
      input.focus({ preventScroll: true });
      return;
    }
    feed.hide();
    window.clearTimeout(fadeTimer);
    window.clearTimeout(hideTimer);
    feedList.hidden = true;
    panel.hidden = false;
    root.classList.add('online-chat-open');
    handlers.onTyping(true);
    renderLog();
    input.focus({ preventScroll: true });
    if (loaded) return;
    loaded = true;
    handlers.onFirstOpen().then(
      (history) => {
        history.forEach(({ message, mine }) => chatLog.add(message, mine));
        if (!panel.hidden) renderLog();
      },
      () => {
        // 다음에 열 때 다시 받는다
        loaded = false;
      },
    );
  }

  function close(): void {
    if (panel.hidden) return;
    panel.hidden = true;
    root.classList.remove('online-chat-open');
    showError(null);
    if (document.activeElement === input) input.blur();
    handlers.onTyping(false);
  }

  function send(): void {
    const text = input.value;
    if (!text.trim()) {
      close();
      return;
    }
    if (sending) return;
    sending = true;
    handlers
      .onSend(text)
      .then((reason) => {
        showError(reason);
        if (reason) return;
        if (input.value === text) input.value = '';
        close();
      })
      .finally(() => (sending = false));
  }

  // 입력 중 키가 직접 조작·HUD·창 단축키로 새지 않게 여기서 멈춘다
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    const action = inputChatKey(event);
    if (!action) return;
    event.preventDefault();
    if (action === 'cancel') {
      input.value = '';
      close();
    } else send();
  });
  input.addEventListener('keyup', (event) => event.stopPropagation());
  // 맵을 누르는 등 입력칸을 벗어나면 쓰던 글은 두고 닫는다. 지난 줄을 눌러 올려 볼 때는 닫지 않는다
  input.addEventListener('blur', close);
  panel.addEventListener('mousedown', (event) => {
    if (event.target !== input) event.preventDefault();
  });

  window.addEventListener('keydown', (event) => {
    const action = windowChatKey(event, { open: !panel.hidden, typing: isTyping(event.target), allowed: handlers.canOpen() });
    if (action !== 'open') return;
    event.preventDefault();
    event.stopPropagation();
    open();
  });

  return {
    open,
    close,
    add(message, mine) {
      chatLog.add(message, mine);
      if (!panel.hidden) renderLog();
      pokeFeed();
    },
    pending(message) {
      chatLog.pending(message);
      if (!panel.hidden) renderLog();
      pokeFeed();
    },
    fail(clientId, reason) {
      chatLog.fail(clientId, reason);
      if (!panel.hidden) renderLog();
      pokeFeed();
    },
    notice(text) {
      chatLog.system(text);
      if (!panel.hidden) renderLog();
      pokeFeed();
    },
    setWho(line) {
      who.hidden = line === '';
      who.textContent = line;
    },
    hint(text) {
      hintText = text;
      pokeFeed();
    },
    get isOpen() {
      return !panel.hidden;
    },
  };
}
