import { describe, expect, it } from 'vitest';
import {
  type Conversation,
  DIALOG_WIDTH,
  type NpcDialog,
  type NpcPage,
  branchRoute,
  dialogFrame,
  dialogHeight,
  dialogRows,
  hasFinalConsonant,
  jobChangePriceText,
  openBranchChoice,
  openJobChange,
  parseMapleText,
  queueConversation,
} from './npcDialog';
import type { JobBranchId } from '../game/jobs';

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

  it('클래식은 빅뱅 전 대화창 띠(c 20 · s 58)로 같은 폭에 짓고 창 높이를 넘지 않는다', () => {
    const classic = dialogFrame('classic');
    expect(classic.slices.reduce((sum, [, width]) => sum + width, 0)).toBe(DIALOG_WIDTH);
    expect(dialogHeight(dialogRows(15, 60, classic), classic)).toBe(28 + 20 * 3 + 58);
    expect(dialogHeight(dialogRows(1000, 150, classic), classic)).toBeLessThanOrEqual(230);
    expect(dialogFrame()).not.toBe(classic);
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

/** 화면 없이 대화 흐름만 따라가는 대화창 */
function fakeDialog() {
  const state = { page: null as NpcPage | null, open: false, onDismiss: undefined as (() => void) | undefined };
  const dialog: NpcDialog = {
    open(_key, first, _passive, onDismiss) {
      state.open = true;
      state.page = first;
      state.onDismiss = onDismiss;
    },
    show(page) {
      state.page = page;
    },
    end() {
      state.open = false;
    },
    cancel() {},
    clear() {},
    isOpen: () => state.open,
    setEra() {},
  };
  return { dialog, state };
}

describe('2차 갈래 고르기 대화', () => {
  it('계열의 갈래를 늘어놓고, 고른 갈래를 「예」로 확인하면 그 갈래로 전직한다', () => {
    const { dialog, state } = fakeDialog();
    const chosen: JobBranchId[] = [];
    openBranchChoice(dialog, 'pirate', (id) => chosen.push(id));
    expect(state.page!.npc.name).toBe('카이린');
    expect(state.page!.options!.map((option) => option.label)).toEqual(['인파이터 → 버커니어 → 바이퍼', '건슬링어 → 발키리 → 캡틴']);
    state.page!.options![1].select();
    expect(state.page!.text).toContain('건슬링어');
    // 「아니오」는 갈래 목록으로 돌아간다
    state.page!.no!();
    expect(state.page!.options).toHaveLength(2);
    state.page!.options![1].select();
    state.page!.yes!();
    expect(chosen).toEqual(['captain']);
    expect(state.open).toBe(false);
  });

  it('전사·마법사는 셋, 궁수·도적·해적은 둘이다', () => {
    const count = (line: 'warrior' | 'magician' | 'archer' | 'thief' | 'pirate') => {
      const { dialog, state } = fakeDialog();
      openBranchChoice(dialog, line, () => {});
      return state.page!.options!.length;
    };
    expect([count('warrior'), count('magician'), count('archer'), count('thief'), count('pirate')]).toEqual([3, 3, 2, 2, 2]);
  });
});

describe('직업 바꾸기 대화', () => {
  const offer = { current: 'viper' as const, tier: 4, free: false, price: 50_000 };

  it('값과 가진 메소를 보여 주고, 확인한 뒤에야 바꾼다', () => {
    const { dialog, state } = fakeDialog();
    const changed: JobBranchId[] = [];
    openJobChange(dialog, { ...offer, meso: 80_000 }, { onChange: (to) => changed.push(to), onKeep: () => {} });
    expect(state.page!.text).toContain('지금은 #b바이퍼#k');
    expect(state.page!.text).toContain('50,000 메소');
    expect(state.page!.text).toContain('가진 메소: 80,000');
    // 같은 계열의 다른 갈래만 있고 지금 갈래는 없다
    expect(state.page!.options!.map((option) => option.label)).toEqual([branchRoute('captain')]);
    state.page!.options![0].select();
    expect(state.page!.text).toContain('캡틴');
    expect(changed).toEqual([]);
    state.page!.yes!();
    expect(changed).toEqual(['captain']);
    // 값을 내는 바꾸기는 닫아도 아무 일도 없다
    expect(state.onDismiss).toBeUndefined();
  });

  it('메소가 모자라면 선택지를 막고 얼마나 모자란지 적는다', () => {
    const { dialog, state } = fakeDialog();
    openJobChange(dialog, { ...offer, meso: 12_000 }, { onChange: () => {}, onKeep: () => {} });
    expect(state.page!.options!.every((option) => option.disabled)).toBe(true);
    expect(state.page!.text).toContain('메소가 38,000 모자라');
    expect(jobChangePriceText({ free: false, price: 50_000, meso: 50_000 })).not.toContain('모자라');
  });

  it('무료 다시 고르기는 값이 없고 「지금 그대로」와 닫기가 지금 갈래를 지킨다', () => {
    const { dialog, state } = fakeDialog();
    let kept = 0;
    openJobChange(dialog, { ...offer, free: true, meso: 0 }, { onChange: () => {}, onKeep: () => (kept += 1) });
    expect(state.page!.text).toContain('공짜');
    expect(state.page!.text).not.toContain('메소');
    const options = state.page!.options!;
    expect(options.some((option) => option.disabled)).toBe(false);
    expect(options[options.length - 1].label).toContain('지금 그대로');
    options[options.length - 1].select();
    state.onDismiss!();
    expect(kept).toBe(2);
  });
});
