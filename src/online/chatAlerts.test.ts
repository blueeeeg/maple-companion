import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatAlerts } from '../game/settings';
import {
  CHAT_ALERT_TITLE,
  COALESCE_MS,
  FRIEND_ALERT_TITLE,
  type ChatAlertView,
  chatAlertBody,
  createChatAlerts,
  mentions,
  unreadBadge,
} from './chatAlerts';
import type { ChatMessage } from './transport';

let nextId = 0;
const msg = (name: string, text: string, userId = `u-${name}`): ChatMessage => ({
  id: `m${(nextId += 1)}`,
  userId,
  name,
  era: 'current',
  mapId: 100000000,
  text,
  createdAt: new Date().toISOString(),
});

const HIDDEN: ChatAlertView = { shown: false, focused: false, feedVisible: false };
const OTHER_APP: ChatAlertView = { shown: true, focused: false, feedVisible: true };
const LOOKING: ChatAlertView = { shown: true, focused: true, feedVisible: true };
const LOOKING_SETTINGS: ChatAlertView = { shown: true, focused: true, feedVisible: false };

function setup(initial: { view?: ChatAlertView; chatAlerts?: ChatAlerts; friendAlerts?: boolean; name?: string | null } = {}) {
  const state = { view: HIDDEN, chatAlerts: 'all' as ChatAlerts, friendAlerts: false, name: '주황버섯' as string | null, ...initial };
  const sent: { title: string; body: string }[] = [];
  const unread: number[] = [];
  const alerts = createChatAlerts({
    notify: (title, body) => sent.push({ title, body }),
    view: () => state.view,
    settings: () => ({ chatAlerts: state.chatAlerts, friendAlerts: state.friendAlerts }),
    selfName: () => state.name,
    onUnread: (count) => unread.push(count),
  });
  return { state, sent, unread, alerts };
}

describe('이름을 불렀는지', () => {
  it('한글 이름은 그대로·@ 를 붙여도·조사가 붙어도 부른 것이다', () => {
    expect(mentions('주황버섯 같이 가자', '주황버섯')).toBe(true);
    expect(mentions('@주황버섯 보스 ㄱ?', '주황버섯')).toBe(true);
    expect(mentions('주황버섯아 어디야', '주황버섯')).toBe(true);
    expect(mentions('주황버섯님, 안녕하세요', '주황버섯')).toBe(true);
    expect(mentions('오늘은(주황버섯)이랑 사냥', '주황버섯')).toBe(true);
    expect(mentions('끝에 주황버섯', '주황버섯')).toBe(true);
  });

  it('더 긴 낱말의 일부면 부른 것이 아니다', () => {
    expect(mentions('파란주황버섯 봤어?', '주황버섯')).toBe(false);
    expect(mentions('주황버섯집 가자', '주황버섯')).toBe(false);
    expect(mentions('주황버섯2 누구야', '주황버섯')).toBe(false);
    expect(mentions('주황 버섯', '주황버섯')).toBe(false);
  });

  it('라틴 이름은 대소문자를 가리지 않고 낱말 경계를 본다', () => {
    expect(mentions('hey BOB, boss?', 'Bob')).toBe(true);
    expect(mentions('@bob', 'Bob')).toBe(true);
    expect(mentions('Bob님 ㄱㄱ', 'Bob')).toBe(true);
    expect(mentions('bobby 왔다', 'Bob')).toBe(false);
    expect(mentions('kebob', 'Bob')).toBe(false);
  });

  it('뒤쪽에 낱말로 한 번 더 나오면 부른 것이다', () => {
    expect(mentions('주황버섯집 말고 주황버섯 너', '주황버섯')).toBe(true);
  });

  it('이름이 없으면 아무것도 부른 것이 아니다', () => {
    expect(mentions('안녕', null)).toBe(false);
    expect(mentions('안녕', '  ')).toBe(false);
  });
});

describe('알림 문구', () => {
  it('첫 글과 나머지 수', () => {
    expect(chatAlertBody({ name: '단풍이', text: '보스 잡을 사람?' }, 2)).toBe('단풍이: 보스 잡을 사람? 외 2개');
    expect(chatAlertBody({ name: '단풍이', text: '안녕' }, 0)).toBe('단풍이: 안녕');
    expect(chatAlertBody({ name: '', text: '안녕' }, 0)).toBe('모험가: 안녕');
  });

  it('긴 글은 잘라서 「외 N개」가 보이게 한다', () => {
    const body = chatAlertBody({ name: '단풍이', text: '가'.repeat(120) }, 3);
    expect(body).toBe(`단풍이: ${'가'.repeat(60)}… 외 3개`);
  });

  it('트레이 뒤에 붙는 안 읽은 수', () => {
    expect(unreadBadge(0)).toBe('');
    expect(unreadBadge(3)).toBe(' · 💬3');
    expect(unreadBadge(250)).toBe(' · 💬99+');
  });
});

describe('채팅 OS 알림 묶기', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('30초 안에 온 글은 첫 글과 나머지 수로 한 번만 알린다', () => {
    const { sent, alerts } = setup();
    alerts.message(msg('단풍이', '보스 잡을 사람?'), false);
    vi.advanceTimersByTime(10_000);
    alerts.message(msg('슬라임', '나!'), false);
    alerts.message(msg('단풍이', '자쿰 ㄱ'), false);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(COALESCE_MS - 10_000);
    expect(sent).toEqual([{ title: CHAT_ALERT_TITLE, body: '단풍이: 보스 잡을 사람? 외 2개' }]);
  });

  it('창이 숨어도 다른 앱을 봐도 알린다. 묶음이 끝나면 다음 글은 새 묶음이다', () => {
    const { state, sent, alerts } = setup({ view: OTHER_APP });
    alerts.message(msg('단풍이', '하나'), false);
    vi.advanceTimersByTime(COALESCE_MS);
    state.view = HIDDEN;
    alerts.message(msg('슬라임', '둘'), false);
    vi.advanceTimersByTime(COALESCE_MS);
    expect(sent.map((each) => each.body)).toEqual(['단풍이: 하나', '슬라임: 둘']);
  });

  it('창을 보고 있으면 알리지 않는다(맵이 아닌 화면이어도)', () => {
    for (const view of [LOOKING, LOOKING_SETTINGS]) {
      const { sent, alerts } = setup({ view });
      alerts.message(msg('단풍이', '@주황버섯 안녕'), false);
      alerts.message(msg('단풍이', '안녕'), false);
      vi.advanceTimersByTime(COALESCE_MS);
      expect(sent).toEqual([]);
    }
  });

  it('묶는 동안 창을 보면 그 묶음은 버린다', () => {
    const { state, sent, alerts } = setup();
    alerts.message(msg('단풍이', '하나'), false);
    state.view = LOOKING;
    vi.advanceTimersByTime(COALESCE_MS);
    expect(sent).toEqual([]);
  });

  it('내 글·시스템 줄은 알리지도 세지도 않는다', () => {
    const { sent, unread, alerts } = setup();
    alerts.message(msg('주황버섯', '나 왔어 주황버섯', 'me'), true);
    alerts.message(msg('', '단풍이님이 들어왔어요', ''), false);
    vi.advanceTimersByTime(COALESCE_MS);
    expect(sent).toEqual([]);
    expect(unread).toEqual([]);
  });

  it('이름을 부르면 묶지 않고 바로 따로 알린다. 묶던 글 수에는 안 센다', () => {
    const { sent, alerts } = setup();
    alerts.message(msg('단풍이', '보스 잡을 사람?'), false);
    alerts.message(msg('슬라임', '@주황버섯 같이 가자'), false);
    expect(sent).toEqual([{ title: CHAT_ALERT_TITLE, body: '슬라임: @주황버섯 같이 가자' }]);
    alerts.message(msg('슬라임', '대답해'), false);
    vi.advanceTimersByTime(COALESCE_MS);
    expect(sent[1].body).toBe('단풍이: 보스 잡을 사람? 외 1개');
  });

  it('이름 불렀을 때만: 다른 글은 알리지 않는다', () => {
    const { sent, alerts } = setup({ chatAlerts: 'mentions' });
    alerts.message(msg('단풍이', '보스 잡을 사람?'), false);
    alerts.message(msg('단풍이', '주황버섯아 어디야'), false);
    vi.advanceTimersByTime(COALESCE_MS);
    expect(sent.map((each) => each.body)).toEqual(['단풍이: 주황버섯아 어디야']);
  });

  it('끄기: 이름을 불러도 알리지 않는다. 안 읽은 수는 센다', () => {
    const { sent, alerts } = setup({ chatAlerts: 'off' });
    alerts.message(msg('단풍이', '@주황버섯'), false);
    alerts.message(msg('단풍이', '안녕'), false);
    vi.advanceTimersByTime(COALESCE_MS);
    expect(sent).toEqual([]);
    expect(alerts.unread).toBe(2);
  });

  it('묶는 동안 「끄기」로 바꾸면 보내지 않는다', () => {
    const { state, sent, alerts } = setup();
    alerts.message(msg('단풍이', '하나'), false);
    state.chatAlerts = 'off';
    vi.advanceTimersByTime(COALESCE_MS);
    expect(sent).toEqual([]);
  });

  it('캐릭터 이름을 바꾸면 지금 이름으로 본다', () => {
    const { state, sent, alerts } = setup({ chatAlerts: 'mentions' });
    state.name = '단풍이';
    alerts.message(msg('슬라임', '주황버섯 어디'), false);
    alerts.message(msg('슬라임', '단풍이 어디'), false);
    expect(sent.map((each) => each.body)).toEqual(['슬라임: 단풍이 어디']);
  });
});

describe('안 읽은 채팅 수', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('채팅 줄이 안 보이는 동안 온 남의 글만 세고 seen 으로 지운다', () => {
    const { state, unread, alerts } = setup();
    alerts.message(msg('단풍이', '하나'), false);
    state.view = LOOKING_SETTINGS;
    alerts.message(msg('단풍이', '둘'), false);
    state.view = LOOKING;
    alerts.message(msg('단풍이', '셋'), false);
    expect(alerts.unread).toBe(2);
    alerts.seen();
    expect(alerts.unread).toBe(0);
    expect(unread).toEqual([1, 2, 0]);
  });

  it('seen 은 묶던 알림도 버린다. 이미 0 이면 다시 알리지 않는다', () => {
    const { sent, unread, alerts } = setup();
    alerts.seen();
    alerts.message(msg('단풍이', '하나'), false);
    alerts.seen();
    vi.advanceTimersByTime(COALESCE_MS);
    expect(sent).toEqual([]);
    expect(unread).toEqual([1, 0]);
  });
});

describe('친구 접속 알림', () => {
  it('켜 두고 창을 안 볼 때만 알린다', () => {
    const off = setup();
    off.alerts.joined('단풍이');
    expect(off.sent).toEqual([]);

    const on = setup({ friendAlerts: true });
    on.alerts.joined('단풍이');
    expect(on.sent).toEqual([{ title: FRIEND_ALERT_TITLE, body: '단풍이님이 들어왔어요' }]);
    on.state.view = LOOKING;
    on.alerts.joined('슬라임');
    expect(on.sent).toHaveLength(1);
  });
});
