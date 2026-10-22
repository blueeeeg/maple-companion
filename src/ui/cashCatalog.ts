import { CASH_CATEGORIES, type CashItem, type CashSlot, type RawItem, cashCategory, toCashItems } from '../game/cashShop';
import { cashItemListUrl, cashWeaponNodeUrl } from '../maple/api';
import { loadStoredJson } from './cashAssets';

// 처음 받는 목록은 서버가 1~2초에 주지만, 가끔 응답 없이 1분 넘게 붙잡혀 있다가 실패한다
const LIST_TIMEOUT_MS = 15000;
const NODE_TIMEOUT_MS = 8000;

/** 실패한 요청은 지워서 다음에 다시 받는다 */
function cached<K, V>(cache: Map<K, Promise<V>>, key: K, load: () => Promise<V>): Promise<V> {
  let pending = cache.get(key);
  if (!pending) {
    pending = load();
    pending.catch(() => cache.delete(key));
    cache.set(key, pending);
  }
  return pending;
}

const lists = new Map<CashSlot, Promise<CashItem[]>>();
/**
 * 부위별 캐시 아이템. 목록은 버전마다 같아서 쓰는 칸(번호·이름·성별)만 기기에 남겨 두고 다음 실행부터 받지 않는다.
 * 원본은 부위마다 수백 KB 라 그대로 두지 않는다
 */
export function loadCashItems(slot: CashSlot): Promise<CashItem[]> {
  return cached(lists, slot, () =>
    loadStoredJson<RawItem[], CashItem[]>(
      cashItemListUrl(cashCategory(slot).subCategory),
      (raw) => toCashItems(raw, slot),
      LIST_TIMEOUT_MS,
    ),
  );
}

let warming: Promise<void> | null = null;
/** 탭을 처음 누를 때 기다리지 않게 나머지 부위 목록을 하나씩 받아 둔다. 실패한 부위는 그 탭을 누를 때 다시 받는다 */
export function warmCashItems(): void {
  warming ??= CASH_CATEGORIES.reduce<Promise<void>>(
    (chain, { slot }) =>
      chain.then(() =>
        loadCashItems(slot).then(
          () => {},
          () => {},
        ),
      ),
    Promise.resolve(),
  );
}

const weaponTypes = new Map<number, Promise<string[]>>();
/** 캐시 무기 외형에 그림이 들어 있는 무기 종류 번호. 무기를 고를 때만 받고 기기에 남긴다 */
export function loadCashWeaponTypes(itemId: number): Promise<string[]> {
  return cached(weaponTypes, itemId, () =>
    loadStoredJson<{ children?: string[] }, string[]>(
      cashWeaponNodeUrl(itemId),
      (node) => (node.children ?? []).filter((child) => /^\d+$/.test(child)),
      NODE_TIMEOUT_MS,
    ),
  );
}
