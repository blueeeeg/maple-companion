import { describe, expect, it } from 'vitest';
import { createChatLog } from './chatLog';
import type { ChatMessage } from './transport';

const message = (over: Partial<ChatMessage>): ChatMessage => ({
  id: '1',
  userId: 'a',
  name: '단풍이',
  era: 'current',
  mapId: 1,
  text: '안녕',
  createdAt: '2026-11-02T00:00:00.000Z',
  ...over,
});

describe('채팅 목록', () => {
  it('먼저 띄운 줄을 같은 clientId 의 서버 글로 확정하고 자리를 지킨다', () => {
    const log = createChatLog(100);
    log.pending(message({ id: 'local:x', clientId: 'x', createdAt: '2026-11-02T00:00:05.000Z' }));
    log.add(message({ id: '9', clientId: 'x', createdAt: '2026-11-02T00:00:01.000Z' }), true);
    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toMatchObject({ state: 'sent', message: { id: '9' } });
  });

  it('같은 서버 글이 또 오면 버린다', () => {
    const log = createChatLog(100);
    log.add(message({ id: '9' }), false);
    log.add(message({ id: '9' }), false);
    expect(log.lines).toHaveLength(1);
  });

  it('못 보낸 줄에 까닭을 붙이고 확정된 줄은 건드리지 않는다', () => {
    const log = createChatLog(100);
    log.pending(message({ id: 'local:x', clientId: 'x' }));
    log.pending(message({ id: 'local:y', clientId: 'y', text: '둘' }));
    log.add(message({ id: '9', clientId: 'y', text: '둘' }), true);
    log.fail('x', '못 보냄 · 너무 빨라요');
    log.fail('y', '못 보냄 · 연결 문제');
    expect(log.lines.map((line) => [line.state, line.reason])).toEqual([
      ['failed', '못 보냄 · 너무 빨라요'],
      ['sent', undefined],
    ]);
  });

  it('limit 를 넘으면 오래된 줄부터 버린다', () => {
    const log = createChatLog(2);
    ['1', '2', '3'].forEach((id) => log.add(message({ id, createdAt: `2026-11-02T00:00:0${id}.000Z` }), false));
    expect(log.lines.map((line) => line.message.id)).toEqual(['2', '3']);
  });
});
