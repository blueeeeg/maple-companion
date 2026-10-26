import { ADVANCEMENT_LEVELS, type JobPath, tierName } from '../game/jobs';
import {
  SKILL_TIERS,
  type SkillEntry,
  findSkill,
  huntSkill,
  iconPrefetchOrder,
  isCastable,
  isHuntable,
  skillIconPath,
  tierSkills,
} from '../game/skillBook';
import { wzImageUrl } from '../maple/api';
import { applyArt, loadWithRetry } from './art';
import { PRIORITY, loadImageAsset, readyImage } from './cashAssets';
import { BUTTON_SKINS, dressMapleButton, prefetchButtonSkins } from './mapleButton';

export interface SkillWindowState {
  /** 직업 길. 2차 갈래를 고르기 전에는 계열이다 */
  path: JobPath | null;
  /** 0 이면 초보자 */
  tier: number;
  /** 고른 사냥 스킬. null 이면 자동 */
  huntSkillId: number | null;
}

/** 스킬을 맵에 그릴 수 있는지 받아 본 결과. cooldown 은 방금 다른 스킬을 써서 잠깐 쉬는 중 */
export type SkillCheck = 'ok' | 'noArt' | 'failed' | 'cooldown';

export interface SkillWindowHandlers {
  /** 고른 사냥 스킬을 받아 봐서 맵에 그릴 수 있는지 알려 준다. ok 면 받는 쪽이 저장한다. null 은 자동으로 되돌리기 */
  onChoose(skillId: number | null): Promise<SkillCheck>;
  /** 액티브 스킬을 한 번 쓴다. ok 면 받는 쪽이 창을 닫고 맵에서 쓴다 */
  onCast(skillId: number): Promise<SkillCheck>;
  onClose(): void;
}

export interface SkillWindow {
  show(state: SkillWindowState): void;
  update(state: SkillWindowState): void;
  hide(): void;
}

// 원작 스킬창(UIWindow2.img/Skill/main)을 원작 좌표(318×361) 그대로 짠 뒤 가로 띠 세 군데를 빼서 230 높이로 쌓는다.
// 창 틀·안쪽 판·직업 띠는 모두 같은 띠를 빼서 이음매가 겹치고, 빼는 곳은 위아래가 똑같은 줄(무늬가 2줄마다 반복되는 곳은 짝수 줄)이다.
// 1) 직업 띠의 파란 단색 4줄(창 y 82~85) 2) 스킬 칸 목록(원작 6줄 → 3줄, 내려서 본다) 3) 아래 띠의 무늬 4줄(창 y 334~337)
const KEEP: [top: number, height: number][] = [
  [0, 82],
  [86, 121],
  [330, 4],
  [338, 23],
];
/** 원작 창 y → 230 높이 창 y */
function mapY(y: number): number {
  let offset = 0;
  for (const [top, height] of KEEP) {
    if (y < top + height) return offset + Math.max(0, y - top);
    offset += height;
  }
  return offset;
}

const ui = (path: string) => wzImageUrl(`UI/_Canvas/${path}`);
const SKILL_UI = (node: string) => ui(`UIWindow2.img/Skill/main/${node}`);
const ART = {
  frame: SKILL_UI('backgrnd'),
  board: SKILL_UI('backgrnd2'),
  banner: SKILL_UI('backgrnd3'),
};
/** [CSS 변수, 원작 x, 원작 y, 폭, 높이] */
const LAYERS: [name: keyof typeof ART, left: number, top: number, width: number, height: number][] = [
  ['frame', 0, 0, 318, 361],
  ['board', 5, 22, 306, 333],
  ['banner', 7, 47, 304, 45],
];
const ROW_ART = { row: SKILL_UI('skill0'), 'row-dim': SKILL_UI('skill1') };
// 5·6차 탭 머리에는 원작처럼 V 매트릭스·HEXA 매트릭스 띠(297×35)를 둔다. 원작에서는 그 창을 여는 버튼이다
const MATRIX_ART = { v: SKILL_UI('BtVMatrix/normal/0'), hexa: SKILL_UI('BtHexaMatrix/normal/0') };
// 직업 스킬북 아이콘(26×30). 모든 전직 차수가 같은 책 그림(1112.img)을 가리키고 초보자만 따로 있다
const BOOK_ICON = { beginner: wzImageUrl('Skill/_Canvas/000.img/info/icon'), job: wzImageUrl('Skill/_Canvas/1112.img/info/icon') };
const CLOSE_ART = {
  normal: ui('Basic.img/BtClose3/normal/0'),
  hover: ui('Basic.img/BtClose3/mouseOver/0'),
  pressed: ui('Basic.img/BtClose3/pressed/0'),
  disabled: ui('Basic.img/BtClose3/normal/0'),
};
// 원작 스크롤바(Basic.img/VScr9, 폭 11). 위·아래 버튼 11×12, 손잡이 11×26
const SCROLL_ART = {
  base: ui('Basic.img/VScr9/enabled/base'),
  prev: ui('Basic.img/VScr9/enabled/prev0'),
  'prev-hover': ui('Basic.img/VScr9/enabled/prev1'),
  next: ui('Basic.img/VScr9/enabled/next0'),
  'next-hover': ui('Basic.img/VScr9/enabled/next1'),
  thumb: ui('Basic.img/VScr9/enabled/thumb0'),
  'thumb-hover': ui('Basic.img/VScr9/enabled/thumb1'),
};
// 초보자 탭은 잠긴 그림이 따로 없어서 enabled/0 이 disabled/0 을 가리킨다
const tabArt = (tier: number) => ({
  on: SKILL_UI(`Tab/selected/${tier}`),
  off: SKILL_UI(`Tab/${tier === 0 ? 'disabled' : 'enabled'}/${tier}`),
  locked: SKILL_UI(`Tab/disabled/${tier}`),
});

/** 메시지를 띄워 두는 시간 */
const NOTE_MS = 3500;
/** 원작 스킬 칸 높이(35) + 줄 사이(5). styles.css .skill-list 와 같다 */
const ROW_PITCH = 40;
const THUMB_HEIGHT = 26;
const ARROW_HEIGHT = 12;

const iconUrl = (entry: SkillEntry) => wzImageUrl(skillIconPath(entry));

/**
 * 스킬창 그림과 이 직업 길의 스킬 아이콘을 뒤에서 미리 받아 둔다. 아이콘은 캐시샵처럼 기기(IndexedDB)에 남겨서
 * 다음 실행부터는 네트워크 없이 바로 그린다. 창을 열면 지금 탭 아이콘이 미리 받기보다 먼저 받아진다. 아이콘을 다 받으면 끝난다
 */
export async function prefetchSkillWindow(path: JobPath | null, tier: number): Promise<void> {
  const icons = iconPrefetchOrder(path, tier).map((entry) => loadImageAsset(iconUrl(entry), PRIORITY.prefetch));
  [...Object.values(ART), ...Object.values(ROW_ART), ...Object.values(SCROLL_ART), ...SKILL_TIERS.flatMap((each) => Object.values(tabArt(each)))].forEach(
    (url) => loadWithRetry(url).catch(() => {}),
  );
  prefetchButtonSkins(BUTTON_SKINS.skillGreen, BUTTON_SKINS.skillOrange);
  await Promise.allSettled(icons);
}

export function createSkillWindow(root: HTMLElement, handlers: SkillWindowHandlers): SkillWindow {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <section class="info-screen skill-screen" hidden>
      <div class="skill-window" role="dialog" aria-label="스킬">
        <div class="skill-art" aria-hidden="true"></div>
        <p class="skill-title" data-tauri-drag-region>스킬</p>
        <button class="skill-close art-button" type="button" aria-label="닫기">✕</button>
        <nav class="skill-tabs" role="tablist" aria-label="전직 차수"></nav>
        <span class="skill-book" aria-hidden="true"></span>
        <strong class="skill-banner-title" data-tauri-drag-region></strong>
        <span class="skill-matrix" aria-hidden="true" hidden></span>
        <div class="skill-list" role="list"></div>
        <div class="skill-scroll" aria-hidden="true">
          <button class="skill-scroll-prev" type="button" tabindex="-1"></button>
          <span class="skill-scroll-thumb"></span>
          <button class="skill-scroll-next" type="button" tabindex="-1"></button>
        </div>
        <p class="skill-hunt" aria-live="polite"></p>
        <button class="skill-auto" type="button">자동</button>
      </div>
    </section>
    `,
  );

  const pick = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const screen = pick('.skill-screen');
  const frame = pick('.skill-window');
  const art = pick('.skill-art');
  const close = pick<HTMLButtonElement>('.skill-close');
  const tabs = pick('.skill-tabs');
  const book = pick('.skill-book');
  const bannerTitle = pick('.skill-banner-title');
  const matrix = pick('.skill-matrix');
  const list = pick('.skill-list');
  const scroll = pick('.skill-scroll');
  const thumb = pick('.skill-scroll-thumb');
  const hunt = pick('.skill-hunt');
  const auto = pick<HTMLButtonElement>('.skill-auto');

  // 원작 좌표의 그림을 KEEP 띠만 남겨 쌓는다
  LAYERS.forEach(([name, left, top, width, height]) =>
    KEEP.forEach(([keepTop, keepHeight]) => {
      const from = Math.max(top, keepTop);
      const to = Math.min(top + height, keepTop + keepHeight);
      if (to <= from) return;
      const strip = document.createElement('span');
      strip.className = `skill-strip is-${name}`;
      strip.style.cssText = `left:${left}px;top:${mapY(from)}px;width:${width}px;height:${to - from}px;background-position:0 ${top - from}px`;
      art.appendChild(strip);
    }),
  );

  let state: SkillWindowState | null = null;
  let tab = 0;
  /** 받아 보는 중인 스킬. 그동안 다른 버튼은 막는다 */
  let checking: number | null = null;
  let note: { text: string; problem: boolean } | null = null;
  let noteTimer = 0;
  const tabButtons = SKILL_TIERS.map((tier) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'skill-tab';
    button.setAttribute('role', 'tab');
    button.textContent = tier === 0 ? '초' : String(tier);
    button.addEventListener('click', () => selectTab(tier));
    tabs.appendChild(button);
    return button;
  });

  const reached = () => (state?.path ? state.tier : 0);
  const currentHunt = () => (state ? huntSkill(state.path, state.tier, state.huntSkillId) : null);

  function selectTab(tier: number) {
    if (!state || tier < 0 || tier > reached()) return;
    tab = tier;
    list.scrollTop = 0;
    render();
  }

  function showNote(text: string, problem = false) {
    note = { text, problem };
    window.clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => {
      note = null;
      renderFooter();
    }, NOTE_MS);
    renderFooter();
  }

  async function run(skillId: number, label: string, task: () => Promise<SkillCheck>): Promise<SkillCheck | null> {
    if (!state || checking !== null) return null;
    checking = skillId;
    showNote(`${label} 준비 중…`);
    renderList();
    const result = await task().catch((): SkillCheck => 'failed');
    checking = null;
    return result;
  }

  async function choose(skillId: number | null) {
    const entry = skillId === null ? null : findSkill(state?.path ?? null, skillId);
    const result = await run(skillId ?? -1, entry?.name ?? '자동', () => handlers.onChoose(skillId));
    if (result === null) return;
    if (result === 'ok') showNote(skillId === null ? '자동으로 골라 싸워요' : `사냥 스킬을 바꿨어요 · ${entry?.name}`);
    else if (result === 'noArt') showNote(`${entry?.name} · 그릴 이펙트가 없어 자동으로 둘게요`, true);
    else showNote('스킬 정보를 받지 못했어요. 잠시 뒤 다시 눌러 주세요', true);
    render();
  }

  async function cast(entry: SkillEntry) {
    const result = await run(entry.id, entry.name, () => handlers.onCast(entry.id));
    if (result === null || result === 'ok') return;
    if (result === 'cooldown') showNote('방금 쓴 스킬이 끝나면 다시 쓸 수 있어요', true);
    else if (result === 'noArt') showNote(`${entry.name} · 그릴 이펙트가 없어 쓸 수 없어요`, true);
    else showNote('스킬 정보를 받지 못했어요. 잠시 뒤 다시 눌러 주세요', true);
    render();
  }

  /** 아래 칸 왼쪽(원작은 스킬 레벨 자리)에 적는 상태 */
  function rowState(entry: SkillEntry, inUse: boolean): { text: string; kind: string } {
    if (checking === entry.id) return { text: '준비 중…', kind: 'busy' };
    if (inUse) return { text: state?.huntSkillId === null ? '자동 사냥 중' : '사냥 중', kind: 'hunting' };
    if (entry.type === 'passive') return { text: '패시브', kind: 'passive' };
    if (entry.noArt) return { text: '그림 없음', kind: 'no-art' };
    return { text: '', kind: '' };
  }

  function rowTitle(entry: SkillEntry): string {
    if (entry.type === 'passive') return `${entry.name} · 패시브 스킬이라 쓰는 스킬이 아니에요`;
    if (entry.noArt) return `${entry.name} · 그릴 이펙트 데이터가 없어 쓸 수 없어요`;
    if (entry.type === 'attack') return `${entry.name} · 「사냥」을 누르면 이 스킬로 사냥해요. 보상은 같아요`;
    return `${entry.name} · 「쓰기」를 누르면 창을 닫고 캐릭터가 한 번 써요`;
  }

  function placeIcon(holder: HTMLElement, entry: SkillEntry) {
    const url = iconUrl(entry);
    const show = (src: string) => {
      const image = document.createElement('img');
      image.alt = '';
      image.src = src;
      holder.replaceChildren(image);
      delete holder.dataset.pending;
    };
    const ready = readyImage(url);
    if (ready) return show(ready);
    holder.dataset.pending = 'true';
    loadImageAsset(url, PRIORITY.page).then(show, () => {});
  }

  function skillRow(entry: SkillEntry): HTMLElement {
    const inUse = currentHunt() === entry.id;
    const row = document.createElement('div');
    row.className = 'skill-row';
    row.setAttribute('role', 'listitem');
    row.title = rowTitle(entry);
    const status = rowState(entry, inUse);
    row.classList.toggle('is-dim', Boolean(entry.noArt));
    row.classList.toggle('is-hunting', inUse);
    row.innerHTML = `<span class="skill-icon"></span><span class="skill-name"></span><span class="skill-state"></span>`;
    row.querySelector('.skill-name')!.textContent = entry.name;
    const stateCell = row.querySelector<HTMLElement>('.skill-state')!;
    stateCell.textContent = status.text;
    if (status.kind) stateCell.dataset.kind = status.kind;
    placeIcon(row.querySelector<HTMLElement>('.skill-icon')!, entry);

    // 원작에서 스킬 레벨을 올리는 버튼(BtSpUp)이 있는 자리에 원작 아래 버튼(하이퍼 초록)을 줄여 둔다. 지금 사냥 스킬은 매크로의 주황
    if (isHuntable(entry) || isCastable(entry)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'skill-use';
      button.disabled = checking !== null;
      dressMapleButton(button, inUse ? BUTTON_SKINS.skillOrange : BUTTON_SKINS.skillGreen);
      if (isHuntable(entry)) {
        button.textContent = '사냥';
        button.setAttribute('aria-label', `${entry.name} 으로 사냥하기`);
        button.setAttribute('aria-pressed', String(inUse));
        // 지금 고른 스킬을 다시 누르면 자동으로 돌린다
        button.addEventListener('click', () => void choose(state?.huntSkillId === entry.id ? null : entry.id));
      } else {
        button.textContent = '쓰기';
        button.classList.add('is-cast');
        button.setAttribute('aria-label', `${entry.name} 한 번 쓰기`);
        button.addEventListener('click', () => void cast(entry));
      }
      row.appendChild(button);
    }
    return row;
  }

  function renderTabs() {
    SKILL_TIERS.forEach((tier) => {
      const button = tabButtons[tier];
      const locked = tier > reached();
      button.classList.toggle('is-active', tier === tab);
      button.classList.toggle('is-locked', locked);
      button.setAttribute('aria-selected', String(tier === tab));
      button.setAttribute('aria-disabled', String(locked));
      button.title = locked
        ? state?.path
          ? `Lv.${ADVANCEMENT_LEVELS[tier - 1]}에 ${tier}차 전직하면 열려요`
          : '직업을 고르면 열려요'
        : tier === 0
          ? '초보자 스킬'
          : `${tier}차 스킬`;
    });
  }

  function renderScroll() {
    const overflow = list.scrollHeight - list.clientHeight;
    scroll.classList.toggle('is-idle', overflow <= 0);
    const track = list.clientHeight - ARROW_HEIGHT * 2 - THUMB_HEIGHT;
    const ratio = overflow > 0 ? list.scrollTop / overflow : 0;
    thumb.style.top = `${ARROW_HEIGHT + Math.round(track * ratio)}px`;
  }

  function renderList() {
    if (!state) return;
    const skills = tierSkills(state.path, tab);
    const top = list.scrollTop;
    list.replaceChildren(...skills.map(skillRow));
    list.scrollTop = top;
    bannerTitle.textContent = tierName(state.path, tab);
    book.dataset.kind = tab === 0 ? 'beginner' : 'job';
    const matrixKind = tab === 5 ? 'v' : tab === 6 ? 'hexa' : null;
    matrix.hidden = matrixKind === null;
    if (matrixKind) matrix.dataset.kind = matrixKind;
    bannerTitle.hidden = matrixKind !== null;
    book.hidden = matrixKind !== null;
    renderScroll();
  }

  function renderFooter() {
    if (!state) return;
    auto.disabled = state.huntSkillId === null || checking !== null;
    hunt.classList.toggle('is-problem', note?.problem ?? false);
    if (note) {
      hunt.textContent = note.text;
      return;
    }
    const using = currentHunt();
    const name = using === null ? null : findSkill(state.path, using)?.name;
    if (using === null) hunt.textContent = '사냥 · 기본 공격(전직하면 스킬로 싸워요)';
    else if (state.huntSkillId === null) hunt.textContent = `사냥 · 자동 (${name})`;
    else hunt.textContent = `사냥 · ${name}`;
  }

  function render() {
    renderTabs();
    renderList();
    renderFooter();
  }

  // 스크롤바: 원작처럼 위·아래 버튼은 한 줄씩, 손잡이는 끌어서 옮긴다. 휠은 목록이 칸 단위로 맞춘다(scroll-snap)
  const step = (rows: number) => list.scrollBy({ top: rows * ROW_PITCH });
  pick('.skill-scroll-prev').addEventListener('click', () => step(-1));
  pick('.skill-scroll-next').addEventListener('click', () => step(1));
  list.addEventListener('scroll', renderScroll, { passive: true });
  thumb.addEventListener('pointerdown', (event) => {
    const startY = event.clientY;
    const startTop = list.scrollTop;
    const overflow = list.scrollHeight - list.clientHeight;
    const track = list.clientHeight - ARROW_HEIGHT * 2 - THUMB_HEIGHT;
    // 창 배율(zoom)만큼 포인터가 더 움직인다
    const zoom = list.getBoundingClientRect().height / list.clientHeight || 1;
    thumb.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      list.style.scrollSnapType = 'none';
      list.scrollTop = startTop + ((moveEvent.clientY - startY) / zoom / Math.max(1, track)) * overflow;
    };
    const end = () => {
      list.style.scrollSnapType = '';
      thumb.removeEventListener('pointermove', move);
      thumb.removeEventListener('pointerup', end);
      thumb.removeEventListener('pointercancel', end);
    };
    thumb.addEventListener('pointermove', move);
    thumb.addEventListener('pointerup', end);
    thumb.addEventListener('pointercancel', end);
  });

  auto.addEventListener('click', () => void choose(null));
  close.addEventListener('click', handlers.onClose);
  screen.addEventListener('click', (event) => {
    if (event.target === screen) handlers.onClose();
  });
  window.addEventListener('keydown', (event) => {
    if (screen.hidden || !state) return;
    if (event.key === 'Escape') handlers.onClose();
    // 좌우 화살표로 탭을 넘긴다. 잠긴 탭은 건너뛴다
    if (event.key === 'ArrowLeft') selectTab(tab - 1);
    if (event.key === 'ArrowRight') selectTab(tab + 1);
  });

  function dressUp() {
    applyArt(frame, ART, 'has-frame-art');
    applyArt(list, ROW_ART);
    applyArt(scroll, SCROLL_ART);
    applyArt(book, BOOK_ICON);
    applyArt(matrix, MATRIX_ART);
    applyArt(close, CLOSE_ART);
    dressMapleButton(auto, BUTTON_SKINS.skillGreen);
    tabButtons.forEach((button, tier) => applyArt(button, tabArt(tier)));
  }

  return {
    show(next) {
      state = next;
      // 지금 차수 탭부터 연다. 원작도 마지막 전직 탭이 먼저 보인다
      tab = reached();
      note = null;
      checking = null;
      dressUp();
      list.scrollTop = 0;
      render();
      screen.hidden = false;
      close.focus();
      // 지금 사냥에 쓰는 스킬이 보이게 목록을 칸 단위로 내려 둔다. scrollIntoView 는 잘라 둔 #app 까지 밀어 올려서 쓰지 않는다
      const using = list.querySelector<HTMLElement>('.is-hunting');
      const visibleRows = Math.round(list.clientHeight / ROW_PITCH);
      if (using && using.offsetTop + using.offsetHeight > list.clientHeight) {
        list.scrollTop = using.offsetTop - (visibleRows - 1) * ROW_PITCH;
      }
      renderScroll();
    },
    update(next) {
      // 틱마다 불려도 바뀐 것이 없으면 목록(아이콘)을 다시 그리지 않는다
      const changed =
        !state || state.path !== next.path || state.tier !== next.tier || state.huntSkillId !== next.huntSkillId;
      state = next;
      if (tab > reached()) tab = reached();
      if (changed && !screen.hidden) render();
    },
    hide() {
      screen.hidden = true;
      window.clearTimeout(noteTimer);
      note = null;
      checking = null;
    },
  };
}
