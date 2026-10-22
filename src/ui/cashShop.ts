import type { Gender } from '../game/appearance';
import {
  CASH_CATEGORIES,
  type CashEquipped,
  type CashItem,
  type CashSlot,
  cashCategory,
  cashPrice,
  cashSlotOf,
  cashWeaponFits,
  composeLook,
  equipCash,
  fitsGender,
  hasWeapon,
  neighborPages,
  stackTryOn,
  unequipCash,
} from '../game/cashShop';
import { MESO_HUD_ICON_URL, cashShopUiUrl, characterAnimationUrl, itemIconUrl } from '../maple/api';
import { applyArt, loadedImage } from './art';
import { PRIORITY, loadImageAsset, readyImage } from './cashAssets';
import { loadCashItems, loadCashWeaponTypes, warmCashItems } from './cashCatalog';

export interface CashShopState {
  gender: Gender;
  /** 캐시 아이템을 입히기 전의 직업·차수 장비 모습 */
  jobLook: number[];
  meso: number;
  wardrobe: number[];
  equipped: CashEquipped;
}

export interface CashShopHandlers {
  /** 확인 창에서 「확인」을 누른 뒤에 부른다. 사고 나서 바로 입히는 것까지 받는 쪽이 한다 */
  onBuy(itemId: number): void;
  onEquip(itemId: number): void;
  onUnequip(slot: CashSlot): void;
  onClose(): void;
}

export interface CashShop {
  show(state: CashShopState): void;
  /** 사기·입기·벗기로 바뀐 상태를 다시 그린다. 고른 탭·페이지·아이템은 그대로 둔다 */
  update(state: CashShopState): void;
  hide(): void;
}

type Tab = CashSlot | 'owned';

const PAGE_SIZE = 6;
/**
 * 이만큼 안에 연달아 누른 아이템은 마지막 것만 그려 받는다. 서버가 그림 하나에 1~4초씩 걸려서 앞 것까지 받으면 뒤 것이 늦어진다.
 * 한 번만 누른 것은 기다리지 않고 바로 받는다
 */
const PREVIEW_DEBOUNCE_MS = 120;

const buttonArt = (node: string) => ({
  normal: cashShopUiUrl(`${node}/normal/0`),
  hover: cashShopUiUrl(`${node}/mouseOver/0`),
  pressed: cashShopUiUrl(`${node}/pressed/0`),
  disabled: cashShopUiUrl(`${node}/disabled/0`),
});

/** 미리보기는 원작 캐시샵 미리보기 배경(366×238)을 원본 크기로 잘라 깐다. 발이 풀밭 윗면에 오게 맞춘 자리다 */
const PREVIEW_STAGE = cashShopUiUrl('Base/Preview/0');

const won = (meso: number) => meso.toLocaleString();

export function createCashShop(root: HTMLElement, handlers: CashShopHandlers): CashShop {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <section class="shop" data-tauri-drag-region hidden>
      <button class="shop-exit art-button" type="button">나가기</button>
      <nav class="shop-tabs" data-tauri-drag-region></nav>
      <div class="shop-meso" data-tauri-drag-region><span class="shop-meso-icon"></span><span class="shop-meso-amount"></span></div>
      <div class="shop-preview" data-tauri-drag-region><img alt="" crossorigin="anonymous" hidden /></div>
      <p class="shop-pick" aria-live="polite"></p>
      <button class="shop-buy art-button" type="button">구입하기</button>
      <button class="shop-wear" type="button" hidden></button>
      <button class="shop-reset art-button" type="button">원래대로</button>
      <label class="shop-search"><input type="text" placeholder="이름으로 찾기" autocomplete="off" spellcheck="false" /></label>
      <span class="shop-count" data-tauri-drag-region></span>
      <div class="shop-grid"></div>
      <div class="shop-status" data-tauri-drag-region hidden><span class="shop-status-art"></span><p></p></div>
      <div class="shop-pager" data-tauri-drag-region>
        <button class="shop-page-previous art-button" type="button" aria-label="이전 페이지">◀</button>
        <span class="shop-page-number"></span>
        <button class="shop-page-next art-button" type="button" aria-label="다음 페이지">▶</button>
      </div>
      <div class="shop-confirm" hidden>
        <div class="shop-confirm-sheet">
          <div class="shop-confirm-body">
            <span class="shop-confirm-icon"></span>
            <p><strong class="shop-confirm-name"></strong><span class="shop-confirm-price"></span></p>
          </div>
          <small>사면 바로 입어요</small>
          <div class="shop-confirm-buttons">
            <button class="shop-confirm-ok art-button" type="button">확인</button>
            <button class="shop-confirm-cancel art-button" type="button">취소</button>
          </div>
        </div>
      </div>
    </section>
    `,
  );

  const pick = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const screen = pick('.shop');
  const exit = pick<HTMLButtonElement>('.shop-exit');
  const tabs = pick('.shop-tabs');
  const mesoIcon = pick('.shop-meso-icon');
  const mesoAmount = pick('.shop-meso-amount');
  const preview = pick<HTMLImageElement>('.shop-preview img');
  const stage = pick('.shop-preview');
  const pickLine = pick('.shop-pick');
  const buy = pick<HTMLButtonElement>('.shop-buy');
  const wear = pick<HTMLButtonElement>('.shop-wear');
  const reset = pick<HTMLButtonElement>('.shop-reset');
  const search = pick('.shop-search');
  const searchInput = pick<HTMLInputElement>('.shop-search input');
  const count = pick('.shop-count');
  const grid = pick('.shop-grid');
  const status = pick('.shop-status');
  const statusArt = pick('.shop-status-art');
  const statusText = pick('.shop-status p');
  const pagePrevious = pick<HTMLButtonElement>('.shop-page-previous');
  const pageNext = pick<HTMLButtonElement>('.shop-page-next');
  const pageNumber = pick('.shop-page-number');
  const confirm = pick('.shop-confirm');
  const confirmIcon = pick('.shop-confirm-icon');
  const confirmName = pick('.shop-confirm-name');
  const confirmPrice = pick('.shop-confirm-price');
  const confirmOk = pick<HTMLButtonElement>('.shop-confirm-ok');
  const confirmCancel = pick<HTMLButtonElement>('.shop-confirm-cancel');

  let state: CashShopState | null = null;
  let tab: Tab = CASH_CATEGORIES[0].slot;
  let page = 0;
  let query = '';
  let selectedId: number | null = null;
  /** 이번에 상점에 들어와 입어 본 아이템. 입고 있는 것 위에 겹쳐 보이고, 원래대로·나가기로 버린다 */
  let trying: CashEquipped = {};
  let items: CashItem[] = [];
  let loading: 'loading' | 'error' | 'ready' = 'loading';
  let loadToken = 0;
  /** 받은 목록에서 모은 이름. 보유 탭과 확인 창이 쓴다 */
  const names = new Map<number, string>();
  const weaponTypes = new Map<number, string[] | 'loading' | 'error'>();
  /** 다 받아 풀어 둔 아이콘. 다시 그릴 때 이 img 를 옮겨 붙여서 깜빡이지 않는다 */
  const icons = new Map<number, HTMLImageElement>();
  const iconLoads = new Map<number, Promise<HTMLImageElement>>();
  const tabButtons = new Map<Tab, HTMLButtonElement>();
  let previewTimer = 0;
  let previewAskedAt = -Infinity;
  let previewRequest: AbortController | null = null;

  /** 못 받은 아이콘은 잊어서, 그 카드를 다시 그릴 때 다시 받는다 */
  function loadIcon(itemId: number, priority: number): Promise<HTMLImageElement> {
    let pending = iconLoads.get(itemId);
    if (!pending) {
      pending = loadImageAsset(itemIconUrl(itemId), priority).then(async (src) => {
        const image = document.createElement('img');
        image.alt = '';
        image.src = src;
        await image.decode();
        icons.set(itemId, image);
        return image;
      });
      pending.catch(() => iconLoads.delete(itemId));
      iconLoads.set(itemId, pending);
    }
    return pending;
  }

  /** 아이콘이 오기 전까지는 빈 칸(data-pending)으로 두고, 끝내 못 받으면 빈 칸 그대로 둔다 */
  function showIcon(holder: HTMLElement, itemId: number) {
    const ready = icons.get(itemId);
    if (ready) {
      holder.appendChild(ready);
      return;
    }
    holder.dataset.pending = 'true';
    // 받는 동안 다시 그렸을 수 있어서 그때 붙어 있는 카드를 찾아 넣는다
    const currentHolder = () => grid.querySelector<HTMLElement>(`.shop-card[data-item-id="${itemId}"] .shop-card-icon`);
    loadIcon(itemId, PRIORITY.page).then(
      (image) => {
        const current = currentHolder();
        if (!current) return;
        current.appendChild(image);
        delete current.dataset.pending;
      },
      () => {
        const current = currentHolder();
        if (current) delete current.dataset.pending;
      },
    );
  }

  const nameOf = (itemId: number) => names.get(itemId) ?? `아이템 ${itemId}`;
  const owns = (itemId: number) => state?.wardrobe.includes(itemId) ?? false;
  const wearing = (itemId: number) => {
    const slot = cashSlotOf(itemId);
    return slot !== null && state?.equipped[slot] === itemId;
  };

  function visibleItems(): CashItem[] {
    const needle = query.trim().toLowerCase();
    return needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;
  }

  const pageCount = () => Math.max(1, Math.ceil(visibleItems().length / PAGE_SIZE));

  function ownedItems(): CashItem[] {
    return [...(state?.wardrobe ?? [])]
      .reverse()
      .map((itemId) => ({ id: itemId, name: nameOf(itemId), requiredGender: 2 }));
  }

  function loadTab() {
    const token = ++loadToken;
    const current = state;
    if (!current) return;
    if (tab === 'owned') {
      // 이름을 알려면 그 부위 목록이 있어야 한다. 못 받은 부위는 번호로 보여 준다
      const slots = [...new Set(current.wardrobe.map(cashSlotOf).filter((slot): slot is CashSlot => slot !== null))];
      items = ownedItems();
      loading = current.wardrobe.every((itemId) => names.has(itemId)) ? 'ready' : 'loading';
      render();
      warmCashItems();
      Promise.allSettled(slots.map((slot) => loadCashItems(slot).then(remember))).then(() => {
        if (token !== loadToken) return;
        items = ownedItems();
        loading = 'ready';
        render();
      });
      return;
    }
    loading = 'loading';
    items = [];
    render();
    loadCashItems(tab).then(
      (list) => {
        remember(list);
        if (token !== loadToken) return;
        items = list.filter((item) => fitsGender(item.requiredGender, current.gender));
        loading = 'ready';
        render();
        warmCashItems();
      },
      () => {
        if (token !== loadToken) return;
        loading = 'error';
        render();
      },
    );
  }

  function remember(list: CashItem[]) {
    list.forEach((item) => names.set(item.id, item.name));
  }

  function selectTab(next: Tab) {
    if (next === tab && loading !== 'error') return;
    tab = next;
    page = 0;
    loadTab();
  }

  /** 고른 아이템을 지금 살·입을 수 없는 까닭. 괜찮으면 null */
  function problem(itemId: number): string | null {
    if (!state) return null;
    if (cashSlotOf(itemId) === 'weapon' && !owns(itemId)) {
      if (!hasWeapon(state.jobLook)) return '전직하면 살 수 있어요';
      const types = weaponTypes.get(itemId);
      if (!types || types === 'loading') return '무기 확인 중…';
      if (types === 'error') return '무기 정보를 못 받았어요';
      if (!cashWeaponFits(types, state.jobLook)) return '이 무기엔 안 보여요';
    }
    if (!owns(itemId)) {
      const price = cashPrice(itemId) ?? 0;
      if (state.meso < price) return `메소 ${won(price - state.meso)} 부족`;
    }
    return null;
  }

  /** 못 받았던 무기는 다시 고르면 다시 받는다 */
  function checkWeapon(itemId: number) {
    const known = weaponTypes.get(itemId);
    if (cashSlotOf(itemId) !== 'weapon' || (known && known !== 'error')) return;
    weaponTypes.set(itemId, 'loading');
    loadCashWeaponTypes(itemId)
      .then(
        (types) => weaponTypes.set(itemId, types),
        () => weaponTypes.set(itemId, 'error'),
      )
      .finally(() => {
        if (selectedId === itemId) renderPick();
      });
  }

  function previewLook(): number[] {
    if (!state) return [];
    return composeLook(state.jobLook, stackTryOn(state.equipped, trying));
  }

  function showPreview(url: string, src: string) {
    const shown = () => {
      preview.style.setProperty('--half-width', `${Math.floor(preview.naturalWidth / 2)}px`);
      preview.style.setProperty('--half-height', `${Math.floor(preview.naturalHeight / 2)}px`);
      preview.hidden = false;
      preview.dataset.shown = url;
      stage.classList.remove('is-loading');
    };
    preview.onerror = () => {
      preview.hidden = true;
      stage.classList.remove('is-loading');
    };
    // 받는 동안 원래 모습으로 되돌렸으면 이미 걸린 그림이라 load 를 기다리지 않는다
    if (preview.src === src && preview.complete && preview.naturalWidth > 0) {
      preview.onload = null;
      shown();
      return;
    }
    preview.onload = shown;
    preview.src = src;
  }

  /**
   * 새 모습을 다 받은 뒤에 바꿔 끼운다. 받는 동안과 실패했을 때는 앞 모습을 그대로 둔다.
   * 맵 캐릭터와 같은 움직이는 GIF 주소라 지금 모습은 맵이 받아 둔 것을 그대로 쓴다
   */
  function renderPreview() {
    const url = characterAnimationUrl(previewLook(), 'stand1');
    if (preview.dataset.want === url) return;
    preview.dataset.want = url;
    window.clearTimeout(previewTimer);
    previewRequest?.abort();
    previewRequest = null;
    const ready = readyImage(url);
    if (ready) {
      showPreview(url, ready);
      return;
    }
    stage.classList.add('is-loading');
    const now = performance.now();
    const delay = now - previewAskedAt < PREVIEW_DEBOUNCE_MS ? PREVIEW_DEBOUNCE_MS : 0;
    previewAskedAt = now;
    previewTimer = window.setTimeout(() => {
      const request = (previewRequest = new AbortController());
      loadImageAsset(url, PRIORITY.preview, request.signal).then(
        (src) => {
          if (preview.dataset.want === url) showPreview(url, src);
        },
        () => {
          if (preview.dataset.want === url) stage.classList.remove('is-loading');
        },
      );
    }, delay);
  }

  function renderPick() {
    renderPreview();
    if (selectedId === null || !state) {
      pickLine.textContent = '아이템을 누르면 입혀 봐요';
      pickLine.title = '';
      pickLine.classList.remove('is-problem');
      buy.hidden = false;
      buy.disabled = true;
      wear.hidden = true;
      reset.disabled = true;
      return;
    }
    const reason = problem(selectedId);
    pickLine.textContent = reason ?? nameOf(selectedId);
    pickLine.title = reason ? `${nameOf(selectedId)} · ${reason}` : nameOf(selectedId);
    pickLine.classList.toggle('is-problem', reason !== null);
    reset.disabled = false;
    if (owns(selectedId)) {
      buy.hidden = true;
      wear.hidden = false;
      wear.textContent = wearing(selectedId) ? '벗기' : '입기';
      return;
    }
    buy.hidden = false;
    buy.disabled = reason !== null;
    wear.hidden = true;
  }

  function renderTabs() {
    tabButtons.forEach((button, key) => {
      const active = key === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function card(item: CashItem): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shop-card';
    button.title = item.name;
    button.dataset.itemId = String(item.id);
    button.innerHTML = `<span class="shop-card-icon"></span><span class="shop-card-name"></span><span class="shop-card-price"></span>`;
    showIcon(button.querySelector<HTMLElement>('.shop-card-icon')!, item.id);
    button.querySelector('.shop-card-name')!.textContent = item.name;
    const price = button.querySelector('.shop-card-price')!;
    if (wearing(item.id)) {
      price.textContent = '착용 중';
      button.classList.add('is-equipped');
    } else if (owns(item.id)) {
      price.textContent = '보유';
      button.classList.add('is-owned');
    } else {
      price.textContent = `${won(cashPrice(item.id) ?? 0)} 메소`;
    }
    button.classList.toggle('is-selected', item.id === selectedId);
    button.addEventListener('click', () => {
      selectedId = item.id;
      trying = equipCash(trying, item.id);
      checkWeapon(item.id);
      renderGrid();
      renderPick();
    });
    return button;
  }

  function renderGrid() {
    const visible = visibleItems();
    page = Math.min(page, pageCount() - 1);
    grid.replaceChildren(...visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(card));
    neighborPages(page, pageCount()).forEach((neighbor) =>
      visible
        .slice(neighbor * PAGE_SIZE, (neighbor + 1) * PAGE_SIZE)
        .forEach((item) => loadIcon(item.id, PRIORITY.prefetch).catch(() => {})),
    );
    count.textContent = loading === 'ready' ? `${visible.length.toLocaleString()}개` : '';

    let message = '';
    let showArt = false;
    if (loading === 'loading' && visible.length === 0) message = '목록을 받는 중…';
    else if (loading === 'error') message = '목록을 받지 못했어요. 탭을 다시 누르면 다시 받아요';
    else if (visible.length === 0 && tab === 'owned' && !query.trim()) message = '아직 산 아이템이 없어요';
    else if (visible.length === 0) {
      message = query.trim() ? `‘${query.trim()}’ 아이템이 없어요` : '판매 중인 상품이 없어요';
      showArt = !query.trim();
    }
    status.hidden = message === '';
    statusText.textContent = message;
    status.classList.toggle('is-empty-art', showArt);
    statusArt.hidden = !showArt;

    pageNumber.textContent = `${page + 1} / ${pageCount()}`;
    pagePrevious.disabled = page === 0;
    pageNext.disabled = page >= pageCount() - 1;
  }

  function render() {
    if (!state) return;
    mesoAmount.textContent = won(state.meso);
    renderTabs();
    renderGrid();
    renderPick();
  }

  function openConfirm() {
    if (selectedId === null || problem(selectedId) !== null || owns(selectedId)) return;
    confirmName.textContent = nameOf(selectedId);
    confirmPrice.textContent = `${won(cashPrice(selectedId) ?? 0)} 메소에 살까요?`;
    const image = icons.get(selectedId);
    confirmIcon.replaceChildren(...(image ? [image.cloneNode() as HTMLImageElement] : []));
    confirm.hidden = false;
    confirmOk.focus();
  }

  function dressUp() {
    applyArt(screen, { back: cashShopUiUrl('Base/backgrnd') }, 'has-back-art');
    applyArt(stage, { stage: PREVIEW_STAGE });
    applyArt(exit, buttonArt('CSTab/BtExit'));
    applyArt(buy, buttonArt('CSList/BtBuy'));
    applyArt(reset, buttonArt('CSChar/BtDefaultAvatar'));
    // 이름과 달리 BTForward 가 왼쪽(◀), BTBackward 가 오른쪽(▶) 화살표다
    applyArt(pagePrevious, buttonArt('CSNotice/BTForward'));
    applyArt(pageNext, buttonArt('CSNotice/BTBackward'));
    applyArt(confirmOk, buttonArt('CSNotice/BtOK'));
    applyArt(confirmCancel, buttonArt('CSNotice/BtCancel'));
    applyArt(search, { field: cashShopUiUrl('CSLocker/storageSearch/backgrnd') });
    applyArt(statusArt, { empty: cashShopUiUrl('Base/noItem_mini') });
    tabButtons.forEach((button, key) => {
      if (key === 'owned') return;
      const { tabArt } = cashCategory(key);
      applyArt(button, {
        on: cashShopUiUrl(`CSTab/SubTab/4/Enable/${tabArt}`),
        off: cashShopUiUrl(`CSTab/SubTab/4/Disable/${tabArt}`),
      });
    });
    if (!mesoIcon.hasChildNodes()) mesoIcon.appendChild(loadedImage(MESO_HUD_ICON_URL));
  }

  [...CASH_CATEGORIES.map((category) => [category.slot, category.label] as const), ['owned', '보유'] as const].forEach(
    ([key, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'shop-tab';
      button.textContent = label;
      button.addEventListener('click', () => selectTab(key));
      tabButtons.set(key, button);
      tabs.appendChild(button);
    },
  );

  exit.addEventListener('click', handlers.onClose);
  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    page = 0;
    renderGrid();
  });
  // 검색 칸에서 누른 키가 창 단축키(Escape 로 닫기)로 새지 않게 한다
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && searchInput.value) {
      event.stopPropagation();
      searchInput.value = '';
      query = '';
      renderGrid();
    }
  });
  pagePrevious.addEventListener('click', () => {
    page = Math.max(0, page - 1);
    renderGrid();
  });
  pageNext.addEventListener('click', () => {
    page = Math.min(pageCount() - 1, page + 1);
    renderGrid();
  });
  buy.addEventListener('click', openConfirm);
  wear.addEventListener('click', () => {
    if (selectedId === null || !owns(selectedId)) return;
    const slot = cashSlotOf(selectedId)!;
    if (wearing(selectedId)) {
      // 입어 보기 층에 같은 아이템이 남아 있으면 벗어도 미리보기에서 안 벗겨진다
      trying = unequipCash(trying, slot);
      handlers.onUnequip(slot);
    } else handlers.onEquip(selectedId);
  });
  reset.addEventListener('click', () => {
    selectedId = null;
    trying = {};
    renderGrid();
    renderPick();
  });
  confirmCancel.addEventListener('click', () => (confirm.hidden = true));
  confirm.addEventListener('click', (event) => {
    if (event.target === confirm) confirm.hidden = true;
  });
  confirmOk.addEventListener('click', () => {
    confirm.hidden = true;
    if (selectedId !== null && problem(selectedId) === null) handlers.onBuy(selectedId);
  });
  screen.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!confirm.hidden) confirm.hidden = true;
    else handlers.onClose();
  });

  return {
    show(next) {
      const genderChanged = state?.gender !== next.gender;
      state = next;
      confirm.hidden = true;
      selectedId = null;
      trying = {};
      if (genderChanged) page = 0;
      dressUp();
      screen.hidden = false;
      loadTab();
    },
    update(next) {
      state = next;
      if (tab === 'owned') items = ownedItems();
      render();
    },
    hide() {
      screen.hidden = true;
      confirm.hidden = true;
      loadToken += 1;
      window.clearTimeout(previewTimer);
      previewRequest?.abort();
      // 다시 열 때 같은 모습이어도 새로 그려 받게 한다(취소한 요청이면 미리보기가 안 바뀐 채 남는다)
      delete preview.dataset.want;
    },
  };
}
