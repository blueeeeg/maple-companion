import { JOB_LINES, type JobLineId } from '../game/jobs';
import { npcDialogUrl, npcStandUrl, wzImageUrl } from '../maple/api';
import { applyArt, loadWithRetry, loadedImage } from './art';

export interface Npc {
  id: number;
  name: string;
}

export interface NpcOption {
  label: string;
  select(): void;
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
  open(key: string, first: NpcPage, passive?: boolean): void;
  /** 지금 대화의 다음 쪽 */
  show(page: NpcPage): void;
  /** 지금 대화를 닫고 기다리던 대화가 있으면 연다 */
  end(): void;
  /** 그 key 의 대화를 열려 있든 기다리든 버린다 */
  cancel(key: string): void;
  clear(): void;
}

export interface Conversation {
  key: string;
  first: NpcPage;
  passive: boolean;
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

// 원작 대화창(UI/UIWindow2.img/UtilDlgEx)은 폭 519 에 위(t, 28)·가운데(c, 13 을 세로로 반복)·아래(s, 44) 세 띠다.
// 360 창에 맞추려고 원본 크기 그대로 두고 세로로 한 줄씩 똑같은 구간 두 곳(NPC 칸 80~100, 글 칸 190~349)을 잘라 낸다.
// 잘라 낸 양옆 줄이 같은 색이라 이은 자리가 보이지 않는다
const SLICES: [srcX: number, width: number][] = [
  [0, 80],
  [100, 90],
  [349, 170],
];
export const DIALOG_WIDTH = SLICES.reduce((sum, [, width]) => sum + width, 0);
const TOP_HEIGHT = 28;
const ROW_HEIGHT = 13;
const BOTTOM_HEIGHT = 44;
const MIN_ROWS = 5;
/** 72 + 13 × 11 = 215 로 창 높이(230) 안에 든다. 가장 큰 초상화(하인즈 150)도 이 높이에 들어간다 */
const MAX_ROWS = 11;
/** 글 칸은 위에서 19, 아래에서 39 안쪽이다 */
const TEXT_MARGIN = 19 + 39;
/** NPC 칸은 위에서 13, 아래 파란 띠까지 28. 그 안에 초상화 + 이름표(19) + 위아래 여백 */
const PORTRAIT_MARGIN = 13 + 28 + 19 + 5;
const FALLBACK_PORTRAIT_HEIGHT = 80;

export const dialogHeight = (rows: number) => TOP_HEIGHT + ROW_HEIGHT * rows + BOTTOM_HEIGHT;

/** 글과 초상화가 다 들어가는 가운데 띠 반복 수. 넘치는 글은 글 칸 안에서 스크롤한다 */
export function dialogRows(textHeight: number, portraitHeight: number): number {
  const needed = Math.max(textHeight + TEXT_MARGIN, portraitHeight + PORTRAIT_MARGIN);
  const rows = Math.ceil((needed - TOP_HEIGHT - BOTTOM_HEIGHT) / ROW_HEIGHT);
  return Math.min(MAX_ROWS, Math.max(MIN_ROWS, rows));
}

type ButtonName = 'close' | 'no' | 'yes' | 'next' | 'ok';
const BUTTON_LABELS: Record<ButtonName, string> = {
  close: '대화 그만하기',
  no: '아니오',
  yes: '예',
  next: '다음',
  ok: '확인',
};
// 확인 버튼은 _outlink 가 공용 버튼(Basic.img/BtOK4)을 가리킨다
const BUTTON_NODES: Record<ButtonName, (state: string) => string> = {
  close: (state) => npcDialogUrl(`BtClose/${state}/0`),
  no: (state) => npcDialogUrl(`BtNo/${state}/0`),
  yes: (state) => npcDialogUrl(`BtYes/${state}/0`),
  next: (state) => npcDialogUrl(`BtNext/${state}/0`),
  ok: (state) => wzImageUrl(`UI/_Canvas/Basic.img/BtOK4/${state}/0`),
};
const buttonArt = (name: ButtonName) => ({
  normal: BUTTON_NODES[name]('normal'),
  hover: BUTTON_NODES[name]('mouseOver'),
  pressed: BUTTON_NODES[name]('pressed'),
  disabled: BUTTON_NODES[name]('disabled'),
});
// 선택지 앞 화살표. 회색(dot0)이 평소, 빨강(dot1)이 고를 때다
const DOT_ART = {
  dot0: wzImageUrl('UI/_Canvas/UIWindow.img/UtilDlgEx/dot0'),
  dot1: wzImageUrl('UI/_Canvas/UIWindow.img/UtilDlgEx/dot1'),
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

  (['t', 'c', 's'] as const).forEach((band) => {
    let left = 0;
    SLICES.forEach(([srcX, width]) => {
      const piece = document.createElement('span');
      piece.className = `npc-piece is-${band}`;
      Object.assign(piece.style, { left: `${left}px`, width: `${width}px`, backgroundPositionX: `${-srcX}px` });
      frame.appendChild(piece);
      left += width;
    });
  });
  windowEl.style.width = `${DIALOG_WIDTH}px`;

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
    applyArt(windowEl, { t: npcDialogUrl('t'), c: npcDialogUrl('c'), s: npcDialogUrl('s') }, 'has-art', layout);
    applyArt(name, { bar: npcDialogUrl('bar') });
    applyArt(overlay, DOT_ART, 'has-dot-art');
    (Object.keys(buttons) as ButtonName[]).forEach((key) => applyArt(buttons[key], buttonArt(key)));
  }

  /** 글 높이와 초상화 높이에 맞춰 창 높이를 띠 단위로 정하고 창 가운데에 둔다 */
  function layout() {
    // 글 칸은 위아래가 창에 붙어 있어서 창 높이를 따라 늘어난다. 아래를 풀어 글 높이만 잰다
    textBox.style.bottom = 'auto';
    // WebKit 은 zoom 이 걸린 글의 줄 높이를 확대된 픽셀로 반올림해서 배율마다 글 높이가 몇 px 씩 달라진다.
    // 창 높이(띠 수)가 배율 따라 바뀌지 않게 잠깐 1배로 배치해서 잰다
    overlay.style.zoom = '1';
    const rows = dialogRows(textBox.scrollHeight, portraitHeight);
    overlay.style.zoom = '';
    const height = dialogHeight(rows);
    windowEl.style.height = `${height}px`;
    // root 는 창 배율만큼 커져 있다. zoom 이 걸린 overlay 로 재야 배율과 무관한 360x230 기준 값이 나온다
    windowEl.style.top = `${Math.floor((overlay.clientHeight - height) / 2)}px`;
    windowEl.style.left = `${Math.floor((overlay.clientWidth - DIALOG_WIDTH) / 2)}px`;
    textBox.style.bottom = '';
  }

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

  buttons.close.addEventListener('click', end);
  (['no', 'yes', 'next', 'ok'] as const).forEach((key) =>
    buttons[key].addEventListener('click', () => page?.[key]?.()),
  );
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') end();
  });

  return {
    open(key, first, passive = false) {
      if (current?.key === key) {
        // 축하 창이 떠 있는 사이 또 전직하면 새 축하로 바꾼다. 직업 선택은 고르던 쪽을 그대로 둔다
        if (passive) render(first);
        return;
      }
      const conversation = { key, first, passive };
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
}

/** 직업 이름만 파랗게 칠하고 뒤 조사는 검게 둔다 */
const blueWithJosa = (word: string, withFinal: string, withoutFinal: string) =>
  `#b${word}#k${hasFinalConsonant(word) ? withFinal : withoutFinal}`;

/** 1차 전직관. 2차부터도 같은 전직관이 축하한다 */
const INSTRUCTORS: Record<JobLineId, Instructor> = {
  warrior: {
    npc: { id: 1022000, name: '주먹펴고 일어서' },
    intro: '페리온의 전사 전직관, 주먹펴고 일어서다.\n전사는 강한 힘과 체력으로 맨 앞에서 싸우지.',
    confirm: '정말 #b전사#k가 되겠나?\n한번 정한 길은 되돌릴 수 없다.',
    congratulate: (tier, jobName) => `${tier}차 전직을 축하한다.\n이제 자네는 ${blueWithJosa(jobName, '이다', '다')}.\n더 강해져라.`,
  },
  magician: {
    npc: { id: 1032001, name: '하인즈' },
    intro: '엘리니아의 마법사 전직관 하인즈라네.\n마법사는 지혜로 마법을 다뤄 멀리서 적을 물리치지.',
    confirm: '정말 #b마법사#k의 길을 걷겠나?\n한번 정하면 되돌릴 수 없다네.',
    congratulate: (tier, jobName) =>
      `${tier}차 전직을 축하하네.\n이제 자네는 ${blueWithJosa(jobName, '이라네', '라네')}.\n지혜를 더 갈고닦게.`,
  },
  archer: {
    npc: { id: 1012100, name: '헬레나' },
    intro: '헤네시스의 궁수 전직관 헬레나예요.\n궁수는 빠른 몸놀림으로 먼 곳의 적을 활로 맞히죠.',
    confirm: '정말 #b궁수#k가 되겠어요?\n한번 정하면 되돌릴 수 없어요.',
    congratulate: (tier, jobName) =>
      `${tier}차 전직 축하해요!\n이제 ${blueWithJosa(jobName, '이에요', '예요')}.\n앞으로도 힘내요.`,
  },
  thief: {
    npc: { id: 1052001, name: '다크로드' },
    intro: '커닝시티의 도적 전직관, 다크로드다.\n도적은 재빠른 몸놀림으로 적의 빈틈을 노린다.',
    confirm: '#b도적#k이 되겠나?\n한번 정하면 돌이킬 수 없다.',
    congratulate: (tier, jobName) => `${tier}차 전직이다.\n이제 넌 ${blueWithJosa(jobName, '이다', '다')}.\n그림자처럼 더 날카로워져라.`,
  },
  pirate: {
    npc: { id: 1090000, name: '카이린' },
    intro: '노틸러스의 해적 전직관 카이린이야.\n해적은 주먹과 총으로 바다를 누비지.',
    confirm: '정말 #b해적#k이 될 거야?\n한번 정하면 되돌릴 수 없어.',
    congratulate: (tier, jobName) =>
      `${tier}차 전직 축하해!\n이제 넌 ${blueWithJosa(jobName, '이야', '야')}.\n더 넓은 바다로 가 보자고!`,
  },
};

export const JOB_CHOICE_KEY = 'job-choice';
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

/** 2차부터 6차까지. 게임은 계속 돌고 「확인」으로 닫는다 */
export function openAdvancementCongratulation(dialog: NpcDialog, jobLine: JobLineId, tier: number): void {
  const instructor = INSTRUCTORS[jobLine];
  const jobName = JOB_LINES[jobLine].names[Math.min(tier, 4) - 1];
  dialog.open(
    CONGRATULATION_KEY,
    { npc: instructor.npc, text: instructor.congratulate(tier, jobName), ok: () => dialog.end() },
    true,
  );
}
