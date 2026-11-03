import type { ChatAlerts } from '../game/settings';
import type { ChatMessage } from './transport';

/** 이 안에 온 글은 OS 알림 하나로 묶는다 */
export const COALESCE_MS = 30_000;
export const CHAT_ALERT_TITLE = '채팅';
export const FRIEND_ALERT_TITLE = '친구 접속';
/** 알림 본문이 길면 OS 가 뒤를 잘라 「외 N개」가 안 보인다 */
const BODY_TEXT_MAX = 60;
const BADGE_MAX = 99;
const NOBODY = '모험가';

const LETTER = /[\p{L}\p{N}]/u;
const HANGUL = /[가-힣]/;
/** 한글 이름 바로 뒤에 붙는 호칭·조사의 첫 글자. 「주황버섯아」「주황버섯님」은 부른 것이고 「주황버섯집」은 아니다 */
const PARTICLE_START = new Set([...'님아야이가은는을를도의에한께랑와과씨']);

/** 글에 내 캐릭터 이름이 낱말로 들어 있는지. 「@」를 앞에 붙여도 된다. 라틴 글자는 대소문자를 가리지 않는다 */
export function mentions(text: string, name: string | null | undefined): boolean {
  const target = name?.trim().toLowerCase();
  if (!target) return false;
  const haystack = text.toLowerCase();
  const last = target[target.length - 1];
  for (let at = haystack.indexOf(target); at !== -1; at = haystack.indexOf(target, at + 1)) {
    const before = haystack[at - 1];
    const after = haystack[at + target.length];
    if (before !== undefined && LETTER.test(before)) continue;
    if (after === undefined || !LETTER.test(after)) return true;
    // 한글 조사는 띄우지 않고 붙는다. 라틴 이름 뒤에 한글이 붙어도(「Bob님」) 부른 것으로 본다
    if (HANGUL.test(after) && (PARTICLE_START.has(after) || !HANGUL.test(last))) return true;
  }
  return false;
}

const clip = (text: string) => {
  const chars = Array.from(text);
  return chars.length > BODY_TEXT_MAX ? `${chars.slice(0, BODY_TEXT_MAX).join('')}…` : text;
};

/** 「단풍이: 보스 잡을 사람? 외 2개」 */
export function chatAlertBody(first: Pick<ChatMessage, 'name' | 'text'>, others: number): string {
  const line = `${first.name || NOBODY}: ${clip(first.text)}`;
  return others > 0 ? `${line} 외 ${others}개` : line;
}

/** 트레이 글자 뒤에 붙는 안 읽은 채팅 수. 없으면 빈 문자열 */
export function unreadBadge(count: number): string {
  if (count <= 0) return '';
  return ` · 💬${count > BADGE_MAX ? `${BADGE_MAX}+` : count}`;
}

export interface ChatAlertView {
  /** 창이 떠 있고 화면에 보이는지 */
  shown: boolean;
  /** 창이 입력을 받고 있는지 */
  focused: boolean;
  /** 맵 화면이라 EXP 바 위 채팅 줄이 보이거나 입력창이 열려 있는지 */
  feedVisible: boolean;
}

export interface ChatAlertDeps {
  notify(title: string, body: string): void;
  view(): ChatAlertView;
  settings(): { chatAlerts: ChatAlerts; friendAlerts: boolean };
  /** 지금 캐릭터 이름. 이름을 불렀는지 볼 때 쓴다 */
  selfName(): string | null;
  /** 안 읽은 수가 바뀔 때 */
  onUnread(count: number): void;
}

/** 창을 보고 있으면 말풍선·채팅 줄로 충분하다. 다른 앱을 보거나 창이 숨었을 때만 OS 알림 */
const watching = (view: ChatAlertView) => view.shown && view.focused;
/** 채팅 줄까지 보이는 상태로 보고 있어야 읽은 것으로 친다 */
export const isReading = (view: ChatAlertView) => watching(view) && view.feedVisible;

export function createChatAlerts(deps: ChatAlertDeps) {
  let unread = 0;
  let batch: { first: ChatMessage; others: number; timer: ReturnType<typeof setTimeout> } | null = null;

  function setUnread(next: number): void {
    if (next === unread) return;
    unread = next;
    deps.onUnread(unread);
  }

  function dropBatch(): void {
    if (batch) clearTimeout(batch.timer);
    batch = null;
  }

  function flush(): void {
    const pending = batch;
    batch = null;
    // 기다리는 동안 창을 봤거나 설정을 바꿨으면 보내지 않는다
    if (!pending || watching(deps.view()) || deps.settings().chatAlerts !== 'all') return;
    deps.notify(CHAT_ALERT_TITLE, chatAlertBody(pending.first, pending.others));
  }

  return {
    /** 서버가 확정한 글. 내 글·시스템 줄은 세지 않는다 */
    message(message: ChatMessage, mine: boolean): void {
      if (mine || !message.userId) return;
      const view = deps.view();
      if (isReading(view)) return;
      setUnread(unread + 1);
      const mode = deps.settings().chatAlerts;
      if (mode === 'off' || watching(view)) return;
      if (mentions(message.text, deps.selfName())) {
        deps.notify(CHAT_ALERT_TITLE, chatAlertBody(message, 0));
        return;
      }
      if (mode !== 'all') return;
      if (batch) batch.others += 1;
      else batch = { first: message, others: 0, timer: setTimeout(flush, COALESCE_MS) };
    },
    joined(name: string): void {
      if (!deps.settings().friendAlerts || watching(deps.view())) return;
      deps.notify(FRIEND_ALERT_TITLE, `${name || NOBODY}님이 들어왔어요`);
    },
    /** 창에 포커스가 왔거나 입력창을 열었다. 안 읽은 수를 지우고 묶던 알림도 버린다 */
    seen(): void {
      dropBatch();
      setUnread(0);
    },
    get unread() {
      return unread;
    },
  };
}
