import { type CashEquipped, cashCategory } from '../game/cashShop';
import {
  EQUIP_ENTRIES,
  type EquipEntry,
  type EquipPity,
  type EquipSlot,
  type EquipWorn,
  collectionProgress,
  entryItems,
  equipItemName,
  hiddenByCash,
  howToGet,
} from '../game/equipment';
import type { JobPath } from '../game/jobs';
import { cashShopUiUrl, characterAnimationUrl, itemIconUrl, wzImageUrl } from '../maple/api';
import { applyArt, loadWithRetry } from './art';
import { PRIORITY, loadImageAsset, readyImage } from './cashAssets';
import { BUTTON_SKINS, dressMapleButton } from './mapleButton';

export interface EquipWindowState {
  path: JobPath | null;
  owned: number[];
  worn: EquipWorn;
  cash: CashEquipped;
  pity: EquipPity;
  /** 맵 캐릭터와 같은 모습(컬렉션 장비·캐시 아이템 포함) */
  look: number[];
  standAction: string;
}

export interface EquipWindowHandlers {
  onEquip(itemId: number): void;
  onUnequip(slot: EquipSlot): void;
  onClose(): void;
}

export interface EquipWindow {
  show(state: EquipWindowState): void;
  update(state: EquipWindowState): void;
  hide(): void;
}

type Filter = 'all' | 'boss' | 'level' | 'shop';

const FILTERS: [Filter, string][] = [
  ['all', '전체'],
  ['boss', '보스'],
  ['level', '레벨'],
  ['shop', '상점'],
];
/** 판(172 폭)에 33칸 다섯 줄 × 세 줄 */
const PAGE_SIZE = 15;

const ui = (path: string) => wzImageUrl(`UI/_Canvas/${path}`);
// 원작 장비창(UIWindow2.img/Equip/character)의 창 틀(184×290)과 흰 판(172×262). 캐릭터 칸·이름표는 캐릭터 정보창 것을 빌린다
const ART = {
  frame: ui('UIWindow2.img/Equip/character/backgrnd'),
  board: ui('UIWindow2.img/Equip/character/backgrnd2'),
  stage: ui('UIWindow2.img/UserInfo/character/charBackgrnd'),
  plate: ui('UIWindow2.img/UserInfo/character/name'),
};
const CLOSE_ART = {
  normal: ui('Basic.img/BtClose3/normal/0'),
  hover: ui('Basic.img/BtClose3/mouseOver/0'),
  pressed: ui('Basic.img/BtClose3/pressed/0'),
  disabled: ui('Basic.img/BtClose3/normal/0'),
};
const arrowArt = (node: string) => ({
  normal: cashShopUiUrl(`${node}/normal/0`),
  hover: cashShopUiUrl(`${node}/mouseOver/0`),
  pressed: cashShopUiUrl(`${node}/pressed/0`),
  disabled: cashShopUiUrl(`${node}/disabled/0`),
});

export const EQUIP_WINDOW = { width: 294, height: 212 };
// 창 틀 그림의 제목(「EQUIPMENT INVENTORY」, x 39~142)·네 귀퉁이는 그대로 두고 그 사이만 늘린다. 아래 8줄은 바닥 테두리다
const FRAME_SIDE = 34;
const FRAME_TITLE = { x: 34, width: 116 };
const FRAME_FILL_X = 30;
const FRAME_BOTTOM = 8;

let stretchedFrame: Promise<string> | null = null;

/** 원작 창 틀(184×290)을 이 창 크기로 늘린 그림. 늘리는 곳은 무늬 없는 한 열이라 정수 픽셀 그대로다 */
function stretchFrame(): Promise<string> {
  stretchedFrame ??= (async () => {
    const src = await loadWithRetry(ART.frame);
    const image = new Image();
    image.src = src;
    await image.decode();
    const { width, height } = EQUIP_WINDOW;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    const top = height - FRAME_BOTTOM;
    const column = (sx: number, sw: number, dx: number, dw: number) => {
      context.drawImage(image, sx, 0, sw, top, dx, 0, dw, top);
      context.drawImage(image, sx, image.naturalHeight - FRAME_BOTTOM, sw, FRAME_BOTTOM, dx, top, dw, FRAME_BOTTOM);
    };
    const titleX = Math.round((width - FRAME_TITLE.width) / 2);
    const right = width - FRAME_SIDE;
    column(0, FRAME_SIDE, 0, FRAME_SIDE);
    column(FRAME_FILL_X, 1, FRAME_SIDE, titleX - FRAME_SIDE);
    column(FRAME_TITLE.x, FRAME_TITLE.width, titleX, FRAME_TITLE.width);
    column(FRAME_FILL_X, 1, titleX + FRAME_TITLE.width, right - titleX - FRAME_TITLE.width);
    column(image.naturalWidth - FRAME_SIDE, FRAME_SIDE, right, FRAME_SIDE);
    return canvas.toDataURL();
  })();
  stretchedFrame.catch(() => (stretchedFrame = null));
  return stretchedFrame;
}

const SLOT_LABEL: Record<EquipSlot, string> = {
  cap: '모자',
  faceAccessory: '얼굴장식',
  eyeAccessory: '눈장식',
  earrings: '귀고리',
  top: '상의',
  overall: '한벌옷',
  bottom: '하의',
  shoes: '신발',
  glove: '장갑',
  shield: '방패',
  cape: '망토',
  weapon: '무기',
};

/** 이 자리를 덮는 캐시 아이템의 부위 이름. 한벌옷과 상의·하의는 서로 덮는다 */
function coveringCash(slot: EquipSlot, cash: CashEquipped): string {
  if (slot !== 'earrings' && slot !== 'shield' && cash[slot] !== undefined) return cashCategory(slot).label;
  if ((slot === 'top' || slot === 'bottom') && cash.overall !== undefined) return cashCategory('overall').label;
  if (slot === 'overall') return cashCategory(cash.top !== undefined ? 'top' : 'bottom').label;
  return '';
}

export function createEquipWindow(root: HTMLElement, handlers: EquipWindowHandlers): EquipWindow {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <section class="info-screen equip-screen" hidden>
      <div class="equip-window" role="dialog" aria-label="장비">
        <p class="equip-title" data-tauri-drag-region>장비</p>
        <button class="equip-close art-button" type="button" aria-label="닫기">✕</button>
        <div class="equip-stage"><img alt="" hidden /></div>
        <p class="equip-count" title="이 캐릭터가 모을 수 있는 칸 중 모은 칸"></p>
        <div class="equip-board">
          <div class="equip-filters" role="tablist" aria-label="얻는 곳"></div>
          <div class="equip-grid" aria-label="장비 컬렉션"></div>
          <p class="equip-detail" aria-live="polite"><span class="equip-detail-name"></span><span class="equip-detail-note"></span></p>
          <div class="equip-actions">
            <button class="equip-wear" type="button"></button>
            <button class="equip-page-previous art-button" type="button" aria-label="이전 페이지">◀</button>
            <span class="equip-page-number"></span>
            <button class="equip-page-next art-button" type="button" aria-label="다음 페이지">▶</button>
          </div>
        </div>
      </div>
    </section>
    `,
  );

  const pick = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const screen = pick('.equip-screen');
  const frame = pick('.equip-window');
  const close = pick<HTMLButtonElement>('.equip-close');
  const stage = pick('.equip-stage');
  const avatar = pick<HTMLImageElement>('.equip-stage img');
  const count = pick('.equip-count');
  const board = pick('.equip-board');
  const filters = pick('.equip-filters');
  const grid = pick('.equip-grid');
  const detail = pick('.equip-detail');
  const detailName = pick('.equip-detail-name');
  const detailNote = pick('.equip-detail-note');
  const wear = pick<HTMLButtonElement>('.equip-wear');
  const pagePrevious = pick<HTMLButtonElement>('.equip-page-previous');
  const pageNext = pick<HTMLButtonElement>('.equip-page-next');
  const pageNumber = pick('.equip-page-number');

  let state: EquipWindowState | null = null;
  let filter: Filter = 'all';
  let page = 0;
  let selectedId: string | null = null;
  let hoveredId: string | null = null;
  let lookUrl = '';
  /** 색이 여럿인 칸(컬러 목장갑·모험가의 망토)에서 보고 있는 색 */
  const variants = new Map<string, number>();
  const filterButtons = new Map<Filter, HTMLButtonElement>();

  const owns = (itemId: number) => state?.owned.includes(itemId) ?? false;
  const items = (entry: EquipEntry) => (state ? entryItems(entry, state.path) : []);

  /** 칸에 보일 아이템. 입은 색 → 고른 색 → 가진 첫 색 → 첫 색 */
  function shownItem(entry: EquipEntry): number {
    const list = items(entry);
    const worn = state?.worn[entry.slot];
    if (worn !== undefined && list.includes(worn) && !variants.has(entry.id)) return worn;
    const chosen = variants.get(entry.id);
    if (chosen !== undefined && list.includes(chosen)) return chosen;
    return list.find(owns) ?? list[0];
  }

  function visibleEntries(): EquipEntry[] {
    return EQUIP_ENTRIES.filter((entry) => items(entry).length > 0 && (filter === 'all' || entry.source.kind === filter));
  }

  const pageCount = () => Math.max(1, Math.ceil(visibleEntries().length / PAGE_SIZE));

  function noteFor(entry: EquipEntry, itemId: number): { text: string; tone: string } {
    if (!state) return { text: '', tone: '' };
    if (!owns(itemId)) return { text: howToGet(entry, state.pity), tone: 'locked' };
    if (state.worn[entry.slot] !== itemId) return { text: `보유 · ${SLOT_LABEL[entry.slot]}`, tone: 'owned' };
    const cash = hiddenByCash(entry.slot, state.cash) ? coveringCash(entry.slot, state.cash) : '';
    if (cash) return { text: `착용 중 · 캐시 ${cash}에 가려 안 보여요`, tone: 'covered' };
    return { text: '착용 중', tone: 'equipped' };
  }

  function showIcon(holder: HTMLElement, itemId: number) {
    const url = itemIconUrl(itemId);
    const place = (src: string) => {
      if (holder.dataset.itemId !== String(itemId)) return;
      const image = document.createElement('img');
      image.alt = '';
      image.src = src;
      holder.replaceChildren(image);
    };
    holder.dataset.itemId = String(itemId);
    const ready = readyImage(url);
    if (ready) place(ready);
    else {
      holder.replaceChildren();
      loadImageAsset(url, PRIORITY.page).then(place, () => {});
    }
  }

  function markCell(button: HTMLButtonElement, entry: EquipEntry) {
    const itemId = shownItem(entry);
    const owned = owns(itemId);
    const worn = state?.worn[entry.slot] === itemId;
    button.classList.toggle('is-locked', !owned);
    button.classList.toggle('is-equipped', owned && worn);
    button.classList.toggle('is-covered', owned && worn && !!state && hiddenByCash(entry.slot, state.cash));
    button.classList.toggle('is-selected', entry.id === selectedId);
    button.setAttribute('aria-pressed', String(entry.id === selectedId));
    const label = `${equipItemName(itemId)} · ${noteFor(entry, itemId).text}`;
    button.title = label;
    button.setAttribute('aria-label', label);
    const icon = button.querySelector<HTMLElement>('.equip-cell-icon')!;
    if (icon.dataset.itemId !== String(itemId)) showIcon(icon, itemId);
  }

  function cell(entry: EquipEntry): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'equip-cell';
    button.dataset.entryId = entry.id;
    button.innerHTML = `<span class="equip-cell-icon"></span><span class="equip-cell-mark" aria-hidden="true"></span>`;
    const hover = () => {
      hoveredId = entry.id;
      renderDetail();
    };
    const leave = () => {
      if (hoveredId !== entry.id) return;
      hoveredId = null;
      renderDetail();
    };
    button.addEventListener('pointerenter', hover);
    button.addEventListener('pointerleave', leave);
    button.addEventListener('focus', hover);
    button.addEventListener('blur', leave);
    button.addEventListener('click', () => {
      // 색이 여럿인 칸은 고른 채로 다시 누르면 가진 다음 색으로 넘긴다
      const ownedColors = items(entry).filter(owns);
      if (selectedId === entry.id && ownedColors.length > 1) {
        const next = ownedColors[(ownedColors.indexOf(shownItem(entry)) + 1) % ownedColors.length];
        variants.set(entry.id, next);
      }
      selectedId = entry.id;
      render();
    });
    markCell(button, entry);
    return button;
  }

  let shownEntries = '';
  function renderGrid() {
    const visible = visibleEntries();
    page = Math.min(page, pageCount() - 1);
    const pageEntries = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const key = pageEntries.map((entry) => entry.id).join(',');
    if (key !== shownEntries) {
      shownEntries = key;
      // 원작 장비창처럼 빈 자리도 칸으로 채워 판 모양을 지킨다
      const empty = Array.from({ length: PAGE_SIZE - pageEntries.length }, () => {
        const slot = document.createElement('span');
        slot.className = 'equip-cell is-empty';
        return slot;
      });
      grid.replaceChildren(...pageEntries.map(cell), ...empty);
    } else {
      grid.querySelectorAll<HTMLButtonElement>('button.equip-cell').forEach((button) =>
        markCell(button, EQUIP_ENTRIES.find((entry) => entry.id === button.dataset.entryId)!),
      );
    }
    pageNumber.textContent = `${page + 1} / ${pageCount()}`;
    pagePrevious.disabled = page === 0;
    pageNext.disabled = page >= pageCount() - 1;
    filterButtons.forEach((button, each) => {
      button.classList.toggle('is-active', each === filter);
      button.setAttribute('aria-selected', String(each === filter));
    });
  }

  const selectedEntry = () => EQUIP_ENTRIES.find((entry) => entry.id === selectedId) ?? null;

  function renderDetail() {
    const entry = EQUIP_ENTRIES.find((each) => each.id === (hoveredId ?? selectedId)) ?? null;
    if (!entry || !state) {
      detail.dataset.tone = 'hint';
      detailName.textContent = '칸을 누르면 입고 벗어요';
      detailNote.textContent = '캐시 아이템이 같은 자리에 있으면 캐시가 보여요';
      return;
    }
    const itemId = shownItem(entry);
    const note = noteFor(entry, itemId);
    const colors = items(entry).filter(owns).length;
    detail.dataset.tone = note.tone;
    detailName.textContent = equipItemName(itemId);
    detailNote.textContent = colors > 1 && entry.id === selectedId ? `${note.text} · 다시 누르면 다른 색` : note.text;
  }

  function renderWear() {
    const entry = selectedEntry();
    const itemId = entry ? shownItem(entry) : null;
    const owned = itemId !== null && owns(itemId);
    wear.disabled = !owned;
    wear.textContent = entry && owned && state?.worn[entry.slot] === itemId ? '벗기' : '입기';
  }

  function renderLook(current: EquipWindowState) {
    const url = characterAnimationUrl(current.look, current.standAction);
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
    const ready = readyImage(url);
    if (ready) place(ready);
    else loadImageAsset(url, PRIORITY.preview).then(place, () => {});
  }

  function render() {
    if (!state) return;
    const progress = collectionProgress(state.owned, state.path);
    count.textContent = `컬렉션 ${progress.owned}/${progress.total}`;
    renderGrid();
    renderDetail();
    renderWear();
    renderLook(state);
  }

  FILTERS.forEach(([each, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'equip-filter';
    button.setAttribute('role', 'tab');
    button.textContent = label;
    button.addEventListener('click', () => {
      filter = each;
      page = 0;
      render();
    });
    filterButtons.set(each, button);
    filters.appendChild(button);
  });

  wear.addEventListener('click', () => {
    const entry = selectedEntry();
    if (!entry || !state) return;
    const itemId = shownItem(entry);
    if (!owns(itemId)) return;
    if (state.worn[entry.slot] === itemId) handlers.onUnequip(entry.slot);
    else {
      variants.delete(entry.id);
      handlers.onEquip(itemId);
    }
  });
  pagePrevious.addEventListener('click', () => {
    page = Math.max(0, page - 1);
    render();
  });
  pageNext.addEventListener('click', () => {
    page = Math.min(pageCount() - 1, page + 1);
    render();
  });
  close.addEventListener('click', handlers.onClose);
  screen.addEventListener('click', (event) => {
    if (event.target === screen) handlers.onClose();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !screen.hidden) handlers.onClose();
  });

  return {
    show(next) {
      state = next;
      selectedId = null;
      hoveredId = null;
      variants.clear();
      stretchFrame().then(
        (src) => {
          frame.style.setProperty('--frame', `url("${src}")`);
          frame.classList.add('has-frame-art');
        },
        () => {},
      );
      applyArt(board, { board: ART.board });
      applyArt(stage, { stage: ART.stage });
      applyArt(count, { plate: ART.plate });
      applyArt(close, CLOSE_ART);
      applyArt(pagePrevious, arrowArt('CSNotice/BTForward'));
      applyArt(pageNext, arrowArt('CSNotice/BTBackward'));
      dressMapleButton(wear, BUTTON_SKINS.basicBlue);
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
