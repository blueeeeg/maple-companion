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
  cashItemsForSale,
  hasWeapon,
  neighborPages,
  stackTryOn,
  unequipCash,
} from '../game/cashShop';
import {
  type EquipSlot,
  type EquipWorn,
  canWear,
  equipGear,
  equipItemName,
  equipShopItems,
  equipShopPrice,
  equipSlotOf,
  isEquipItem,
  unequipGear,
  wearEquipment,
} from '../game/equipment';
import { JOB_BRANCHES, type JobPath } from '../game/jobs';
import { MOUNT_SHOP_ITEMS, isMountItem, mountOf, mountShopPrice } from '../game/mounts';
import { type Era, MESO_HUD_ICON_URL, cashShopUiUrl, characterAnimationUrl, itemIconUrl } from '../maple/api';
import { applyArt, loadedImage } from './art';
import { PRIORITY, loadImageAsset, readyImage } from './cashAssets';
import { loadCashItems, loadCashWeaponTypes, warmCashItems } from './cashCatalog';
import { cashDetail, fitCashGrid, pageContaining } from './cashShopLayout';
import { BUTTON_SKINS, dressMapleButton } from './mapleButton';

export interface CashShopState {
  gender: Gender;
  /** 미리보기 캐릭터를 그릴 시대 */
  era?: Era;
  /** 캐시 아이템을 입히기 전의 직업·차수 장비 모습 */
  jobLook: number[];
  /** 무기에 그림이 있는 서기 동작(창은 stand2) */
  standAction: string;
  meso: number;
  wardrobe: number[];
  equipped: CashEquipped;
  /** 장비 상점 탭. 산 컬렉션 장비는 캐시 아이템 아래에 입힌다 */
  gear: { path: JobPath | null; owned: number[]; worn: EquipWorn };
  /** 장비 상점 「탈것」. 탈것은 몸에 입히는 것이 아니라 미리보기에 태워 보지 않는다 */
  mounts: { owned: number[]; selected: number | null };
}

export interface CashShopHandlers {
  /** 확인 창에서 「확인」을 누른 뒤에 부른다. 사고 나서 바로 입히는 것까지 받는 쪽이 한다 */
  onBuy(itemId: number): void;
  onEquip(itemId: number): void;
  onUnequip(slot: CashSlot): void;
  /** 장비 상점 탭의 사기·입기·벗기. 사고 나서 바로 입히는 것까지 받는 쪽이 한다 */
  onBuyGear(itemId: number): void;
  onEquipGear(itemId: number): void;
  onUnequipGear(slot: EquipSlot): void;
  /** 장비 상점 「탈것」의 사기·타기·내리기. 사고 나서 바로 태우는 것까지 받는 쪽이 한다 */
  onBuyMount(mountId: number): void;
  onSelectMount(mountId: number): void;
  onClose(): void;
}

export interface CashShop {
  show(state: CashShopState): void;
  /** 사기·입기·벗기로 바뀐 상태를 다시 그린다. 고른 탭·페이지·아이템은 그대로 둔다 */
  update(state: CashShopState): void;
  hide(): void;
}

type Tab = CashSlot | 'owned' | 'gear' | 'mount';

/**
 * 이만큼 안에 연달아 누른 아이템은 마지막 것만 그려 받는다. 서버가 그림 하나에 1~4초씩 걸려서 앞 것까지 받으면 뒤 것이 늦어진다.
 * 한 번만 누른 것은 기다리지 않고 바로 받는다
 */
const PREVIEW_DEBOUNCE_MS = 120;

/** 한 번 입어 보면 「누르면 입어 봐요」 안내를 다시 띄우지 않는다. 기기마다 한 번이면 되는 안내라 저장 파일에 넣지 않는다 */
const TRY_ON_HINT_KEY = 'maple-companion:cash-try-on-hint-seen';
const TRY_ON_HINT = '아이템을 누르면 입어 봐요';

function tryOnHintSeen(): boolean {
  try {
    return localStorage.getItem(TRY_ON_HINT_KEY) !== null;
  } catch {
    return false;
  }
}

function rememberTryOnHint(): void {
  try {
    localStorage.setItem(TRY_ON_HINT_KEY, '1');
  } catch {
    // 저장소가 막혔으면 이번 실행 동안만 숨긴다
  }
}

const buttonArt = (node: string) => ({
  normal: cashShopUiUrl(`${node}/normal/0`),
  hover: cashShopUiUrl(`${node}/mouseOver/0`),
  pressed: cashShopUiUrl(`${node}/pressed/0`),
  disabled: cashShopUiUrl(`${node}/disabled/0`),
});

/** 미리보기는 원작 캐시샵 미리보기 배경(366×238)을 원본 크기로 잘라 깐다. 발이 풀밭 윗면에 오게 맞춘 자리다 */
const PREVIEW_STAGE = cashShopUiUrl('Base/Preview/0');
/** 아이템 칸은 원작 캐시 인벤토리 판(380×213)에 그려진 46×46 칸 하나를 잘라 쓴다 */
const ITEM_CELL = cashShopUiUrl('CSInventory/backgrnd');

const won = (meso: number) => meso.toLocaleString();

export function createCashShop(root: HTMLElement, handlers: CashShopHandlers): CashShop {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <section class="shop" data-tauri-drag-region hidden>
      <div class="shop-bar" data-tauri-drag-region>
        <button class="shop-exit art-button" type="button">나가기</button>
        <div class="shop-meso" data-tauri-drag-region title="가진 메소"><span class="shop-meso-icon"></span><span class="shop-meso-amount"></span></div>
      </div>
      <div class="shop-tools" data-tauri-drag-region>
        <button class="shop-picker" type="button" aria-haspopup="menu" aria-expanded="false" title="부위 고르기">
          <span class="shop-picker-label"></span><span class="shop-picker-arrow" aria-hidden="true"></span>
        </button>
        <button class="shop-owned" type="button" aria-pressed="false">보유</button>
        <button class="shop-gear" type="button" aria-pressed="false" title="장비 상점 · 원작 일반 장비를 메소로 사서 장비 컬렉션에 넣어요">장비</button>
        <button class="shop-gear shop-mount" type="button" aria-pressed="false" hidden title="장비 상점 · 탈것을 메소로 사서 장비 창 「탈것」에서 타요">탈것</button>
        <label class="shop-search"><input type="text" placeholder="이름으로 찾기" aria-label="이름으로 찾기" autocomplete="off" spellcheck="false" /></label>
      </div>
      <div class="shop-categories" role="menu" aria-label="부위" hidden></div>
      <div class="shop-side" data-tauri-drag-region>
        <div class="shop-preview" data-tauri-drag-region><img alt="" crossorigin="anonymous" hidden /></div>
        <p class="shop-detail" aria-live="polite"><span class="shop-detail-name"></span><span class="shop-detail-note"></span></p>
      </div>
      <div class="shop-grid" aria-label="아이템"></div>
      <div class="shop-status" data-tauri-drag-region hidden><span class="shop-status-art"></span><p></p></div>
      <div class="shop-actions" data-tauri-drag-region>
        <button class="shop-buy art-button" type="button">구입하기</button>
        <button class="shop-wear" type="button" hidden></button>
        <button class="shop-reset art-button" type="button">원래대로</button>
      </div>
      <div class="shop-pager" data-tauri-drag-region>
        <button class="shop-page-previous art-button" type="button" aria-label="이전 페이지">◀</button>
        <span class="shop-page-number"></span>
        <button class="shop-page-next art-button" type="button" aria-label="다음 페이지">▶</button>
        <span class="shop-count" data-tauri-drag-region></span>
      </div>
      <div class="shop-confirm" hidden>
        <div class="shop-confirm-sheet">
          <div class="shop-confirm-body">
            <span class="shop-confirm-icon"></span>
            <p><strong class="shop-confirm-name"></strong><span class="shop-confirm-price"></span></p>
          </div>
          <small class="shop-confirm-hint">사면 바로 입어요</small>
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
  const picker = pick<HTMLButtonElement>('.shop-picker');
  const pickerLabel = pick('.shop-picker-label');
  const ownedButton = pick<HTMLButtonElement>('.shop-owned');
  const gearButton = pick<HTMLButtonElement>('.shop-gear:not(.shop-mount)');
  const mountButton = pick<HTMLButtonElement>('.shop-mount');
  const categories = pick('.shop-categories');
  const mesoIcon = pick('.shop-meso-icon');
  const mesoAmount = pick('.shop-meso-amount');
  const preview = pick<HTMLImageElement>('.shop-preview img');
  const stage = pick('.shop-preview');
  const detail = pick('.shop-detail');
  const detailName = pick('.shop-detail-name');
  const detailNote = pick('.shop-detail-note');
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
  const confirmHint = pick('.shop-confirm-hint');
  const confirmOk = pick<HTMLButtonElement>('.shop-confirm-ok');
  const confirmCancel = pick<HTMLButtonElement>('.shop-confirm-cancel');

  let state: CashShopState | null = null;
  let tab: Tab = CASH_CATEGORIES[0].slot;
  /** 보유 탭에 있는 동안에도 부위 고르기 버튼에 남겨 둘 마지막 부위 */
  let lastSlot: CashSlot = CASH_CATEGORIES[0].slot;
  let page = 0;
  /** 창 크기가 바뀌어 한 페이지 개수가 달라져도 보던 자리를 지키는 아이템 순번. 페이지를 직접 넘기면 그 페이지 첫 아이템으로 바뀐다 */
  let anchorIndex = 0;
  /** 칸 영역 크기로 정한 한 페이지 개수. 창이 커지면 늘어난다 */
  let pageSize = fitCashGrid(214, 181).pageSize;
  let query = '';
  let selectedId: number | null = null;
  /** 마우스를 올리거나 키보드로 옮겨 간 칸. 설명 줄은 이것을 고른 것보다 먼저 보여 준다 */
  let hoveredId: number | null = null;
  /** 이번에 상점에 들어와 입어 본 아이템. 입고 있는 것 위에 겹쳐 보이고, 원래대로·나가기로 버린다 */
  let trying: CashEquipped = {};
  /** 장비 상점 탭에서 입어 본 컬렉션 장비. 미리보기에서는 같은 자리 캐시 아이템을 걷고 보여 준다 */
  let tryingGear: EquipWorn = {};
  let items: CashItem[] = [];
  let loading: 'loading' | 'error' | 'ready' = 'loading';
  let loadToken = 0;
  let hintSeen = tryOnHintSeen();
  /** 지금 칸에 깔린 아이템 번호. 같으면 칸을 새로 만들지 않고 표시만 바꿔서 마우스를 올려 둔 칸이 그대로 남는다 */
  let shownIds = '';
  /** 받은 목록에서 모은 이름. 보유 탭과 확인 창이 쓴다 */
  const names = new Map<number, string>();
  const weaponTypes = new Map<number, string[] | 'loading' | 'error'>();
  /** 다 받아 풀어 둔 아이콘. 다시 그릴 때 이 img 를 옮겨 붙여서 깜빡이지 않는다 */
  const icons = new Map<number, HTMLImageElement>();
  const iconLoads = new Map<number, Promise<HTMLImageElement>>();
  const categoryButtons = new Map<CashSlot, HTMLButtonElement>();
  let previewTimer = 0;
  let previewAskedAt = -Infinity;
  let previewRequest: AbortController | null = null;

  /** 못 받은 아이콘은 잊어서, 그 칸을 다시 그릴 때 다시 받는다 */
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
    // 받는 동안 다시 그렸을 수 있어서 그때 붙어 있는 칸을 찾아 넣는다
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
  const owns = (itemId: number) => {
    if (isMountItem(itemId)) return state?.mounts.owned.includes(itemId) ?? false;
    return (isEquipItem(itemId) ? state?.gear.owned.includes(itemId) : state?.wardrobe.includes(itemId)) ?? false;
  };
  const wearing = (itemId: number) => {
    if (isMountItem(itemId)) return state?.mounts.selected === itemId;
    if (isEquipItem(itemId)) return state?.gear.worn[equipSlotOf(itemId)!] === itemId;
    const slot = cashSlotOf(itemId);
    return slot !== null && state?.equipped[slot] === itemId;
  };
  const tryingOn = (itemId: number) => Object.values(trying).includes(itemId) || Object.values(tryingGear).includes(itemId);
  const priceOf = (itemId: number) => {
    if (isMountItem(itemId)) return mountShopPrice(itemId) ?? 0;
    return (isEquipItem(itemId) ? equipShopPrice(itemId, state?.era) : cashPrice(itemId)) ?? 0;
  };
  /** 탈것은 입는 것이 아니라 타는 것이라 「착용 중」 대신 「타는 중」이다 */
  const detailOf = (itemId: number, status: Parameters<typeof cashDetail>[1]) => {
    const info = cashDetail({ id: itemId, name: nameOf(itemId) }, status);
    return isMountItem(itemId) && info.tone === 'equipped' ? { ...info, note: '타는 중' } : info;
  };

  function visibleItems(): CashItem[] {
    const needle = query.trim().toLowerCase();
    return needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;
  }

  const pageCount = () => Math.max(1, Math.ceil(visibleItems().length / pageSize));

  function ownedItems(): CashItem[] {
    return [...(state?.wardrobe ?? [])]
      .reverse()
      .map((itemId) => ({ id: itemId, name: nameOf(itemId), requiredGender: 2 }));
  }

  function loadTab() {
    const token = ++loadToken;
    const current = state;
    if (!current) return;
    if (tab === 'gear' || tab === 'mount') {
      items =
        tab === 'gear'
          ? equipShopItems(current.era).map(({ id }) => ({ id, name: equipItemName(id), requiredGender: 2 }))
          : MOUNT_SHOP_ITEMS.map(({ id }) => ({ id, name: mountOf(id)!.name, requiredGender: 2 }));
      items.forEach((item) => names.set(item.id, item.name));
      loading = 'ready';
      render();
      return;
    }
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
        items = cashItemsForSale(list, current.gender, current.era);
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
    closeCategories();
    if (next === tab && loading !== 'error') return;
    tab = next;
    if (next !== 'owned' && next !== 'gear' && next !== 'mount') lastSlot = next;
    page = 0;
    loadTab();
  }

  /** 고른 아이템을 지금 살·입을 수 없는 까닭. 괜찮으면 null */
  function problem(itemId: number): string | null {
    if (!state) return null;
    if (isEquipItem(itemId) && !canWear(state.gear.path, itemId)) {
      return state.gear.path !== null && state.gear.path in JOB_BRANCHES ? '이 직업은 못 들어요' : '2차 전직하면 들 수 있어요';
    }
    if (cashSlotOf(itemId) === 'weapon' && !isEquipItem(itemId) && !owns(itemId)) {
      // 컬렉션 무기를 들고 있으면 캐시 무기 외형은 그 무기 위에 그려진다
      const look = wearEquipment(state.jobLook, state.gear.worn, state.gear.path);
      if (!hasWeapon(look)) return '전직하면 살 수 있어요';
      const types = weaponTypes.get(itemId);
      if (!types || types === 'loading') return '무기 확인 중…';
      if (types === 'error') return '무기 정보를 못 받았어요';
      if (!cashWeaponFits(types, look)) return '이 무기엔 안 보여요';
    }
    if (!owns(itemId)) {
      const price = priceOf(itemId);
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
    const gear = Object.values(tryingGear).reduce<EquipWorn>((worn, itemId) => equipGear(worn, itemId), state.gear.worn);
    const cash = stackTryOn(state.equipped, trying);
    // 입어 보는 장비는 같은 자리 캐시 아이템에 가려지면 안 보이니 미리보기에서만 그 캐시를 걷는다
    (Object.keys(tryingGear) as EquipSlot[]).forEach((slot) => {
      if (slot !== 'earrings' && slot !== 'shield') delete cash[slot];
      if (slot === 'overall') {
        delete cash.top;
        delete cash.bottom;
      }
      if (slot === 'top' || slot === 'bottom') delete cash.overall;
    });
    return composeLook(wearEquipment(state.jobLook, gear, state.gear.path), cash);
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
    const url = characterAnimationUrl(previewLook(), state?.standAction ?? 'stand1', state?.era);
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

  /** 올려 둔 칸이 있으면 그 아이템을, 없으면 고른 아이템을, 둘 다 없으면 처음 한 번만 안내를 보여 준다 */
  function renderDetail() {
    const shownId = hoveredId ?? selectedId;
    if (shownId === null || !state) {
      detail.dataset.tone = 'hint';
      detailName.textContent = hintSeen ? '' : TRY_ON_HINT;
      detailNote.textContent = '';
      detail.title = '';
      return;
    }
    const info = detailOf(shownId, {
      owned: owns(shownId),
      equipped: wearing(shownId),
      problem: shownId === selectedId ? problem(shownId) : null,
      price: priceOf(shownId),
    });
    detail.dataset.tone = info.tone;
    detailName.textContent = info.name;
    detailNote.textContent = info.note;
    detail.title = `${info.name} · ${info.note}`;
  }

  function renderPick() {
    renderPreview();
    renderDetail();
    if (selectedId === null || !state) {
      buy.hidden = false;
      buy.disabled = true;
      wear.hidden = true;
      reset.disabled = true;
      return;
    }
    const reason = problem(selectedId);
    reset.disabled = false;
    if (owns(selectedId)) {
      buy.hidden = true;
      wear.hidden = false;
      if (isMountItem(selectedId)) wear.textContent = wearing(selectedId) ? '내리기' : '타기';
      else wear.textContent = wearing(selectedId) ? '벗기' : '입기';
      return;
    }
    buy.hidden = false;
    buy.disabled = reason !== null;
    wear.hidden = true;
  }

  function renderTabs() {
    categoryButtons.forEach((button, slot) => {
      const active = slot === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-checked', String(active));
    });
    const shown = categoryButtons.get(lastSlot)!;
    const onCategory = tab !== 'owned' && tab !== 'gear' && tab !== 'mount';
    // 부위 버튼은 고른 부위의 원작 탭 글자 그림을 그대로 빌려 쓴다. 보유 탭에 있으면 흰 글자(Disable)로 둔다
    const art = shown.style.getPropertyValue(onCategory ? '--on' : '--off');
    picker.classList.toggle('has-art', art !== '');
    if (art) picker.style.setProperty('--tab', art);
    pickerLabel.textContent = cashCategory(lastSlot).label;
    picker.classList.toggle('is-active', onCategory);
    ownedButton.classList.toggle('is-active', tab === 'owned');
    ownedButton.setAttribute('aria-pressed', String(tab === 'owned'));
    gearButton.classList.toggle('is-active', tab === 'gear');
    gearButton.setAttribute('aria-pressed', String(tab === 'gear'));
    // 「탈것」은 장비 상점 안의 칸이라 장비 상점에 들어와 있을 때만 보인다
    mountButton.hidden = tab !== 'gear' && tab !== 'mount';
    mountButton.classList.toggle('is-active', tab === 'mount');
    mountButton.setAttribute('aria-pressed', String(tab === 'mount'));
  }

  /** 칸 하나의 표시(고름·입어 봄·보유·착용 중)와 마우스를 올렸을 때 뜨는 이름 */
  function markCard(button: HTMLButtonElement, itemId: number) {
    const equipped = wearing(itemId);
    const owned = owns(itemId);
    button.classList.toggle('is-selected', itemId === selectedId);
    button.classList.toggle('is-trying', tryingOn(itemId));
    button.classList.toggle('is-equipped', equipped);
    button.classList.toggle('is-owned', owned && !equipped);
    const { name, note } = detailOf(itemId, { owned, equipped, price: priceOf(itemId) });
    button.title = `${name} · ${note}`;
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(itemId === selectedId));
  }

  function card(item: CashItem): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shop-card';
    button.dataset.itemId = String(item.id);
    button.innerHTML = `<span class="shop-card-icon"></span><span class="shop-card-mark" aria-hidden="true"></span>`;
    showIcon(button.querySelector<HTMLElement>('.shop-card-icon')!, item.id);
    markCard(button, item.id);
    const hover = () => {
      hoveredId = item.id;
      renderDetail();
    };
    const leave = () => {
      if (hoveredId !== item.id) return;
      hoveredId = null;
      renderDetail();
    };
    button.addEventListener('pointerenter', hover);
    button.addEventListener('pointerleave', leave);
    button.addEventListener('focus', hover);
    button.addEventListener('blur', leave);
    button.addEventListener('click', () => {
      selectedId = item.id;
      // 못 드는 무기는 입혀 보면 직업 무기로 돌아가 보여서 입혀 보지 않는다
      if (isEquipItem(item.id)) {
        if (state && canWear(state.gear.path, item.id)) tryingGear = equipGear(tryingGear, item.id);
      }
      else if (!isMountItem(item.id)) trying = equipCash(trying, item.id);
      if (!hintSeen) {
        hintSeen = true;
        rememberTryOnHint();
      }
      checkWeapon(item.id);
      renderGrid();
      renderPick();
    });
    return button;
  }

  function renderGrid() {
    const visible = visibleItems();
    page = Math.min(page, pageCount() - 1);
    if (anchorIndex < page * pageSize || anchorIndex >= (page + 1) * pageSize) anchorIndex = page * pageSize;
    const pageItems = visible.slice(page * pageSize, (page + 1) * pageSize);
    const ids = pageItems.map((item) => item.id).join(',');
    if (ids !== shownIds) {
      shownIds = ids;
      if (hoveredId !== null && !pageItems.some((item) => item.id === hoveredId)) hoveredId = null;
      grid.replaceChildren(...pageItems.map(card));
    } else {
      grid.querySelectorAll<HTMLButtonElement>('.shop-card').forEach((button) => markCard(button, Number(button.dataset.itemId)));
    }
    neighborPages(page, pageCount()).forEach((neighbor) =>
      visible
        .slice(neighbor * pageSize, (neighbor + 1) * pageSize)
        .forEach((item) => loadIcon(item.id, PRIORITY.prefetch).catch(() => {})),
    );
    count.textContent = loading === 'ready' ? `${visible.length.toLocaleString()}개` : '';

    let message = '';
    let showArt = false;
    if (loading === 'loading' && visible.length === 0) message = '목록을 받는 중…';
    else if (loading === 'error') message = '목록을 받지 못했어요. 부위를 다시 고르면 다시 받아요';
    else if (visible.length === 0 && tab === 'owned' && !query.trim()) message = '아직 산 아이템이 없어요';
    else if (visible.length === 0 && tab === 'gear') message = query.trim() ? `‘${query.trim()}’ 장비가 없어요` : '';
    else if (visible.length === 0 && tab === 'mount') message = query.trim() ? `‘${query.trim()}’ 탈것이 없어요` : '';
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

  /**
   * 칸 영역 크기에서 열·행 수를 다시 정한다. clientWidth 는 zoom(--ui-scale) 을 뺀 CSS 픽셀이라 배율과 상관없이
   * 360×230 창에서는 4×3 이다. 숨겨 둔 동안(0×0)은 앞 값을 그대로 둔다
   */
  function measureGrid(): boolean {
    const { clientWidth, clientHeight } = grid;
    if (clientWidth === 0 || clientHeight === 0) return false;
    const fit = fitCashGrid(clientWidth, clientHeight);
    grid.style.setProperty('--columns', String(fit.columns));
    grid.style.setProperty('--column-gap', `${fit.columnGap}px`);
    grid.style.setProperty('--row-gap', `${fit.rowGap}px`);
    if (fit.pageSize === pageSize) return false;
    page = pageContaining(anchorIndex, fit.pageSize);
    pageSize = fit.pageSize;
    return true;
  }

  function openConfirm() {
    if (selectedId === null || problem(selectedId) !== null || owns(selectedId)) return;
    confirmName.textContent = nameOf(selectedId);
    confirmPrice.textContent = `${won(priceOf(selectedId))} 메소에 살까요?`;
    confirmHint.textContent = isMountItem(selectedId) ? '사면 바로 타요' : '사면 바로 입어요';
    const image = icons.get(selectedId);
    confirmIcon.replaceChildren(...(image ? [image.cloneNode() as HTMLImageElement] : []));
    confirm.hidden = false;
    confirmOk.focus();
  }

  function openCategories() {
    categories.hidden = false;
    picker.setAttribute('aria-expanded', 'true');
    (categoryButtons.get(tab === 'owned' || tab === 'gear' || tab === 'mount' ? lastSlot : tab) ?? categories.querySelector('button'))?.focus();
  }

  function closeCategories() {
    if (categories.hidden) return;
    categories.hidden = true;
    picker.setAttribute('aria-expanded', 'false');
  }

  function dressUp() {
    // 바탕 판의 오른쪽 위 미리보기 틀을 피해 아래쪽 무늬만 쓴다. 창이 커져도 무늬가 이어진다
    applyArt(screen, { back: cashShopUiUrl('Base/backgrnd') }, 'has-back-art');
    applyArt(stage, { stage: PREVIEW_STAGE });
    applyArt(grid, { cell: ITEM_CELL });
    applyArt(exit, buttonArt('CSTab/BtExit'));
    applyArt(buy, buttonArt('CSList/BtBuy'));
    applyArt(reset, buttonArt('CSChar/BtDefaultAvatar'));
    // 입기·벗기는 원작에 같은 글자의 버튼이 없어서, 아래 줄(20px)에 들어가는 원작 기본 파란 버튼(18 높이)에 글자를 얹는다
    dressMapleButton(wear, BUTTON_SKINS.basicBlue);
    // 이름과 달리 BTForward 가 왼쪽(◀), BTBackward 가 오른쪽(▶) 화살표다
    applyArt(pagePrevious, buttonArt('CSNotice/BTForward'));
    applyArt(pageNext, buttonArt('CSNotice/BTBackward'));
    applyArt(confirmOk, buttonArt('CSNotice/BtOK'));
    applyArt(confirmCancel, buttonArt('CSNotice/BtCancel'));
    applyArt(search, { field: cashShopUiUrl('CSLocker/storageSearch/backgrnd') });
    applyArt(statusArt, { empty: cashShopUiUrl('Base/noItem_mini') });
    categoryButtons.forEach((button, slot) => {
      const { tabArt } = cashCategory(slot);
      applyArt(
        button,
        {
          on: cashShopUiUrl(`CSTab/SubTab/4/Enable/${tabArt}`),
          off: cashShopUiUrl(`CSTab/SubTab/4/Disable/${tabArt}`),
        },
        'has-art',
        () => {
          if (slot === lastSlot) renderTabs();
        },
      );
    });
    if (!mesoIcon.hasChildNodes()) mesoIcon.appendChild(loadedImage(MESO_HUD_ICON_URL));
  }

  CASH_CATEGORIES.forEach(({ slot, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shop-category';
    button.setAttribute('role', 'menuitemradio');
    button.textContent = label;
    button.addEventListener('click', () => {
      selectTab(slot);
      picker.focus();
    });
    categoryButtons.set(slot, button);
    categories.appendChild(button);
  });

  picker.addEventListener('click', () => (categories.hidden ? openCategories() : closeCategories()));
  categories.addEventListener('keydown', (event) => {
    const step = { ArrowDown: 2, ArrowUp: -2, ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const buttons = [...categoryButtons.values()];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
  });
  ownedButton.addEventListener('click', () => selectTab('owned'));
  gearButton.addEventListener('click', () => selectTab('gear'));
  mountButton.addEventListener('click', () => selectTab('mount'));
  // 부위 목록 밖을 누르면 닫는다. 부위 버튼을 다시 누른 것은 버튼이 직접 닫는다
  screen.addEventListener('pointerdown', (event) => {
    const target = event.target as Node;
    if (!categories.hidden && !categories.contains(target) && !picker.contains(target)) closeCategories();
  });

  new ResizeObserver(() => {
    if (screen.hidden) return;
    if (measureGrid()) renderGrid();
  }).observe(grid);

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
    if (isMountItem(selectedId)) {
      handlers.onSelectMount(selectedId);
      return;
    }
    if (isEquipItem(selectedId)) {
      const slot = equipSlotOf(selectedId)!;
      if (wearing(selectedId)) {
        tryingGear = unequipGear(tryingGear, slot);
        handlers.onUnequipGear(slot);
      } else handlers.onEquipGear(selectedId);
      return;
    }
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
    tryingGear = {};
    renderGrid();
    renderPick();
  });
  confirmCancel.addEventListener('click', () => (confirm.hidden = true));
  confirm.addEventListener('click', (event) => {
    if (event.target === confirm) confirm.hidden = true;
  });
  confirmOk.addEventListener('click', () => {
    confirm.hidden = true;
    if (selectedId === null || problem(selectedId) !== null) return;
    if (isMountItem(selectedId)) handlers.onBuyMount(selectedId);
    else if (isEquipItem(selectedId)) handlers.onBuyGear(selectedId);
    else handlers.onBuy(selectedId);
  });
  screen.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!confirm.hidden) confirm.hidden = true;
    else if (!categories.hidden) {
      closeCategories();
      picker.focus();
    } else handlers.onClose();
  });

  return {
    show(next) {
      const genderChanged = state?.gender !== next.gender;
      state = next;
      confirm.hidden = true;
      closeCategories();
      selectedId = null;
      hoveredId = null;
      trying = {};
      tryingGear = {};
      if (genderChanged) page = 0;
      dressUp();
      screen.hidden = false;
      measureGrid();
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
      closeCategories();
      loadToken += 1;
      window.clearTimeout(previewTimer);
      previewRequest?.abort();
      // 다시 열 때 같은 모습이어도 새로 그려 받게 한다(취소한 요청이면 미리보기가 안 바뀐 채 남는다)
      delete preview.dataset.want;
    },
  };
}
