import type { Era } from '../maple/api';
import { CLASSIC_CASH_ITEM_IDS } from '../maple/classicCashItems';
import type { Gender } from './appearance';

/** 캐시 아이템을 입는 자리. 원작처럼 같은 자리의 직업 장비 겉모습을 덮는다 */
export type CashSlot =
  | 'cap'
  | 'faceAccessory'
  | 'eyeAccessory'
  | 'top'
  | 'overall'
  | 'bottom'
  | 'shoes'
  | 'glove'
  | 'cape'
  | 'weapon';

/** 자리마다 입은 캐시 아이템 ID */
export type CashEquipped = Partial<Record<CashSlot, number>>;

export interface CashCategory {
  slot: CashSlot;
  label: string;
  /** maplestory.io 아이템 목록의 하위 분류 이름. 무기 외형(1702xxxx~)은 `Cash` 로 묶여 있다 */
  subCategory: string;
  /** 메소 */
  price: number;
  /** 원작 캐시샵 코디 탭 글자 그림(UI/CashShop.img/CSTab/SubTab/4/{Enable,Disable}/n) 번호 */
  tabArt: number;
}

// 하루 4시간 쓰는 Lv.60~200 캐릭터가 싼 부위는 하루 1~2개 사고, 한벌옷·무기는 2~4일 모아 사게 맞췄다.
// 근거는 cashShop.test.ts 의 「메소 벌이」 에서 레벨별로 계산한다
export const CASH_CATEGORIES: CashCategory[] = [
  { slot: 'cap', label: '모자', subCategory: 'Hat', price: 25_000, tabArt: 1 },
  { slot: 'overall', label: '한벌옷', subCategory: 'Overall', price: 80_000, tabArt: 3 },
  { slot: 'top', label: '상의', subCategory: 'Top', price: 30_000, tabArt: 4 },
  { slot: 'bottom', label: '하의', subCategory: 'Bottom', price: 25_000, tabArt: 5 },
  { slot: 'shoes', label: '신발', subCategory: 'Shoes', price: 20_000, tabArt: 6 },
  { slot: 'glove', label: '장갑', subCategory: 'Glove', price: 15_000, tabArt: 7 },
  { slot: 'cape', label: '망토', subCategory: 'Cape', price: 35_000, tabArt: 2 },
  { slot: 'weapon', label: '무기', subCategory: 'Cash', price: 100_000, tabArt: 0 },
  { slot: 'faceAccessory', label: '얼굴장식', subCategory: 'Face Accessory', price: 15_000, tabArt: 8 },
  { slot: 'eyeAccessory', label: '눈장식', subCategory: 'Eye Decoration', price: 15_000, tabArt: 9 },
];

/** 장비 ID 앞 세 자리(ID / 10000)가 부위다. 170 은 캐시 무기 외형 */
const SLOT_BY_PREFIX: Record<number, CashSlot> = {
  100: 'cap',
  101: 'faceAccessory',
  102: 'eyeAccessory',
  104: 'top',
  105: 'overall',
  106: 'bottom',
  107: 'shoes',
  108: 'glove',
  110: 'cape',
  170: 'weapon',
};

/** 진짜 무기(130~159). 캐시 무기 외형은 이 무기가 있어야 보인다 */
const isWeapon = (itemId: number) => {
  const prefix = Math.floor(itemId / 10000);
  return prefix >= 130 && prefix < 160;
};

/** 캐시 아이템이 들어가는 자리. 몸·얼굴·헤어처럼 장비가 아니면 null */
export function cashSlotOf(itemId: number): CashSlot | null {
  if (isWeapon(itemId)) return 'weapon';
  return SLOT_BY_PREFIX[Math.floor(itemId / 10000)] ?? null;
}

export function cashCategory(slot: CashSlot): CashCategory {
  return CASH_CATEGORIES.find((category) => category.slot === slot)!;
}

export function cashPrice(itemId: number): number | null {
  const slot = cashSlotOf(itemId);
  return slot && !isWeapon(itemId) ? cashCategory(slot).price : null;
}

/** 입을 캐시 아이템을 자리에 넣는다. 한벌옷은 상의·하의를, 상의·하의는 한벌옷을 벗긴다 */
export function equipCash(equipped: CashEquipped, itemId: number): CashEquipped {
  const slot = cashSlotOf(itemId);
  if (!slot || isWeapon(itemId)) return equipped;
  const next: CashEquipped = { ...equipped, [slot]: itemId };
  if (slot === 'overall') {
    delete next.top;
    delete next.bottom;
  }
  if (slot === 'top' || slot === 'bottom') delete next.overall;
  return next;
}

export function unequipCash(equipped: CashEquipped, slot: CashSlot): CashEquipped {
  const next = { ...equipped };
  delete next[slot];
  return next;
}

/**
 * 입고 있는 캐시 아이템 위에 입어 보는 아이템을 겹친 미리보기 착용.
 * 입어 보기 층도 equipCash 로 쌓아서 그 안에 한벌옷과 상의·하의가 같이 남지 않으므로 겹치는 순서는 상관없다
 */
export function stackTryOn(equipped: CashEquipped, trying: CashEquipped): CashEquipped {
  return Object.values(trying).reduce<CashEquipped>((next, itemId) => equipCash(next, itemId), equipped);
}

const SLOT_ORDER = CASH_CATEGORIES.map((category) => category.slot);

/**
 * 직업·차수 장비 위에 캐시 아이템을 덧입힌 렌더용 아이템 목록.
 * 같은 자리의 장비는 캐시 아이템으로 바뀌고, 캐시 한벌옷은 상의·하의를, 캐시 상의·하의는 직업 한벌옷을 가린다.
 * 무기는 남겨 두고 캐시 무기를 함께 넘긴다. 렌더 API 가 캐시 무기 그림을 그리면서 자세는 진짜 무기를 따르고,
 * 무기가 없는 초보자는 원작처럼 캐시 무기가 보이지 않는다
 */
export function composeLook(look: number[], equipped: CashEquipped): number[] {
  const covered = new Set<CashSlot>();
  SLOT_ORDER.forEach((slot) => {
    if (equipped[slot] && slot !== 'weapon') covered.add(slot);
  });
  if (equipped.overall) covered.add('top').add('bottom');
  if (equipped.top || equipped.bottom) covered.add('overall');

  const kept = look.filter((itemId) => {
    const slot = cashSlotOf(itemId);
    return !slot || !covered.has(slot);
  });
  const hasWeapon = look.some(isWeapon);
  const cash = SLOT_ORDER.flatMap((slot) => {
    const itemId = equipped[slot];
    if (itemId === undefined || (slot === 'weapon' && !hasWeapon)) return [];
    // 저장이 꼬여 한벌옷과 상의·하의가 같이 남았으면 한벌옷만 입힌다
    if ((slot === 'top' || slot === 'bottom') && equipped.overall) return [];
    return [itemId];
  });
  return [...kept, ...cash];
}

export interface Wardrobe {
  meso: number;
  /** 산 캐시 아이템 ID */
  wardrobe: number[];
}

/** 메소를 내고 옷장에 넣는다. 이미 있거나 메소가 모자라면 아무것도 안 하고 false */
export function buyCashItem(owner: Wardrobe, itemId: number): boolean {
  const price = cashPrice(itemId);
  if (price === null || owner.wardrobe.includes(itemId) || owner.meso < price) return false;
  owner.meso -= price;
  owner.wardrobe.push(itemId);
  return true;
}

/** 저장된 옷장·착용 정보를 정리한다. 없는 값(예전 저장)은 빈 옷장, 산 적 없는 아이템이나 자리가 안 맞는 착용은 버린다 */
export function normalizeCashData(saved: { wardrobe?: unknown; cashEquipped?: unknown }): {
  wardrobe: number[];
  cashEquipped: CashEquipped;
} {
  const wardrobe = Array.isArray(saved.wardrobe)
    ? [...new Set(saved.wardrobe.filter((itemId): itemId is number => Number.isInteger(itemId) && cashPrice(itemId) !== null))]
    : [];
  const cashEquipped = Object.entries((saved.cashEquipped ?? {}) as Record<string, unknown>).reduce<CashEquipped>(
    (equipped, [slot, itemId]) =>
      typeof itemId === 'number' && wardrobe.includes(itemId) && cashSlotOf(itemId) === slot
        ? equipCash(equipped, itemId)
        : equipped,
    {},
  );
  return { wardrobe, cashEquipped };
}

/** maplestory.io 아이템 목록의 한 줄 */
export interface RawItem {
  id: number;
  name?: string;
  isCash?: boolean;
  /** 장비 ID 의 천의 자리와 같다. 0 남자, 1 여자, 2 이상 공용 */
  requiredGender?: number;
}

export interface CashItem {
  id: number;
  name: string;
  requiredGender: number;
}

/** 이름 없는 아이템(목록에 이름이 비어 있는 미사용 데이터)과 이 부위가 아닌 것은 뺀다 */
export function toCashItems(raw: RawItem[], slot: CashSlot): CashItem[] {
  return raw
    .filter((item) => item.isCash && item.name?.trim() && cashSlotOf(item.id) === slot && !isWeapon(item.id))
    .map((item) => ({ id: item.id, name: item.name!.trim(), requiredGender: item.requiredGender ?? 2 }));
}

export function fitsGender(requiredGender: number, gender: Gender): boolean {
  return requiredGender >= 2 || requiredGender === (gender === 'male' ? 0 : 1);
}

/** 캐시샵 부위 탭에 늘어놓을 아이템. 클래식 캐릭터에게는 GMS 83 에도 있는 캐시 아이템만 판다(classicCashItems.ts) */
export function cashItemsForSale(list: CashItem[], gender: Gender, era: Era = 'current'): CashItem[] {
  return list.filter(
    (item) => fitsGender(item.requiredGender, gender) && (era === 'current' || CLASSIC_CASH_ITEM_IDS.has(item.id)),
  );
}

/**
 * 캐시 무기 외형이 이 캐릭터의 무기 위에 그려지는지. weaponTypes 는 WZ(Character/Weapon/0{id}.img)의 무기 종류 번호 목록.
 * 30(한손검) 그림은 렌더 API 가 어느 무기에나 씌워 주고, 옛 아이템처럼 단검(33)·너클(48) 그림만 있으면 그 무기에만 맞는다.
 * 단검 전용 외형을 활에 씌우면 쏘는 동작에서 무기가 아예 안 그려진다
 */
export function cashWeaponFits(weaponTypes: string[], look: number[]): boolean {
  const weapon = look.find(isWeapon);
  if (weapon === undefined) return false;
  const type = String(Math.floor(weapon / 10000) - 100);
  return weaponTypes.includes('30') || weaponTypes.includes(type);
}

export function hasWeapon(look: number[]): boolean {
  return look.some(isWeapon);
}

/** 지금 페이지 다음에 아이콘을 미리 받아 둘 페이지. 넘길 가능성이 큰 다음 페이지가 먼저다 */
export function neighborPages(page: number, pageCount: number): number[] {
  return [page + 1, page - 1].filter((neighbor) => neighbor >= 0 && neighbor < pageCount);
}
