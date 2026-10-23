import { ADVANCEMENT_LEVELS } from '../game/jobs';
import { type AdvancementLog, type BossRecord, formatDay, formatTogetherTime } from '../game/records';
import { MESO_HUD_ICON_URL, characterAnimationUrl, wzImageUrl } from '../maple/api';
import { applyArt, loadedImage } from './art';
import { PRIORITY, loadImageAsset, readyImage } from './cashAssets';

export interface StatWindowState {
  name: string;
  level: number;
  jobTitle: string;
  /** 0 이면 초보자 */
  tier: number;
  xpIntoLevel: number;
  xpForLevel: number;
  ratio: number;
  /** 이 캐릭터로 쌓인 활동 시간 */
  activeSeconds: number;
  /** 치른 사냥 수(보스 포함) */
  hunts: number;
  bosses: BossRecord;
  meso: number;
  advancedAt: AdvancementLog;
  /** 맵 캐릭터와 같은 모습(캐시 아이템 포함) */
  look: number[];
}

export interface StatWindowHandlers {
  onClose(): void;
}

export interface StatWindow {
  show(state: StatWindowState): void;
  /** 열려 있는 동안 늘어난 기록(함께한 시간·경험치 등)을 다시 적는다. 모습이 같으면 그림은 다시 받지 않는다 */
  update(state: StatWindowState): void;
  hide(): void;
}

// 원작 캐릭터 정보창(UIWindow2.img/UserInfo/character). 창 틀(272×226, 아래 버튼 줄을 빼고 206)·안쪽 판(259×174)·캐릭터 칸(97×165)·이름표(89×19)를
// 원본 크기 그대로 원작 자리에 둔다. 원작 판의 항목(인기도·길드…)은 이 앱에 없는 값이라 그 자리를 같은 모양의 칸으로 덮는다
const ui = (path: string) => wzImageUrl(`UI/_Canvas/${path}`);
const ART = {
  frame: ui('UIWindow2.img/UserInfo/character/backgrnd'),
  board: ui('UIWindow2.img/UserInfo/character/backgrnd2'),
  stage: ui('UIWindow2.img/UserInfo/character/charBackgrnd'),
  plate: ui('UIWindow2.img/UserInfo/character/name'),
};
const CLOSE_ART = {
  normal: ui('Basic.img/BtClose3/normal/0'),
  hover: ui('Basic.img/BtClose3/mouseOver/0'),
  pressed: ui('Basic.img/BtClose3/pressed/0'),
  disabled: ui('Basic.img/BtClose3/normal/0'),
};

type Page = 'summary' | 'advancements';
type RowKey = 'level' | 'job' | 'exp' | 'hunts' | 'bosses' | 'meso' | 'advancement';

const number = (value: number) => Math.floor(value).toLocaleString();

function advancementText(tier: number, log: AdvancementLog, reached: number): string {
  if (tier > reached) return `Lv.${ADVANCEMENT_LEVELS[tier - 1]}에 전직`;
  const at = log[tier as keyof AdvancementLog];
  return typeof at === 'number' ? formatDay(at) : '기록 전';
}

function summaryValues(state: StatWindowState): Record<RowKey, { text: string; title?: string }> {
  const { strongest, total } = state.bosses;
  return {
    level: { text: `Lv.${state.level}` },
    job: { text: state.jobTitle, title: state.jobTitle },
    exp: {
      text:
        state.xpForLevel > 0
          ? `${number(state.xpIntoLevel)} / ${number(state.xpForLevel)} (${(state.ratio * 100).toFixed(1)}%)`
          : 'MAX',
    },
    hunts: { text: `${number(state.hunts)}번`, title: '잡은 몬스터 수. 보스도 한 번으로 센다' },
    bosses: strongest
      ? { text: `${number(total)}번 · ${strongest.name}`, title: `지금까지 잡은 가장 센 보스는 ${strongest.name}` }
      : { text: '아직 없음' },
    meso: { text: number(state.meso) },
    advancement: {
      text: state.tier === 0 ? '아직 전직 전' : `${state.tier}차 · ${advancementText(state.tier, state.advancedAt, state.tier)}`,
      title: '눌러서 차수별 전직 날짜 보기',
    },
  };
}

const SUMMARY_LABELS: [RowKey, string][] = [
  ['level', '레벨'],
  ['job', '직업'],
  ['exp', '경험치'],
  ['hunts', '사냥'],
  ['bosses', '보스'],
  ['meso', '메소'],
  ['advancement', '전직'],
];

export function createStatWindow(root: HTMLElement, handlers: StatWindowHandlers): StatWindow {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <section class="info-screen stat-screen" hidden>
      <div class="stat-window" role="dialog" aria-label="캐릭터 정보">
        <p class="stat-title" data-tauri-drag-region>캐릭터 정보</p>
        <button class="stat-close art-button" type="button" aria-label="닫기">✕</button>
        <div class="stat-board"></div>
        <div class="stat-stage"><img alt="" hidden /></div>
        <p class="stat-name"></p>
        <div class="stat-together" data-tauri-drag-region>
          <span>함께한 시간</span>
          <strong></strong>
        </div>
        <dl class="stat-rows"></dl>
      </div>
    </section>
    `,
  );

  const pick = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const screen = pick('.stat-screen');
  const frame = pick('.stat-window');
  const close = pick<HTMLButtonElement>('.stat-close');
  const board = pick('.stat-board');
  const stage = pick('.stat-stage');
  const avatar = pick<HTMLImageElement>('.stat-stage img');
  const name = pick('.stat-name');
  const together = pick('.stat-together strong');
  const rows = pick('.stat-rows');

  let state: StatWindowState | null = null;
  let page: Page = 'summary';
  let lookUrl = '';
  /** 지금 쪽의 값 칸. 틱마다 칸을 새로 만들지 않고 글자만 바꿔서 누르고 있던 버튼의 포커스가 남는다 */
  let cells = new Map<string, HTMLElement>();
  const mesoAmount = document.createElement('span');

  function addRow(key: string, label: string, action?: { run: () => void; label: string }) {
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stat-row-button';
      button.textContent = label;
      button.setAttribute('aria-label', action.label);
      button.addEventListener('click', action.run);
      term.appendChild(button);
    } else term.textContent = label;
    rows.append(term, detail);
    cells.set(key, detail);
    return detail;
  }

  function buildPage() {
    rows.replaceChildren();
    cells = new Map();
    rows.classList.toggle('is-advancements', page === 'advancements');
    if (page === 'summary') {
      SUMMARY_LABELS.forEach(([key, label]) => {
        const detail = addRow(
          key,
          label,
          key === 'advancement' ? { run: () => setPage('advancements'), label: '전직 기록 보기' } : undefined,
        );
        if (key === 'meso') {
          detail.className = 'stat-meso';
          // 아이콘을 못 받으면 금액만 남는다
          detail.append(loadedImage(MESO_HUD_ICON_URL), mesoAmount);
        }
      });
      return;
    }
    ADVANCEMENT_LEVELS.forEach((_, index) => addRow(`tier${index + 1}`, `${index + 1}차`));
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'stat-back';
    back.textContent = '◀ 돌아가기';
    back.addEventListener('click', () => setPage('summary'));
    rows.appendChild(back);
  }

  function fillPage(current: StatWindowState) {
    if (page === 'summary') {
      Object.entries(summaryValues(current)).forEach(([key, { text, title }]) => {
        const cell = key === 'meso' ? mesoAmount : cells.get(key);
        if (!cell) return;
        cell.textContent = text;
        cells.get(key)!.title = title ?? '';
      });
      return;
    }
    ADVANCEMENT_LEVELS.forEach((_, index) => {
      cells.get(`tier${index + 1}`)!.textContent = advancementText(index + 1, current.advancedAt, current.tier);
    });
  }

  function renderLook(current: StatWindowState) {
    const url = characterAnimationUrl(current.look, 'stand1');
    if (url === lookUrl) return;
    lookUrl = url;
    const place = (src: string) => {
      if (lookUrl !== url) return;
      avatar.onload = () => {
        avatar.style.setProperty('--half-width', `${Math.floor(avatar.naturalWidth / 2)}px`);
        avatar.style.setProperty('--half-height', `${Math.floor(avatar.naturalHeight / 2)}px`);
        avatar.hidden = false;
      };
      avatar.src = src;
    };
    // 맵 캐릭터·캐시샵 미리보기와 같은 주소라 받아 둔 그림이 있으면 그대로 쓴다
    const ready = readyImage(url);
    if (ready) place(ready);
    else loadImageAsset(url, PRIORITY.preview).then(place, () => {});
  }

  function render() {
    if (!state) return;
    name.textContent = state.name;
    together.textContent = formatTogetherTime(state.activeSeconds);
    fillPage(state);
    renderLook(state);
  }

  function setPage(next: Page) {
    page = next;
    buildPage();
    render();
    rows.querySelector<HTMLButtonElement>('button')?.focus();
  }

  close.addEventListener('click', handlers.onClose);
  screen.addEventListener('click', (event) => {
    if (event.target === screen) handlers.onClose();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || screen.hidden) return;
    if (page !== 'summary') setPage('summary');
    else handlers.onClose();
  });

  return {
    show(next) {
      state = next;
      page = 'summary';
      buildPage();
      applyArt(frame, { frame: ART.frame }, 'has-frame-art');
      applyArt(board, { board: ART.board });
      applyArt(stage, { stage: ART.stage });
      applyArt(name, { plate: ART.plate });
      applyArt(close, CLOSE_ART);
      render();
      screen.hidden = false;
      close.focus();
    },
    update(next) {
      state = next;
      if (!screen.hidden) render();
    },
    hide() {
      screen.hidden = true;
    },
  };
}
