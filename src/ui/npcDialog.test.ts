import { describe, expect, it } from 'vitest';
import {
  type Conversation,
  DIALOG_WIDTH,
  dialogHeight,
  dialogRows,
  hasFinalConsonant,
  parseMapleText,
  queueConversation,
} from './npcDialog';

describe('대화 글 색', () => {
  it('#b 부터 #k 까지 파랗게 칠한다', () => {
    expect(parseMapleText('정말 #b전사#k가 되겠나?')).toEqual([
      { text: '정말 ', color: 'black' },
      { text: '전사', color: 'blue' },
      { text: '가 되겠나?', color: 'black' },
    ]);
  });

  it('#r 은 빨강이고 모르는 # 코드는 글자 그대로 둔다', () => {
    expect(parseMapleText('#r주의#k #1 끝#')).toEqual([
      { text: '주의', color: 'red' },
      { text: ' #1 끝#', color: 'black' },
    ]);
  });

  it('색 코드만 있으면 빈 구간을 만들지 않는다', () => {
    expect(parseMapleText('#b#k')).toEqual([]);
  });
});

describe('받침', () => {
  it('마지막 글자의 받침을 본다', () => {
    expect(hasFinalConsonant('어쌔신')).toBe(true);
    expect(hasFinalConsonant('파이터')).toBe(false);
  });

  it('괄호로 끝나면 괄호 앞 낱말을 본다', () => {
    expect(hasFinalConsonant('위자드(불,독)')).toBe(false);
    expect(hasFinalConsonant('아크메이지(불,독)')).toBe(false);
  });

  it('한글이 아니면 받침 없음으로 친다', () => {
    expect(hasFinalConsonant('Lv.10')).toBe(false);
  });
});

describe('대화창 크기', () => {
  it('원작 띠를 잘라 이어서 360 창 안에 들어가는 폭이다', () => {
    expect(DIALOG_WIDTH).toBe(340);
  });

  it('짧은 글과 작은 초상화는 가장 낮은 높이로 둔다', () => {
    expect(dialogHeight(dialogRows(15, 60))).toBe(137);
  });

  it('가장 큰 초상화(하인즈 150)와 이름표가 들어가는 높이로 늘린다', () => {
    const height = dialogHeight(dialogRows(30, 150));
    expect(height - 13 - 28 - 19).toBeGreaterThanOrEqual(150);
    expect(height).toBeLessThanOrEqual(230);
  });

  it('긴 글이어도 창 높이를 넘지 않는다', () => {
    expect(dialogHeight(dialogRows(1000, 80))).toBeLessThanOrEqual(230);
  });
});

describe('대화 차례', () => {
  const conversation = (key: string, text: string): Conversation => ({
    key,
    first: { npc: { id: 1, name: 'NPC' }, text },
    passive: false,
  });

  it('다른 대화는 뒤에 붙인다', () => {
    const queue = queueConversation([conversation('a', '1')], conversation('b', '2'));
    expect(queue.map((each) => each.key)).toEqual(['a', 'b']);
  });

  it('같은 대화가 기다리고 있으면 그 자리를 새것으로 바꾼다', () => {
    const queue = queueConversation([conversation('a', '1'), conversation('b', '2')], conversation('a', '3'));
    expect(queue.map((each) => each.first.text)).toEqual(['3', '2']);
  });
});
