import { BOSSES, type BossSpec } from '../game/bosses';
import { type BossTurn, formatBossWait } from '../game/bossChallenge';
import { type WzValue, mobGageIconLinkUrl, mobGageUrl, wzImageUrl } from '../maple/api';
import { applyArt, loadWithRetry } from './art';
import { PRIORITY, loadImageAsset, loadStoredJson } from './cashAssets';

export interface BossWindowState {
  level: number;
  /** 몬스터 기록(이름 → 잡은 수). 보스도 이름으로 같이 쌓여 있다(records.ts bossRecord) */
  monsterBook: Record<string, number>;
  reservedBossId: number | null;
  turn: BossTurn;
  /** 지금 도전할 수 없는 까닭(사냥·이동 중 등). 도전할 수 있으면 null */
  blocked: string | null;
}

export interface BossWindowHandlers {
  /** 다음 보스 지정. null 은 지정 취소 */
  onReserve(bossId: number | null): void;
  /** 싸움을 시작하면 받는 쪽이 창을 닫고 null 을 돌려준다. 시작하지 못하면 그 까닭 */
  onChallenge(bossId: number, practice: boolean): string | null;
  onClose(): void;
}

export interface BossWindow {
  show(state: BossWindowState): void;
  update(state: BossWindowState): void;
  hide(): void;
}

// 창은 원작 보스 입장 창(UIBossEnter.img/main/backgrnd, 802×602)을 352×226 으로 잘라 붙인다. 가로는 위아래가 똑같은 열 구간
// 두 군데(91~290, 525~779)에서, 세로는 똑같은 줄 구간(42~578)에서 빼서 이음매가 보이지 않는다
const COLUMNS: [from: number, width: number][] = [
  [0, 92],
  [291, 235],
  [777, 25],
];
const ROWS: [from: number, height: number][] = [
  [0, 43],
  [419, 183],
];

const ui = (path: string) => wzImageUrl(`UI/_Canvas/${path}`);
const FRAME_ART = { frame: ui('UIBossEnter.img/main/backgrnd') };
// 원작 보스 UI 의 보스 목록 칸(Move_wnd 왼쪽 열, 135×30 칸이 33 간격). 칸 그림만 있는 보스는 이 빈 칸 위에 이름·아이콘을 얹는다
const SLOT_ART = { slot: ui('UIBoss.img/Main/Move_wnd/backgrnd') };
const ARROW = (dir: 'Up' | 'Down') => {
  const node = (state: string) => ui(`UIBoss.img/Main/Move_wnd/BossList/button:BtArrow${dir}/${state}/0`);
  return { normal: node('normal'), hover: node('mouseOver'), pressed: node('pressed'), disabled: node('disabled') };
};
const CLOSE_ART = {
  normal: ui('Basic.img/BtClose3/normal/0'),
  hover: ui('Basic.img/BtClose3/mouseOver/0'),
  pressed: ui('Basic.img/BtClose3/pressed/0'),
  disabled: ui('Basic.img/BtClose3/normal/0'),
};
// 연습전 확인의 시작 버튼은 원작 「연습모드」 버튼(84×30), 머리 띠는 원작 연습 모드 표시(174×18)다
const PRACTICE_BUTTON_ART = (() => {
  const node = (state: string) => ui(`UIBossEnter.img/main/realMode_wnd/button:practiceModeIn/${state}/0`);
  return { normal: node('normal'), hover: node('mouseOver'), pressed: node('pressed'), disabled: node('normal') };
})();
export const PRACTICE_BANNER_URL = ui('UIWindow2.img/BossPracticeMode/backgrd');
const ICON_FRAME_ART = { frame: mobGageUrl('backgrnd', true) };

/**
 * 원작 보스 목록(UIBoss.img/BossList/{번호})에 버튼 그림(이름·초상 135×30)이 있는 보스. 번호는 BossList/{번호}/info 의 이름으로 맞췄다.
 * 나머지 보스는 원작 목록에 없어서 빈 칸에 보스 HP 게이지 아이콘(MobGage/Mob)을 얹는다
 */
const BOSS_LIST_ENTRY: Record<number, number> = {
  8500002: 22,
  8860000: 9,
  8820001: 11,
  8880000: 10,
  8880405: 24,
};
const rowArt = (entry: number) => {
  const node = (state: string) => ui(`UIBoss.img/BossList/${entry}/btBoss/${state}/0`);
  return { normal: node('normal'), hover: node('mouseOver'), checked: node('checked') };
};

/** 목록 칸 높이(30) + 칸 사이(3). styles.css .boss-list 와 같다 */
const ROW_PITCH = 33;
const ICON_TIMEOUT_MS = 8000;
/** MobGage 아이콘 틀(37×37) 안쪽 회색 칸은 (6, 6) 에서 26칸 */
const ICON_INNER_OFFSET = 6;
const ICON_INNER = 26;

/** 보스 HP 게이지 아이콘. 노드가 가리키는 그림 경로를 기기에 남겨 두고 그 그림을 받는다 */
async function bossIcon(boss: BossSpec): Promise<string> {
  const target = await loadStoredJson<WzValue<string>, string>(mobGageIconLinkUrl(boss.id), (raw) => raw.value, ICON_TIMEOUT_MS);
  return loadImageAsset(wzImageUrl(target), PRIORITY.page);
}

const kills = (state: BossWindowState, boss: BossSpec) => state.monsterBook[boss.name] ?? 0;
const locked = (state: BossWindowState, boss: BossSpec) => boss.minLevel > state.level;

function turnLine(turn: BossTurn): { text: string; kind: string } {
  if (turn.kind === 'ready') return { text: '보스 차례예요 · 지금 도전하면 보상을 받아요', kind: 'ready' };
  if (turn.kind === 'waiting') return { text: `다음 보스까지 활동 ${formatBossWait(turn.seconds)}`, kind: 'waiting' };
  return {
    text: turn.reason === 'bosses' ? '보스를 꺼 둬서 연습전만 할 수 있어요' : '몬스터를 꺼 둬서 연습전만 할 수 있어요',
    kind: 'off',
  };
}

export function createBossWindow(root: HTMLElement, handlers: BossWindowHandlers): BossWindow {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <section class="info-screen boss-screen" hidden>
      <div class="boss-window" role="dialog" aria-label="보스 도전">
        <div class="boss-art" aria-hidden="true"></div>
        <p class="boss-title" data-tauri-drag-region>보스 도전</p>
        <button class="boss-close art-button" type="button" aria-label="닫기">✕</button>
        <button class="boss-arrow is-up art-button" type="button" tabindex="-1" aria-label="위 보스">▲</button>
        <div class="boss-list" role="listbox" aria-label="보스"></div>
        <button class="boss-arrow is-down art-button" type="button" tabindex="-1" aria-label="아래 보스">▼</button>
        <div class="boss-detail">
          <span class="boss-icon-frame" aria-hidden="true"></span>
          <strong class="boss-name"></strong>
          <span class="boss-meta"></span>
          <div class="boss-body" aria-live="polite"></div>
          <div class="boss-actions"></div>
        </div>
      </div>
    </section>
    `,
  );

  const pick = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const screen = pick('.boss-screen');
  const frame = pick('.boss-window');
  const art = pick('.boss-art');
  const close = pick<HTMLButtonElement>('.boss-close');
  const list = pick('.boss-list');
  const up = pick<HTMLButtonElement>('.boss-arrow.is-up');
  const down = pick<HTMLButtonElement>('.boss-arrow.is-down');
  const iconFrame = pick('.boss-icon-frame');
  const name = pick('.boss-name');
  const meta = pick('.boss-meta');
  const body = pick('.boss-body');
  const actions = pick('.boss-actions');

  COLUMNS.reduce((left, [fromX, width]) => {
    ROWS.reduce((top, [fromY, height]) => {
      const strip = document.createElement('span');
      strip.className = 'boss-strip';
      strip.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;background-position:-${fromX}px -${fromY}px`;
      art.appendChild(strip);
      return top + height;
    }, 0);
    return left + width;
  }, 0);

  let state: BossWindowState | null = null;
  let selectedId = BOSSES[0].id;
  /** 연습전 확인 중인 보스. 확인 화면에서는 시작·취소만 보인다 */
  let confirming: number | null = null;
  /** 도전을 못 했을 때의 까닭. 보스를 바꾸면 지운다 */
  let problem: string | null = null;
  const icons = new Map<number, string>();

  const placeIcon = (holder: HTMLElement, boss: BossSpec, centerInFrame = false) => {
    const show = (src: string) => {
      const image = document.createElement('img');
      image.alt = '';
      image.src = src;
      if (centerInFrame) {
        // 홀수 크기 아이콘이 반 칸에 걸려 흐려지지 않게 정수 자리에 둔다
        image.addEventListener('load', () => {
          image.style.left = `${ICON_INNER_OFFSET + Math.floor((ICON_INNER - image.naturalWidth) / 2)}px`;
          image.style.top = `${ICON_INNER_OFFSET + Math.floor((ICON_INNER - image.naturalHeight) / 2)}px`;
          image.style.visibility = '';
        });
        image.style.visibility = 'hidden';
      }
      holder.replaceChildren(image);
    };
    const ready = icons.get(boss.id);
    if (ready) return show(ready);
    holder.replaceChildren();
    bossIcon(boss).then(
      (src) => {
        icons.set(boss.id, src);
        if (holder.isConnected && holder.dataset.bossId === String(boss.id)) show(src);
      },
      () => {},
    );
  };

  const rows = BOSSES.map((boss) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'boss-row';
    row.setAttribute('role', 'option');
    row.dataset.bossId = String(boss.id);
    const entry = BOSS_LIST_ENTRY[boss.id];
    row.innerHTML = `<span class="boss-row-art"></span><span class="boss-row-name"></span><span class="boss-row-icon"></span><span class="boss-row-tag">지정</span><span class="boss-row-count"></span><span class="boss-row-lock"></span>`;
    row.querySelector('.boss-row-name')!.textContent = boss.name;
    if (entry === undefined) {
      const holder = row.querySelector<HTMLElement>('.boss-row-icon')!;
      holder.dataset.bossId = String(boss.id);
      placeIcon(holder, boss);
    }
    row.addEventListener('click', () => select(boss.id));
    list.appendChild(row);
    return { boss, row, entry };
  });

  function select(bossId: number) {
    if (selectedId !== bossId) problem = null;
    selectedId = bossId;
    confirming = null;
    render();
    keepVisible();
  }

  function keepVisible() {
    const index = BOSSES.findIndex((boss) => boss.id === selectedId);
    const top = index * ROW_PITCH;
    const visible = Math.round(list.clientHeight / ROW_PITCH);
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top >= list.scrollTop + visible * ROW_PITCH) list.scrollTop = top - (visible - 1) * ROW_PITCH;
    renderArrows();
  }

  function renderArrows() {
    up.disabled = list.scrollTop <= 0;
    down.disabled = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
  }

  function renderRows(current: BossWindowState) {
    rows.forEach(({ boss, row }) => {
      const isLocked = locked(current, boss);
      const selected = boss.id === selectedId;
      row.classList.toggle('is-locked', isLocked);
      row.classList.toggle('is-selected', selected);
      row.classList.toggle('is-reserved', current.reservedBossId === boss.id);
      row.setAttribute('aria-selected', String(selected));
      row.querySelector('.boss-row-lock')!.textContent = isLocked ? `Lv.${boss.minLevel}부터` : '';
      const count = kills(current, boss);
      const countCell = row.querySelector<HTMLElement>('.boss-row-count')!;
      countCell.textContent = isLocked ? '' : `×${count.toLocaleString()}`;
      countCell.classList.toggle('is-zero', count === 0);
      row.title = isLocked
        ? `${boss.name} · Lv.${boss.minLevel}부터 도전할 수 있어요`
        : `${boss.name} · 처치 ${count.toLocaleString()}번${current.reservedBossId === boss.id ? ' · 다음 보스로 지정함' : ''}`;
    });
  }

  function line(text: string, kind: string): HTMLElement {
    const element = document.createElement('p');
    element.className = `boss-line is-${kind}`;
    element.textContent = text;
    return element;
  }

  function actionButton(label: string, kind: string, run: () => void, disabled = false): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `boss-action is-${kind}`;
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', run);
    return button;
  }

  function challenge(boss: BossSpec, practice: boolean) {
    problem = handlers.onChallenge(boss.id, practice);
    if (problem !== null) {
      confirming = null;
      render();
    }
  }

  function renderConfirm(current: BossWindowState, boss: BossSpec) {
    const banner = document.createElement('span');
    banner.className = 'boss-practice-banner';
    banner.textContent = 'PRACTICE MODE';
    applyArt(banner, { banner: PRACTICE_BANNER_URL });
    const after =
      current.turn.kind === 'waiting'
        ? line(`진짜 보스는 활동 ${formatBossWait(current.turn.seconds)} 뒤에 와요`, 'waiting')
        : line(current.turn.kind === 'off' ? turnLine(current.turn).text : '', 'off');
    body.replaceChildren(
      banner,
      line(`${boss.name} 연습전이에요`, 'title'),
      line('경험치·메소를 받지 않고 처치 기록에도 남지 않아요', 'notice'),
      after,
    );
    const start = actionButton('연습모드', 'practice-start', () => challenge(boss, true));
    start.classList.add('art-button');
    start.setAttribute('aria-label', `${boss.name} 연습전 시작`);
    applyArt(start, PRACTICE_BUTTON_ART);
    actions.replaceChildren(
      actionButton('취소', 'cancel', () => {
        confirming = null;
        render();
      }),
      start,
    );
    start.focus();
  }

  function renderDetail(current: BossWindowState) {
    const boss = BOSSES.find((each) => each.id === selectedId) ?? BOSSES[0];
    const isLocked = locked(current, boss);
    if (iconFrame.dataset.bossId !== String(boss.id) || !iconFrame.firstChild) {
      iconFrame.dataset.bossId = String(boss.id);
      placeIcon(iconFrame, boss, true);
    }
    name.textContent = boss.name;
    meta.textContent = `Lv.${boss.minLevel}부터 · 처치 ${kills(current, boss).toLocaleString()}번`;
    if (confirming === boss.id) return renderConfirm(current, boss);

    const turn = turnLine(current.turn);
    const reserved = BOSSES.find((each) => each.id === current.reservedBossId) ?? null;
    const reservation = document.createElement('p');
    reservation.className = `boss-line is-reservation${reserved ? '' : ' is-random'}`;
    reservation.append(`다음 보스 · ${reserved ? reserved.name : '무작위'}`);
    if (reserved) {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'boss-unreserve';
      cancel.textContent = '취소';
      cancel.setAttribute('aria-label', `다음 보스 ${reserved.name} 지정 취소`);
      cancel.addEventListener('click', () => handlers.onReserve(null));
      reservation.append(cancel);
    }
    const reason = isLocked ? `Lv.${boss.minLevel}부터 도전할 수 있어요` : (problem ?? current.blocked);
    body.replaceChildren(line(turn.text, turn.kind), reservation, ...(reason ? [line(reason, 'problem')] : []));

    const isReserved = current.reservedBossId === boss.id;
    const reserve = actionButton(
      isReserved ? '지정 취소' : '다음 보스 지정',
      'reserve',
      () => handlers.onReserve(isReserved ? null : boss.id),
      isLocked,
    );
    reserve.setAttribute('aria-pressed', String(isReserved));
    reserve.title = isReserved ? '지정을 풀면 다음 보스는 무작위예요' : '다음 보스 차례에 이 보스가 나와요. 보상은 같아요';
    const ready = current.turn.kind === 'ready';
    const go = actionButton(
      '지금 도전',
      ready ? 'go' : 'go-practice',
      () => {
        if (ready) challenge(boss, false);
        else {
          confirming = boss.id;
          render();
        }
      },
      isLocked || current.blocked !== null,
    );
    go.title = ready ? '보스 차례를 써서 지금 싸워요. 보상은 보통 보스와 같아요' : '보스 차례가 아니라 보상 없는 연습전이에요';
    // 틱마다 다시 그려도 누르려던 버튼의 포커스가 남게 한다
    const focusedKind = [...actions.children].find((each) => each === document.activeElement)?.className;
    actions.replaceChildren(reserve, go);
    if (focusedKind) [reserve, go].find((each) => each.className === focusedKind)?.focus();
  }

  /** 마지막으로 그린 내용. 틱마다 같은 내용을 다시 그리면 누르던 버튼이 바뀌어 클릭이 빠진다 */
  let drawn = '';

  const contentOf = (current: BossWindowState) => {
    const turn = current.turn.kind === 'waiting' ? formatBossWait(current.turn.seconds) : JSON.stringify(current.turn);
    return JSON.stringify([selectedId, confirming, problem, current.level, current.monsterBook, current.reservedBossId, current.blocked, turn]);
  };

  function render() {
    if (!state) return;
    drawn = contentOf(state);
    renderRows(state);
    renderDetail(state);
  }

  // 원작 목록처럼 화살표는 한 칸씩, 휠은 칸 단위로 맞춘다(scroll-snap)
  up.addEventListener('click', () => list.scrollBy({ top: -ROW_PITCH }));
  down.addEventListener('click', () => list.scrollBy({ top: ROW_PITCH }));
  list.addEventListener('scroll', renderArrows, { passive: true });
  close.addEventListener('click', handlers.onClose);
  screen.addEventListener('click', (event) => {
    if (event.target === screen) handlers.onClose();
  });
  window.addEventListener('keydown', (event) => {
    if (screen.hidden || !state) return;
    if (event.key === 'Escape') {
      if (confirming !== null) {
        confirming = null;
        render();
      } else handlers.onClose();
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const index = BOSSES.findIndex((boss) => boss.id === selectedId) + (event.key === 'ArrowUp' ? -1 : 1);
    if (index < 0 || index >= BOSSES.length) return;
    select(BOSSES[index].id);
    rows[index].row.focus();
  });

  function dressUp() {
    applyArt(frame, FRAME_ART, 'has-frame-art');
    applyArt(list, SLOT_ART);
    applyArt(close, CLOSE_ART);
    applyArt(up, ARROW('Up'));
    applyArt(down, ARROW('Down'));
    applyArt(iconFrame, ICON_FRAME_ART);
    rows.forEach(({ row, entry }) => {
      if (entry !== undefined) applyArt(row, rowArt(entry), 'has-row-art');
    });
  }

  /** 지정한 보스, 없으면 잡을 수 있는 가장 센 보스부터 보여 준다 */
  function initialBoss(current: BossWindowState): number {
    const reserved = BOSSES.find((boss) => boss.id === current.reservedBossId);
    if (reserved) return reserved.id;
    const open = BOSSES.filter((boss) => !locked(current, boss));
    return (open[open.length - 1] ?? BOSSES[0]).id;
  }

  return {
    show(next) {
      state = next;
      selectedId = initialBoss(next);
      confirming = null;
      problem = null;
      dressUp();
      render();
      screen.hidden = false;
      list.scrollTop = 0;
      keepVisible();
      close.focus();
    },
    update(next) {
      state = next;
      if (!screen.hidden && contentOf(next) !== drawn) render();
    },
    hide() {
      screen.hidden = true;
      confirming = null;
      problem = null;
    },
  };
}

/** 창 그림과 보스 아이콘을 뒤에서 받아 둔다. 창을 열 때 그림을 기다리지 않게 한다 */
export function prefetchBossWindow(): void {
  BOSSES.forEach((boss) => void bossIcon(boss).catch(() => {}));
  [
    FRAME_ART.frame,
    SLOT_ART.slot,
    PRACTICE_BANNER_URL,
    ICON_FRAME_ART.frame,
    ...Object.values(PRACTICE_BUTTON_ART),
    ...Object.values(BOSS_LIST_ENTRY).flatMap((entry) => Object.values(rowArt(entry))),
  ].forEach((url) => void loadWithRetry(url).catch(() => {}));
}
