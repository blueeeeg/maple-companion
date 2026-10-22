import { ADVANCEMENT_LEVELS, JOB_LINES, type JobLineId } from '../game/jobs';
import { SKILL_TIERS, type SkillEntry, findSkill, huntSkill, skillWzPath, tierSkills } from '../game/skillBook';
import { fetchJson, skillIconLinkUrl, skillIconUrl, wzImageUrl } from '../maple/api';
import { applyArt, loadWithRetry } from './art';

export interface SkillWindowState {
  jobLine: JobLineId | null;
  /** 0 이면 초보자 */
  tier: number;
  /** 고른 사냥 스킬. null 이면 자동 */
  huntSkillId: number | null;
}

/** 스킬을 맵에 그릴 수 있는지 받아 본 결과 */
export type SkillCheck = 'ok' | 'noArt' | 'failed';

export interface SkillWindowHandlers {
  /** 고른 스킬을 받아 봐서 맵에 그릴 수 있는지 알려 준다. ok 면 받는 쪽이 저장한다. null 은 자동으로 되돌리기 */
  onChoose(skillId: number | null): Promise<SkillCheck>;
  onClose(): void;
}

export interface SkillWindow {
  show(state: SkillWindowState): void;
  update(state: SkillWindowState): void;
  hide(): void;
}

// 원작 스킬창(UIWindow2.img/Skill/main). 창 틀(318×361)과 안쪽 판(306×333)은 settings 처럼 위·아래 띠만 잘라 230 높이로 잇고,
// 차수 탭(25×18, 고른 탭 25×20)·직업 띠(304×45)·스킬 칸(140×35)은 원본 크기로 쓴다. 직업 띠는 가운데 9px 를 뺀다
const ui = (path: string) => wzImageUrl(`UI/_Canvas/${path}`);
const SKILL_UI = (node: string) => ui(`UIWindow2.img/Skill/main/${node}`);
const ART = {
  frame: SKILL_UI('backgrnd'),
  board: SKILL_UI('backgrnd2'),
  banner: SKILL_UI('backgrnd3'),
  row: SKILL_UI('skill0'),
  rowDim: SKILL_UI('skill1'),
};
// 직업 스킬북 아이콘. 모든 전직 차수가 같은 책 그림(1112.img)을 가리키고 초보자만 따로 있다
const BOOK_ICON = { beginner: wzImageUrl('Skill/_Canvas/000.img/info/icon'), job: wzImageUrl('Skill/_Canvas/1112.img/info/icon') };
const CLOSE_ART = {
  normal: ui('Basic.img/BtClose3/normal/0'),
  hover: ui('Basic.img/BtClose3/mouseOver/0'),
  pressed: ui('Basic.img/BtClose3/pressed/0'),
  disabled: ui('Basic.img/BtClose3/normal/0'),
};
// 초보자 탭은 잠긴 그림이 따로 없어서 enabled/0 이 disabled/0 을 가리킨다
const tabArt = (tier: number) => ({
  on: SKILL_UI(`Tab/selected/${tier}`),
  off: SKILL_UI(`Tab/${tier === 0 ? 'disabled' : 'enabled'}/${tier}`),
  locked: SKILL_UI(`Tab/disabled/${tier}`),
});

/** 메시지를 띄워 두는 시간 */
const NOTE_MS = 3500;
/** 스킬 칸 높이(35) + 줄 사이(1). styles.css .skill-list 와 같다 */
const ROW_PITCH = 36;

/**
 * 스킬 아이콘. 아이콘 노드는 `_outlink` 로 `_Canvas` 의 실제 그림을 가리키는데, 바이퍼 4차처럼 다른 스킬 그림을 가리키는 것도 있어서
 * 링크 값을 먼저 받아 찾아간다. 링크를 못 받으면 같은 자리의 `_Canvas` 그림을 받아 본다. 받은 주소는 기억해 둔다
 */
const iconUrls = new Map<number, Promise<string>>();
function iconUrl(id: number): Promise<string> {
  let pending = iconUrls.get(id);
  if (!pending) {
    const { img, node } = skillWzPath(id);
    pending = fetchJson<{ value: string }>(skillIconLinkUrl(img, node))
      .then(({ value }) => wzImageUrl(value), () => skillIconUrl(img, node))
      .then(async (url) => {
        await loadWithRetry(url);
        return url;
      });
    pending.catch(() => iconUrls.delete(id));
    iconUrls.set(id, pending);
  }
  return pending;
}

function tierTitle(jobLine: JobLineId | null, tier: number): string {
  if (tier === 0 || !jobLine) return '초보자';
  return `${JOB_LINES[jobLine].names[Math.min(tier, 4) - 1]} · ${tier}차`;
}

export function createSkillWindow(root: HTMLElement, handlers: SkillWindowHandlers): SkillWindow {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <section class="info-screen skill-screen" hidden>
      <div class="skill-window" role="dialog" aria-label="스킬">
        <p class="skill-title" data-tauri-drag-region>스킬</p>
        <button class="skill-close art-button" type="button" aria-label="닫기">✕</button>
        <div class="skill-board"></div>
        <nav class="skill-tabs" role="tablist" aria-label="전직 차수"></nav>
        <div class="skill-banner" data-tauri-drag-region>
          <span class="skill-book"></span>
          <strong class="skill-banner-title"></strong>
          <span class="skill-banner-count"></span>
        </div>
        <div class="skill-list" role="list"></div>
        <div class="skill-footer">
          <p class="skill-hunt" aria-live="polite"></p>
          <button class="skill-auto" type="button">자동</button>
        </div>
      </div>
    </section>
    `,
  );

  const pick = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const screen = pick('.skill-screen');
  const frame = pick('.skill-window');
  const close = pick<HTMLButtonElement>('.skill-close');
  const board = pick('.skill-board');
  const tabs = pick('.skill-tabs');
  const banner = pick('.skill-banner');
  const book = pick('.skill-book');
  const bannerTitle = pick('.skill-banner-title');
  const bannerCount = pick('.skill-banner-count');
  const list = pick('.skill-list');
  const hunt = pick('.skill-hunt');
  const auto = pick<HTMLButtonElement>('.skill-auto');

  let state: SkillWindowState | null = null;
  let tab = 0;
  let checking: number | null = null;
  let note: { text: string; problem: boolean } | null = null;
  let noteTimer = 0;
  const tabButtons = SKILL_TIERS.map((tier) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'skill-tab';
    button.setAttribute('role', 'tab');
    button.textContent = tier === 0 ? '초' : String(tier);
    button.addEventListener('click', () => {
      if (!state || tier > reached()) return;
      tab = tier;
      list.scrollTop = 0;
      render();
    });
    tabs.appendChild(button);
    return button;
  });

  const reached = () => (state?.jobLine ? state.tier : 0);
  const currentHunt = () => (state ? huntSkill(state.jobLine, state.tier, state.huntSkillId) : null);

  function showNote(text: string, problem = false) {
    note = { text, problem };
    window.clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => {
      note = null;
      renderFooter();
    }, NOTE_MS);
    renderFooter();
  }

  async function choose(skillId: number | null) {
    if (!state || checking !== null) return;
    const entry = skillId === null ? null : findSkill(state.jobLine, skillId);
    checking = skillId ?? -1;
    if (skillId !== null) showNote(`${entry?.name ?? '스킬'} 확인 중…`);
    renderList();
    const result = await handlers.onChoose(skillId).catch((): SkillCheck => 'failed');
    checking = null;
    if (result === 'ok') showNote(skillId === null ? '자동으로 골라 싸워요' : `사냥 스킬을 바꿨어요 · ${entry?.name}`);
    else if (result === 'noArt') showNote(`${entry?.name} · 그릴 이펙트가 없어 자동으로 둘게요`, true);
    else showNote('스킬 정보를 받지 못했어요. 잠시 뒤 다시 눌러 주세요', true);
    render();
  }

  function rowStatus(entry: SkillEntry, inUse: boolean): { text: string; title: string } {
    if (inUse) return { text: state?.huntSkillId === null ? '자동 사냥 중' : '사냥 중', title: '지금 사냥에 쓰는 스킬' };
    if (checking === entry.id) return { text: '확인 중…', title: '' };
    if (entry.attack === 'ready') return { text: '사냥에 쓰기', title: '누르면 이 스킬로 사냥해요. 보상은 같아요' };
    if (entry.attack === 'noArt') return { text: '그림 없음', title: '원작 공격 스킬이지만 그릴 이펙트 데이터가 없어 고를 수 없어요' };
    return { text: '', title: '' };
  }

  function skillRow(entry: SkillEntry): HTMLElement {
    const inUse = currentHunt() === entry.id;
    const selectable = entry.attack === 'ready';
    const row = document.createElement(selectable ? 'button' : 'div');
    row.className = 'skill-row';
    row.setAttribute('role', 'listitem');
    row.classList.toggle('is-attack', selectable);
    row.classList.toggle('is-dim', entry.attack === 'noArt');
    row.classList.toggle('is-hunting', inUse);
    const status = rowStatus(entry, inUse);
    row.title = [entry.name, status.title].filter(Boolean).join(' · ');
    row.innerHTML = `<span class="skill-icon"></span><span class="skill-name"></span><span class="skill-state"></span>`;
    row.querySelector('.skill-name')!.textContent = entry.name;
    row.querySelector('.skill-state')!.textContent = status.text;
    if (row instanceof HTMLButtonElement) {
      row.type = 'button';
      row.disabled = checking !== null;
      row.setAttribute('aria-pressed', String(inUse));
      // 이미 쓰는 스킬을 다시 누르면 자동으로 돌린다
      row.addEventListener('click', () => void choose(inUse && state?.huntSkillId === entry.id ? null : entry.id));
    }
    const holder = row.querySelector<HTMLElement>('.skill-icon')!;
    iconUrl(entry.id).then(
      (url) => {
        const image = document.createElement('img');
        image.alt = '';
        image.crossOrigin = 'anonymous';
        image.src = url;
        holder.appendChild(image);
      },
      () => {},
    );
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
        ? state?.jobLine
          ? `Lv.${ADVANCEMENT_LEVELS[tier - 1]}에 ${tier}차 전직하면 열려요`
          : '직업을 고르면 열려요'
        : tier === 0
          ? '초보자 스킬'
          : `${tier}차 스킬`;
    });
  }

  function renderList() {
    if (!state) return;
    const skills = tierSkills(state.jobLine, tab);
    const top = list.scrollTop;
    list.replaceChildren(...skills.map(skillRow));
    list.scrollTop = top;
    bannerTitle.textContent = tierTitle(state.jobLine, tab);
    const attacks = skills.filter((entry) => entry.attack === 'ready').length;
    bannerCount.textContent = `스킬 ${skills.length}개 · 공격 ${attacks}개`;
    book.dataset.kind = tab === 0 ? 'beginner' : 'job';
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
    const name = using === null ? null : findSkill(state.jobLine, using)?.name;
    if (using === null) hunt.textContent = '사냥 스킬 · 기본 공격(전직하면 스킬로 싸워요)';
    else if (state.huntSkillId === null) hunt.textContent = `사냥 스킬 · 자동 (${name})`;
    else hunt.textContent = `사냥 스킬 · ${name}`;
  }

  function render() {
    renderTabs();
    renderList();
    renderFooter();
  }

  auto.addEventListener('click', () => void choose(null));
  close.addEventListener('click', handlers.onClose);
  screen.addEventListener('click', (event) => {
    if (event.target === screen) handlers.onClose();
  });
  window.addEventListener('keydown', (event) => {
    if (screen.hidden || !state) return;
    if (event.key === 'Escape') handlers.onClose();
    // 원작처럼 좌우 화살표로 탭을 넘긴다. 잠긴 탭은 건너뛴다
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const next = tab + (event.key === 'ArrowLeft' ? -1 : 1);
      if (next < 0 || next > reached()) return;
      tab = next;
      list.scrollTop = 0;
      render();
    }
  });

  function dressUp() {
    applyArt(frame, { frame: ART.frame }, 'has-frame-art');
    applyArt(board, { board: ART.board });
    applyArt(banner, { banner: ART.banner });
    applyArt(list, { row: ART.row, 'row-dim': ART.rowDim });
    applyArt(book, BOOK_ICON);
    applyArt(close, CLOSE_ART);
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
    },
    update(next) {
      // 틱마다 불려도 바뀐 것이 없으면 목록(아이콘)을 다시 그리지 않는다
      const changed =
        !state || state.jobLine !== next.jobLine || state.tier !== next.tier || state.huntSkillId !== next.huntSkillId;
      state = next;
      if (tab > reached()) tab = reached();
      if (changed && !screen.hidden) render();
    },
    hide() {
      screen.hidden = true;
      window.clearTimeout(noteTimer);
      note = null;
    },
  };
}

