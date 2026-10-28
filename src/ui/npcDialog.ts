import { JOB_BRANCHES, JOB_LINES, type JobBranchId, type JobLineId, type JobPath, jobBranches, lineOf, tierName } from '../game/jobs';
import { type Era, npcDialogUrl, npcStandUrl, wzImageUrl } from '../maple/api';
import { applyArt, loadWithRetry, loadedImage } from './art';

export interface Npc {
  id: number;
  name: string;
}

export interface NpcOption {
  label: string;
  select(): void;
  /** 고를 수 없는 선택지. 왜 못 고르는지는 대화 글에 적는다 */
  disabled?: boolean;
}

/** 대화창 한 쪽. 버튼은 handler 가 있는 것만 오른쪽 아래에 나오고, 「대화 그만하기」는 늘 왼쪽 아래에 있다 */
export interface NpcPage {
  npc: Npc;
  /** 원작 대화 문법 일부를 따른다. #b 파란 글자, #r 빨간 글자, #k 검은 글자로 돌아간다. 줄바꿈은 \n */
  text: string;
  options?: NpcOption[];
  next?(): void;
  no?(): void;
  yes?(): void;
  ok?(): void;
}

export interface NpcDialog {
  /**
   * 대화를 연다. 다른 대화가 열려 있으면 그 대화가 끝난 뒤에 연다. 같은 key 의 대화가 기다리고 있으면 새것으로 바꾸고,
   * 이미 열려 있으면 무시한다. passive 대화는 화면을 어둡게 하지 않고 창 밖 클릭을 막지 않는다
   */
  open(key: string, first: NpcPage, passive?: boolean, onDismiss?: () => void): void;
  /** 지금 대화의 다음 쪽 */
  show(page: NpcPage): void;
  /** 지금 대화를 닫고 기다리던 대화가 있으면 연다 */
  end(): void;
  /** 그 key 의 대화를 열려 있든 기다리든 버린다 */
  cancel(key: string): void;
  clear(): void;
  /** 대화가 떠 있다 */
  isOpen(): boolean;
  /** 대화창 틀을 그 시대 원작 그림으로 바꾼다. 클래식은 빅뱅 전 대화창이다 */
  setEra(era: Era): void;
}

export interface Conversation {
  key: string;
  first: NpcPage;
  passive: boolean;
  /** 「대화 그만하기」·Esc 로 닫았을 때. 다른 캐릭터로 바꾸느라 버린 대화에는 부르지 않는다 */
  onDismiss?: () => void;
}

/** 같은 key 가 이미 기다리면 그 자리를 새 대화로 바꾸고, 없으면 뒤에 붙인다 */
export function queueConversation(queue: Conversation[], next: Conversation): Conversation[] {
  const index = queue.findIndex((each) => each.key === next.key);
  if (index < 0) return [...queue, next];
  return queue.map((each, at) => (at === index ? next : each));
}

export type TextColor = 'black' | 'blue' | 'red';
export interface TextRun {
  text: string;
  color: TextColor;
}

const COLOR_CODES: Record<string, TextColor> = { b: 'blue', r: 'red', k: 'black' };

/** 「#b전사#k가 되겠나?」를 색 구간으로 나눈다. 모르는 #코드는 글자 그대로 둔다 */
export function parseMapleText(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let color: TextColor = 'black';
  let buffer = '';
  for (let at = 0; at < text.length; at += 1) {
    const code = text[at] === '#' ? COLOR_CODES[text[at + 1]] : undefined;
    if (!code) {
      buffer += text[at];
      continue;
    }
    if (buffer) runs.push({ text: buffer, color });
    buffer = '';
    color = code;
    at += 1;
  }
  if (buffer) runs.push({ text: buffer, color });
  return runs;
}

/** 마지막 한글 글자에 받침이 있는지. 「위자드(불,독)」처럼 괄호로 끝나면 괄호 앞 낱말을 본다 */
export function hasFinalConsonant(word: string): boolean {
  const last = word.replace(/\([^)]*\)\s*$/, '').trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return false;
  return code % 28 > 0;
}

/** 대화창 틀 그림을 잘라 잇는 방법과 띠 높이. 시대마다 원작 대화창 그림이 달라서 따로 둔다 */
export interface DialogFrame {
  /** 원본 띠에서 잘라 이을 세로 구간 [원본 x, 폭] */
  slices: [srcX: number, width: number][];
  /** 위 띠(t)·가운데 띠 한 줄(c)·아래 띠(s) 높이 */
  top: number;
  row: number;
  bottom: number;
  minRows: number;
  maxRows: number;
  /** 글 칸 위아래 안쪽 여백의 합 */
  textMargin: number;
  /** NPC 칸 위 여백 + 아래에서 이름표 아래까지 + 이름표 + 위아래 여백 */
  portraitMargin: number;
  /** UtilDlgEx 아래 노드 그림 */
  art(node: string): string;
  /** 확인 버튼 그림 */
  okArt(state: string): string;
}

// 원작 대화창(UI/UIWindow2.img/UtilDlgEx)은 폭 519 에 위(t, 28)·가운데(c, 13 을 세로로 반복)·아래(s, 44) 세 띠다.
// 360 창에 맞추려고 원본 크기 그대로 두고 세로로 한 줄씩 똑같은 구간 두 곳(NPC 칸 80~100, 글 칸 190~349)을 잘라 낸다.
// 잘라 낸 양옆 줄이 같은 색이라 이은 자리가 보이지 않는다.
// 글 칸은 위에서 19, 아래에서 39 안쪽이다. NPC 칸은 위에서 13, 아래 파란 띠까지 28 이고 그 안에 초상화 + 이름표(19) + 위아래 여백.
// 72 + 13 × 11 = 215 로 창 높이(230) 안에 든다. 가장 큰 초상화(하인즈 150)도 이 높이에 들어간다
const CURRENT_FRAME: DialogFrame = {
  slices: [
    [0, 80],
    [100, 90],
    [349, 170],
  ],
  top: 28,
  row: 13,
  bottom: 44,
  minRows: 5,
  maxRows: 11,
  textMargin: 19 + 39,
  portraitMargin: 13 + 28 + 19 + 5,
  art: npcDialogUrl,
  // 확인 버튼은 _outlink 가 공용 버튼(Basic.img/BtOK4)을 가리킨다
  okArt: (state) => wzImageUrl(`UI/_Canvas/Basic.img/BtOK4/${state}/0`),
};

// 빅뱅 전 대화창(v83 UI/UIWindow.img/UtilDlgEx)은 폭 529 에 t 28 · c 20 · s 58(아래 25px 가 버튼 띠)이다. 베이지 NPC 칸(15~140)을
// 자르면 이름표(121)가 안 들어가서 흰 글 칸(152~507)에서만 한 번(160~349) 잘라 낸다. 글 칸은 위에서 27, 아래에서 57 안쪽이고,
// 이름표는 아래에서 45 에 둔다. 하인즈(150)는 7줄(226)에 위 테두리를 몇 px 덮는다
const CLASSIC_FRAME: DialogFrame = {
  slices: [
    [0, 160],
    [349, 180],
  ],
  top: 28,
  row: 20,
  bottom: 58,
  minRows: 3,
  maxRows: 7,
  textMargin: 27 + 57,
  portraitMargin: 13 + 45 + 19 + 3,
  art: (node) => wzImageUrl(`UI/UIWindow.img/UtilDlgEx/${node}`, 'classic'),
  okArt: (state) => wzImageUrl(`UI/UIWindow.img/UtilDlgEx/BtOK/${state}/0`, 'classic'),
};

export const dialogFrame = (era: Era = 'current'): DialogFrame => (era === 'classic' ? CLASSIC_FRAME : CURRENT_FRAME);

const frameWidth = (frame: DialogFrame) => frame.slices.reduce((sum, [, width]) => sum + width, 0);
export const DIALOG_WIDTH = frameWidth(CURRENT_FRAME);
const FALLBACK_PORTRAIT_HEIGHT = 80;

export const dialogHeight = (rows: number, frame: DialogFrame = CURRENT_FRAME) => frame.top + frame.row * rows + frame.bottom;

/** 글과 초상화가 다 들어가는 가운데 띠 반복 수. 넘치는 글은 글 칸 안에서 스크롤한다 */
export function dialogRows(textHeight: number, portraitHeight: number, frame: DialogFrame = CURRENT_FRAME): number {
  const needed = Math.max(textHeight + frame.textMargin, portraitHeight + frame.portraitMargin);
  const rows = Math.ceil((needed - frame.top - frame.bottom) / frame.row);
  return Math.min(frame.maxRows, Math.max(frame.minRows, rows));
}

type ButtonName = 'close' | 'no' | 'yes' | 'next' | 'ok';
const BUTTON_LABELS: Record<ButtonName, string> = {
  close: '대화 그만하기',
  no: '아니오',
  yes: '예',
  next: '다음',
  ok: '확인',
};
const BUTTON_NODES: Record<Exclude<ButtonName, 'ok'>, string> = { close: 'BtClose', no: 'BtNo', yes: 'BtYes', next: 'BtNext' };
const buttonArt = (name: ButtonName, frame: DialogFrame) => {
  const node = (state: string) => (name === 'ok' ? frame.okArt(state) : frame.art(`${BUTTON_NODES[name]}/${state}/0`));
  return { normal: node('normal'), hover: node('mouseOver'), pressed: node('pressed'), disabled: node('disabled') };
};
// 선택지 앞 화살표. 회색(dot0)이 평소, 빨강(dot1)이 고를 때다. 지금 판도 UIWindow.img 쪽 그림을 쓴다
const DOT_ART: Record<Era, Record<'dot0' | 'dot1', string>> = {
  current: {
    dot0: wzImageUrl('UI/_Canvas/UIWindow.img/UtilDlgEx/dot0'),
    dot1: wzImageUrl('UI/_Canvas/UIWindow.img/UtilDlgEx/dot1'),
  },
  classic: { dot0: CLASSIC_FRAME.art('dot0'), dot1: CLASSIC_FRAME.art('dot1') },
};

export function createNpcDialog(root: HTMLElement): NpcDialog {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <div class="npc-dialog" data-tauri-drag-region hidden>
      <div class="npc-window" role="dialog" tabindex="-1">
        <div class="npc-frame" aria-hidden="true"></div>
        <div class="npc-portrait"></div>
        <div class="npc-name"></div>
        <div class="npc-text" aria-live="polite"></div>
        <div class="npc-buttons"></div>
      </div>
    </div>
    `,
  );
  const overlay = root.querySelector<HTMLElement>('.npc-dialog')!;
  const windowEl = overlay.querySelector<HTMLElement>('.npc-window')!;
  const frame = overlay.querySelector<HTMLElement>('.npc-frame')!;
  const portrait = overlay.querySelector<HTMLElement>('.npc-portrait')!;
  const name = overlay.querySelector<HTMLElement>('.npc-name')!;
  const textBox = overlay.querySelector<HTMLElement>('.npc-text')!;
  const buttonRow = overlay.querySelector<HTMLElement>('.npc-buttons')!;

  let era: Era = 'current';
  let frameArt = CURRENT_FRAME;
  /** 시대마다 틀 그림을 자르는 자리가 달라서 조각을 다시 놓는다 */
  function placePieces() {
    frame.replaceChildren();
    (['t', 'c', 's'] as const).forEach((band) => {
      let left = 0;
      frameArt.slices.forEach(([srcX, width]) => {
        const piece = document.createElement('span');
        piece.className = `npc-piece is-${band}`;
        Object.assign(piece.style, { left: `${left}px`, width: `${width}px`, backgroundPositionX: `${-srcX}px` });
        frame.appendChild(piece);
        left += width;
      });
    });
    windowEl.style.width = `${frameWidth(frameArt)}px`;
  }
  placePieces();

  const buttons = {} as Record<ButtonName, HTMLButtonElement>;
  (Object.keys(BUTTON_LABELS) as ButtonName[]).forEach((key) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `npc-button is-${key} art-button`;
    button.textContent = BUTTON_LABELS[key];
    button.hidden = true;
    buttonRow.appendChild(button);
    buttons[key] = button;
  });

  let current: Conversation | null = null;
  let page: NpcPage | null = null;
  let queue: Conversation[] = [];
  let portraitHeight = FALLBACK_PORTRAIT_HEIGHT;

  function dressUp() {
    applyArt(windowEl, { t: frameArt.art('t'), c: frameArt.art('c'), s: frameArt.art('s') }, 'has-art', layout);
    applyArt(name, { bar: frameArt.art('bar') });
    applyArt(overlay, DOT_ART[era], 'has-dot-art');
    (Object.keys(buttons) as ButtonName[]).forEach((key) => applyArt(buttons[key], buttonArt(key, frameArt)));
  }

  /** 글 높이와 초상화 높이에 맞춰 창 높이를 띠 단위로 정하고 창 가운데에 둔다 */
  function layout() {
    // 글 칸은 위아래가 창에 붙어 있어서 창 높이를 따라 늘어난다. 아래를 풀어 글 높이만 잰다
    textBox.style.bottom = 'auto';
    // WebKit 은 zoom 이 걸린 글의 줄 높이를 확대된 픽셀로 반올림해서 배율마다 글 높이가 몇 px 씩 달라진다.
    // 창 높이(띠 수)가 배율 따라 바뀌지 않게 잠깐 1배로 배치해서 잰다
    overlay.style.zoom = '1';
    const rows = dialogRows(textBox.scrollHeight, portraitHeight, frameArt);
    overlay.style.zoom = '';
    const height = dialogHeight(rows, frameArt);
    windowEl.style.height = `${height}px`;
    // root 는 75% 창에서 줄어 있다. zoom 이 걸린 overlay 로 재야 배율과 무관한 값이 나온다
    windowEl.style.top = `${Math.floor((overlay.clientHeight - height) / 2)}px`;
    windowEl.style.left = `${Math.floor((overlay.clientWidth - frameWidth(frameArt)) / 2)}px`;
    textBox.style.bottom = '';
  }

  // 창 크기를 바꾸면 떠 있던 대화창이 한쪽에 남지 않게 다시 가운데에 둔다
  new ResizeObserver(() => {
    if (!overlay.hidden) layout();
  }).observe(overlay);

  function renderText(target: HTMLElement, text: string) {
    target.replaceChildren(
      ...parseMapleText(text).map((run) => {
        const span = document.createElement('span');
        span.className = `npc-color-${run.color}`;
        span.textContent = run.text;
        return span;
      }),
    );
  }

  function renderPortrait(npc: Npc) {
    if (portrait.dataset.npc === String(npc.id)) return;
    portrait.dataset.npc = String(npc.id);
    portrait.replaceChildren();
    portraitHeight = FALLBACK_PORTRAIT_HEIGHT;
    const url = npcStandUrl(npc.id);
    loadWithRetry(url).then(
      () => {
        if (portrait.dataset.npc !== String(npc.id)) return;
        portrait.appendChild(
          loadedImage(url, (image) => {
            // 원본 크기 그대로. 가운데 정렬을 정수 픽셀로 맞춰야 1배 화면에서 뭉개지지 않는다
            image.style.left = `${-Math.floor(image.naturalWidth / 2)}px`;
            portraitHeight = image.naturalHeight;
            layout();
          }),
        );
      },
      () => {},
    );
  }

  function render(next: NpcPage) {
    page = next;
    renderPortrait(next.npc);
    name.textContent = next.npc.name;
    renderText(textBox, next.text);
    if (next.options?.length) {
      const list = document.createElement('div');
      list.className = 'npc-options';
      next.options.forEach((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'npc-option';
        button.innerHTML = '<span class="npc-dot" aria-hidden="true"></span>';
        button.append(option.label);
        button.disabled = option.disabled === true;
        button.addEventListener('click', option.select);
        list.appendChild(button);
      });
      textBox.appendChild(list);
    }
    buttons.close.hidden = false;
    (['no', 'yes', 'next', 'ok'] as const).forEach((key) => (buttons[key].hidden = !next[key]));
    textBox.scrollTop = 0;
    layout();
  }

  function begin(conversation: Conversation) {
    current = conversation;
    overlay.classList.toggle('is-passive', conversation.passive);
    windowEl.setAttribute('aria-modal', String(!conversation.passive));
    overlay.hidden = false;
    dressUp();
    portrait.dataset.npc = '';
    render(conversation.first);
    // 축하 창은 게임을 막지 않으니 포커스를 가져오지 않는다
    if (!conversation.passive) windowEl.focus({ preventScroll: true });
  }

  function end() {
    current = null;
    page = null;
    overlay.hidden = true;
    const [next, ...rest] = queue;
    queue = rest;
    if (next) begin(next);
  }

  function dismiss() {
    const onDismiss = current?.onDismiss;
    end();
    onDismiss?.();
  }

  buttons.close.addEventListener('click', dismiss);
  (['no', 'yes', 'next', 'ok'] as const).forEach((key) =>
    buttons[key].addEventListener('click', () => page?.[key]?.()),
  );
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') dismiss();
  });

  return {
    setEra(next) {
      if (next === era) return;
      era = next;
      frameArt = dialogFrame(era);
      overlay.dataset.era = era;
      placePieces();
      // 앞 시대 그림이 입혀 있으면 applyArt 가 건너뛰어서 표시를 지우고 다시 입힌다
      [windowEl, name, ...Object.values(buttons)].forEach((element) => element.classList.remove('has-art'));
      overlay.classList.remove('has-dot-art');
      if (!overlay.hidden) {
        dressUp();
        layout();
      }
    },
    open(key, first, passive = false, onDismiss) {
      if (current?.key === key) {
        // 축하 창이 떠 있는 사이 또 전직하면 새 축하로 바꾼다. 직업 선택은 고르던 쪽을 그대로 둔다
        if (passive) render(first);
        return;
      }
      const conversation = { key, first, passive, onDismiss };
      if (current) queue = queueConversation(queue, conversation);
      else begin(conversation);
    },
    show(next) {
      if (current) render(next);
    },
    end,
    cancel(key) {
      queue = queue.filter((each) => each.key !== key);
      if (current?.key === key) end();
    },
    clear() {
      queue = [];
      if (current) end();
    },
    isOpen: () => current !== null,
  };
}

// ── 전직 대화 ──────────────────────────────────────────────

/** 메이플 아일랜드에서 모험가에게 직업을 소개하는 NPC */
const GUIDE: Npc = { id: 12100, name: '마이' };

interface Instructor {
  npc: Npc;
  intro: string;
  confirm: string;
  /** jobName 은 「파이터」처럼 차수를 뺀 이름 */
  congratulate(tier: number, jobName: string): string;
  /** 2차 전직 때 갈래를 묻는 말 */
  askBranch: string;
  /** path 는 「크루세이더 → 히어로」처럼 이어지는 3·4차 */
  confirmBranch(jobName: string, path: string): string;
  /** 갈래를 바꾸러 왔을 때. 값과 가진 메소는 그 아래 줄에 붙는다 */
  askChange(current: string): string;
  /** 갈래가 생기기 전 캐릭터에게 한 번 무료로 다시 고르게 할 때 */
  offerFree(current: string): string;
  confirmChange(jobName: string): string;
}

/** 직업 이름만 파랗게 칠하고 뒤 조사는 검게 둔다 */
const blueWithJosa = (word: string, withFinal: string, withoutFinal: string) =>
  `#b${word}#k${hasFinalConsonant(word) ? withFinal : withoutFinal}`;

/** 1차 전직관. 2차 갈래 고르기·갈래 바꾸기와 2차부터의 축하도 같은 전직관이 한다 */
const INSTRUCTORS: Record<JobLineId, Instructor> = {
  warrior: {
    npc: { id: 1022000, name: '주먹펴고 일어서' },
    intro: '페리온의 전사 전직관, 주먹펴고 일어서다.\n전사는 강한 힘과 체력으로 맨 앞에서 싸우지.',
    confirm: '정말 #b전사#k가 되겠나?\n한번 정한 길은 되돌릴 수 없다.',
    congratulate: (tier, jobName) => `${tier}차 전직을 축하한다.\n이제 자네는 ${blueWithJosa(jobName, '이다', '다')}.\n더 강해져라.`,
    askBranch: '2차 전직을 할 때가 됐군.\n전사의 길은 셋이다. #b어느 길로 가겠나?#k',
    confirmBranch: (jobName, path) => `정말 #b${jobName}#k의 길을 걷겠나?\n${path}로 이어지는 길이다.`,
    askChange: (current) => `지금은 #b${current}#k의 길을 걷고 있군.\n같은 전사의 다른 길로 바꿔 주겠다.`,
    offerFree: (current) =>
      `전사의 길이 셋으로 갈라졌다.\n지금은 #b${current}#k의 길이지.\n이번 한 번은 공짜로 다른 길로 바꿔 주겠다.`,
    confirmChange: (jobName) => `${blueWithJosa(jobName, '으로', '로')} 바꾸겠나?\n레벨과 경험치, 기록은 그대로다.`,
  },
  magician: {
    npc: { id: 1032001, name: '하인즈' },
    intro: '엘리니아의 마법사 전직관 하인즈라네.\n마법사는 지혜로 마법을 다뤄 멀리서 적을 물리치지.',
    confirm: '정말 #b마법사#k의 길을 걷겠나?\n한번 정하면 되돌릴 수 없다네.',
    congratulate: (tier, jobName) =>
      `${tier}차 전직을 축하하네.\n이제 자네는 ${blueWithJosa(jobName, '이라네', '라네')}.\n지혜를 더 갈고닦게.`,
    askBranch: '2차 전직을 할 때가 되었군.\n마법사의 길은 셋이라네. #b어느 마법을 익히겠나?#k',
    confirmBranch: (jobName, path) => `#b${jobName}#k의 길을 걷겠나?\n${path}로 이어진다네.`,
    askChange: (current) => `지금은 #b${current}#k의 길을 걷고 있군.\n다른 마법을 익히고 싶은가?`,
    offerFree: (current) =>
      `마법사의 길이 셋으로 나뉘었다네.\n자네는 지금 ${blueWithJosa(current, '이', '')}지.\n이번 한 번은 값 없이 다른 길로 바꿔 주겠네.`,
    confirmChange: (jobName) => `${blueWithJosa(jobName, '으로', '로')} 바꾸겠나?\n레벨과 경험치, 기록은 그대로라네.`,
  },
  archer: {
    npc: { id: 1012100, name: '헬레나' },
    intro: '헤네시스의 궁수 전직관 헬레나예요.\n궁수는 빠른 몸놀림으로 먼 곳의 적을 활로 맞히죠.',
    confirm: '정말 #b궁수#k가 되겠어요?\n한번 정하면 되돌릴 수 없어요.',
    congratulate: (tier, jobName) =>
      `${tier}차 전직 축하해요!\n이제 ${blueWithJosa(jobName, '이에요', '예요')}.\n앞으로도 힘내요.`,
    askBranch: '2차 전직할 때가 됐네요.\n활과 석궁, #b어느 쪽을 쥘래요?#k',
    confirmBranch: (jobName, path) => `#b${jobName}#k의 길로 갈래요?\n${path}로 이어져요.`,
    askChange: (current) => `지금은 #b${current}#k의 길이네요.\n다른 길로 바꿔 줄까요?`,
    offerFree: (current) =>
      `궁수의 길이 둘로 나뉘었어요.\n지금은 ${blueWithJosa(current, '이에요', '예요')}.\n이번 한 번은 그냥 바꿔 줄게요.`,
    confirmChange: (jobName) => `${blueWithJosa(jobName, '으로', '로')} 바꿀래요?\n레벨과 경험치, 기록은 그대로예요.`,
  },
  thief: {
    npc: { id: 1052001, name: '다크로드' },
    intro: '커닝시티의 도적 전직관, 다크로드다.\n도적은 재빠른 몸놀림으로 적의 빈틈을 노린다.',
    confirm: '#b도적#k이 되겠나?\n한번 정하면 돌이킬 수 없다.',
    congratulate: (tier, jobName) => `${tier}차 전직이다.\n이제 넌 ${blueWithJosa(jobName, '이다', '다')}.\n그림자처럼 더 날카로워져라.`,
    askBranch: '2차 전직이다.\n표창이냐 단검이냐. #b골라라.#k',
    confirmBranch: (jobName, path) => `${blueWithJosa(jobName, '이', '가')} 되겠나?\n${path}로 이어진다.`,
    askChange: (current) => `지금은 ${blueWithJosa(current, '이', '')}군.\n다른 길을 원하나?`,
    offerFree: (current) => `도적의 길이 둘로 갈렸다.\n넌 지금 ${blueWithJosa(current, '이다', '다')}.\n이번 한 번은 값 없이 바꿔 주지.`,
    confirmChange: (jobName) => `${blueWithJosa(jobName, '으로', '로')} 바꾸겠나?\n레벨과 경험치, 기록은 그대로다.`,
  },
  pirate: {
    npc: { id: 1090000, name: '카이린' },
    intro: '노틸러스의 해적 전직관 카이린이야.\n해적은 주먹과 총으로 바다를 누비지.',
    confirm: '정말 #b해적#k이 될 거야?\n한번 정하면 되돌릴 수 없어.',
    congratulate: (tier, jobName) =>
      `${tier}차 전직 축하해!\n이제 넌 ${blueWithJosa(jobName, '이야', '야')}.\n더 넓은 바다로 가 보자고!`,
    askBranch: '2차 전직할 때가 됐네.\n주먹이야, 총이야? #b골라 봐.#k',
    confirmBranch: (jobName, path) => `${blueWithJosa(jobName, '이', '가')} 될 거야?\n${path}로 이어지는 길이야.`,
    askChange: (current) => `지금은 ${blueWithJosa(current, '이', '')}구나.\n다른 길로 바꾸고 싶어?`,
    offerFree: (current) =>
      `해적의 길이 둘로 나뉘었어.\n넌 지금 ${blueWithJosa(current, '이야', '야')}.\n이번 한 번은 공짜로 바꿔 줄게.`,
    confirmChange: (jobName) => `${blueWithJosa(jobName, '으로', '로')} 바꿀 거야?\n레벨과 경험치, 기록은 그대로야.`,
  },
};

export const JOB_CHOICE_KEY = 'job-choice';
export const BRANCH_CHOICE_KEY = 'branch-choice';
const JOB_CHANGE_KEY = 'job-change';
const CONGRATULATION_KEY = 'job-congratulation';

/** 초상화를 미리 받아 둬서 전직관 쪽으로 넘어갈 때 창 높이가 늦게 바뀌지 않게 한다 */
function preloadPortraits() {
  [GUIDE, ...Object.values(INSTRUCTORS).map((each) => each.npc)].forEach((npc) =>
    loadWithRetry(npcStandUrl(npc.id)).catch(() => {}),
  );
}

/** 마이가 직업을 묻고, 고른 직업의 전직관이 소개한 뒤 「예」를 누르면 onChoose 를 부른다 */
export function openJobChoice(dialog: NpcDialog, onChoose: (id: JobLineId) => void): void {
  preloadPortraits();
  const ask: NpcPage = {
    npc: GUIDE,
    text: '전직할 때가 됐구나! 이제 진짜 모험가가 될 차례야.\n#b어떤 길을 걷고 싶어?#k',
    options: Object.values(JOB_LINES).map((line) => ({
      label: line.className,
      select: () => {
        const instructor = INSTRUCTORS[line.id];
        dialog.show({
          npc: instructor.npc,
          text: instructor.intro,
          next: () =>
            dialog.show({
              npc: instructor.npc,
              text: instructor.confirm,
              no: () => dialog.show(ask),
              yes: () => {
                dialog.end();
                onChoose(line.id);
              },
            }),
        });
      },
    })),
  };
  dialog.open(JOB_CHOICE_KEY, ask);
}

/** 선택지에 붙이는 갈래 이름. 「건슬링어 → 발키리 → 캡틴」 */
export const branchRoute = (id: JobBranchId, era: Era = 'current'): string => jobBranches(era)[id].names.join(' → ');
const laterNames = (id: JobBranchId, era: Era) => jobBranches(era)[id].names.slice(1).join(', ');

/** 2차 전직 레벨에 그 계열 전직관이 갈래를 묻는다. 「예」를 누르면 onChoose 를 부른다 */
export function openBranchChoice(
  dialog: NpcDialog,
  line: JobLineId,
  onChoose: (id: JobBranchId) => void,
  era: Era = 'current',
): void {
  const instructor = INSTRUCTORS[line];
  const ask: NpcPage = {
    npc: instructor.npc,
    text: instructor.askBranch,
    options: JOB_LINES[line].branches.map((id) => ({
      label: branchRoute(id, era),
      select: () =>
        dialog.show({
          npc: instructor.npc,
          text: instructor.confirmBranch(jobBranches(era)[id].names[0], laterNames(id, era)),
          no: () => dialog.show(ask),
          yes: () => {
            dialog.end();
            onChoose(id);
          },
        }),
    })),
  };
  dialog.open(BRANCH_CHOICE_KEY, ask);
}

export interface JobChangeOffer {
  current: JobBranchId;
  /** 지금 차수. 대화의 직업 이름을 지금 차수 이름(바이퍼·캡틴)으로 적는다 */
  tier: number;
  /** 갈래가 생기기 전 캐릭터의 한 번. 값을 받지 않고 「지금 그대로」도 고를 수 있다 */
  free: boolean;
  price: number;
  meso: number;
  /** 클래식은 빅뱅 전 이름(드래곤나이트)으로 적는다 */
  era?: Era;
}

export interface JobChangeHandlers {
  onChange(to: JobBranchId): void;
  /** 무료 다시 고르기에서 지금 갈래를 그대로 두거나 대화를 닫았을 때 */
  onKeep(): void;
}

const mesoText = (value: number) => Math.floor(value).toLocaleString();

/** 값과 가진 메소. 모자라면 왜 못 고르는지 빨갛게 적는다. 무료 한 번은 전직관 말에 들어 있다 */
export function jobChangePriceText(offer: Pick<JobChangeOffer, 'free' | 'price' | 'meso'>): string {
  if (offer.free) return '';
  const lines = [`값: #r${mesoText(offer.price)} 메소#k`, `가진 메소: ${mesoText(offer.meso)}`];
  if (offer.meso < offer.price) lines.push(`#r메소가 ${mesoText(offer.price - offer.meso)} 모자라 바꿀 수 없다#k`);
  return lines.join('\n');
}

/** 같은 계열의 다른 갈래로 바꾸는 대화. 값을 내는 바꾸기는 「예」로 한 번 더 묻는다 */
export function openJobChange(dialog: NpcDialog, offer: JobChangeOffer, handlers: JobChangeHandlers): void {
  const line = JOB_BRANCHES[offer.current].line;
  const instructor = INSTRUCTORS[line];
  const era = offer.era ?? 'current';
  const current = tierName(offer.current, offer.tier, era);
  const poor = !offer.free && offer.meso < offer.price;
  const others = JOB_LINES[line].branches.filter((id) => id !== offer.current);
  const ask: NpcPage = {
    npc: instructor.npc,
    text: offer.free ? instructor.offerFree(current) : `${instructor.askChange(current)}\n${jobChangePriceText(offer)}`,
    options: [
      ...others.map((id) => ({
        label: branchRoute(id, era),
        disabled: poor,
        select: () =>
          dialog.show({
            npc: instructor.npc,
            text: `${instructor.confirmChange(tierName(id, offer.tier, era))}${offer.free ? '' : `\n#r${mesoText(offer.price)} 메소#k를 낸다.`}`,
            no: () => dialog.show(ask),
            yes: () => {
              dialog.end();
              handlers.onChange(id);
            },
          }),
      })),
      ...(offer.free
        ? [
            {
              label: `지금 그대로 (${current})`,
              select: () => {
                dialog.end();
                handlers.onKeep();
              },
            },
          ]
        : []),
    ],
  };
  dialog.open(JOB_CHANGE_KEY, ask, false, offer.free ? handlers.onKeep : undefined);
}

/** 2차부터 6차까지. 게임은 계속 돌고 「확인」으로 닫는다 */
export function openAdvancementCongratulation(dialog: NpcDialog, path: JobPath, tier: number, era: Era = 'current'): void {
  const instructor = INSTRUCTORS[lineOf(path)];
  dialog.open(
    CONGRATULATION_KEY,
    { npc: instructor.npc, text: instructor.congratulate(tier, tierName(path, tier, era)), ok: () => dialog.end() },
    true,
  );
}

/** OS 알림에 적는 전직관 이름 */
export const instructorName = (line: JobLineId): string => INSTRUCTORS[line].npc.name;
