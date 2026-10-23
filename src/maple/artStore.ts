// 맵 렌더·레이어·맵 정보·캐릭터·몹·포털 그림처럼 maplestory.io 에서 받는 것을 기기(IndexedDB)에 남겨 두는 곳.
// 팬 API 가 10~90초씩 멈추거나 5xx 를 내도 한 번 받은 맵과 캐릭터는 다음 실행에 네트워크 없이 바로 그린다.
// 같은 버전의 응답은 바뀌지 않아 주소 그대로를 키로 쓰고, 캐시샵·스킬과 같은 DB 라 KMS 버전이 바뀌면 통째로 새로 받는다
import { deleteStored, readStored, writeStored } from '../ui/cashAssets';
import { DATA_KEY, FETCH_TIMEOUT_MS, fetchWithin } from './api';

/** 남겨 둔 그림을 모두 합친 크기. 맵 하나(전체 렌더 약 3MB + 레이어·정보)가 4~6MB 라 맵 70개쯤이다 */
export const ART_STORE_BUDGET_BYTES = 400 * 1024 * 1024;
/** 이보다 큰 응답은 남기지 않는다 */
export const ART_STORE_CAP_BYTES = 32 * 1024 * 1024;
/** 목록(크기·마지막으로 쓴 때)은 그림 수천 장이 한꺼번에 오가도 한 번만 쓰게 모았다가 쓴다 */
const INDEX_SAVE_DELAY_MS = 2000;
/** 그릴 것이 없는 맵 레이어는 404·400 으로 온다. 같은 버전에선 늘 같아서 이것도 남긴다 */
const MISSING_STATUSES = [400, 404];

export interface StoredArt {
  status: number;
  type: string;
  bytes: ArrayBuffer;
}

/** 남겨 둔 주소 → 크기·마지막으로 쓴 때 */
export type ArtIndex = Record<string, { bytes: number; usedAt: number }>;

/** IndexedDB(cashAssets) 대신 테스트에서 메모리로 바꿔 끼운다 */
export interface ArtBackend {
  read<T>(key: string): Promise<T | undefined>;
  write(key: string, value: unknown): void;
  remove(key: string): void;
}

export const artKey = (url: string) => `${DATA_KEY}:art:${url}`;
const INDEX_KEY = `${DATA_KEY}:art-index`;

/** base 자체이거나 base 아래 경로인 주소. `/map/100000000` 이 `/map/1000000000` 까지 붙잡지 않게 `/` 로 끊는다 */
export const underBase = (url: string, base: string) => url === base || url.startsWith(`${base}/`);

/** 합이 budget 을 넘으면 마지막으로 쓴 때가 오래된 것부터 지울 주소. kept 인 것(지금 맵·모습)은 건너뛴다 */
export function artEvictionPlan(index: ArtIndex, budget: number, kept: (url: string) => boolean = () => false): string[] {
  let total = Object.values(index).reduce((sum, { bytes }) => sum + bytes, 0);
  const evicted: string[] = [];
  Object.entries(index)
    .sort(([, a], [, b]) => a.usedAt - b.usedAt)
    .forEach(([url, { bytes }]) => {
      if (total <= budget || kept(url)) return;
      evicted.push(url);
      total -= bytes;
    });
  return evicted;
}

const toResponse = (art: StoredArt) =>
  new Response(art.bytes.byteLength > 0 ? art.bytes : null, {
    status: art.status,
    headers: art.type ? { 'content-type': art.type } : {},
  });

export interface ArtStoreOptions {
  budget?: number;
  cap?: number;
  now?: () => number;
  saveDelayMs?: number;
}

export function createArtStore(
  backend: ArtBackend,
  { budget = ART_STORE_BUDGET_BYTES, cap = ART_STORE_CAP_BYTES, now = Date.now, saveDelayMs = INDEX_SAVE_DELAY_MS }: ArtStoreOptions = {},
) {
  let index: Promise<ArtIndex> | null = null;
  const loadIndex = () =>
    (index ??= backend.read<ArtIndex>(INDEX_KEY).then(
      (saved): ArtIndex => saved ?? {},
      (): ArtIndex => ({}),
    ));
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let unsaved: ArtIndex | null = null;
  const scheduleSave = (current: ArtIndex) => {
    unsaved = current;
    saveTimer ??= setTimeout(flush, saveDelayMs);
  };
  function flush(): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    if (unsaved) backend.write(INDEX_KEY, unsaved);
    unsaved = null;
  }

  const keptBases = new Map<string, string[]>();
  const isKept = (url: string) => [...keptBases.values()].some((bases) => bases.some((base) => underBase(url, base)));

  /**
   * 목록에 없어도 데이터부터 읽는다. 목록을 쓰기 전에 앱이 꺼져 데이터만 남았으면 여기서 목록에 다시 넣어 예산에 센다.
   * 반대로 저장소가 비워졌거나 용량이 차서 데이터 쓰기가 실패했으면 목록에서 뺀다
   */
  async function get(url: string): Promise<StoredArt | undefined> {
    const current = await loadIndex();
    const art = await backend.read<StoredArt>(artKey(url)).catch(() => undefined);
    if (!art) {
      if (current[url]) {
        delete current[url];
        scheduleSave(current);
      }
      return undefined;
    }
    current[url] = { bytes: art.bytes.byteLength, usedAt: now() };
    scheduleSave(current);
    return art;
  }

  async function put(url: string, art: StoredArt): Promise<void> {
    const size = art.bytes.byteLength;
    if (size > cap) return;
    const current = await loadIndex();
    backend.write(artKey(url), art);
    current[url] = { bytes: size, usedAt: now() };
    artEvictionPlan(current, budget, isKept).forEach((evicted) => {
      delete current[evicted];
      backend.remove(artKey(evicted));
    });
    scheduleSave(current);
  }

  async function remove(url: string): Promise<void> {
    const current = await loadIndex();
    delete current[url];
    backend.remove(artKey(url));
    scheduleSave(current);
  }

  return {
    get,
    put,
    remove,
    flush,
    /** 데이터를 읽지 않고 목록만 본다. 미리 받기에서 이미 있는 것을 건너뛸 때 */
    has: async (url: string) => (await loadIndex())[url] !== undefined,
    /** scope(지금 맵·지금 모습)마다 이 주소 아래 것은 예산을 넘어도 안 지운다. 같은 scope 로 다시 부르면 바꿔 끼운다 */
    keep(scope: string, bases: string[]): void {
      keptBases.set(scope, bases);
    },
    /**
     * 기기에 있으면 네트워크 없이 그것으로, 없으면 fetchWithin(시간 제한)으로 받는다. read 가 성공한 응답만 남겨서
     * 깨진 그림·5xx 는 남지 않는다. 남겨 둔 것을 read 가 못 읽으면 지우고 다시 받는다.
     * keepMissing 이면 404·400 도 남긴다(빈 레이어)
     */
    async fetch<T>(
      url: string,
      read: (response: Response) => Promise<T>,
      timeoutMs = FETCH_TIMEOUT_MS,
      { keepMissing = false }: { keepMissing?: boolean } = {},
    ): Promise<T> {
      if (!url.startsWith('https://')) return fetchWithin(url, read, timeoutMs);
      const stored = await get(url);
      if (stored) {
        try {
          return await read(toResponse(stored));
        } catch {
          await remove(url);
        }
      }
      return fetchWithin(
        url,
        async (response) => {
          if (!response.ok && !(keepMissing && MISSING_STATUSES.includes(response.status))) return read(response);
          const art = { status: response.status, type: response.headers.get('content-type') ?? '', bytes: await response.arrayBuffer() };
          const value = await read(toResponse(art));
          void put(url, art);
          return value;
        },
        timeoutMs,
      );
    },
  };
}

export type ArtStore = ReturnType<typeof createArtStore>;

export const artStore = createArtStore({ read: readStored, write: writeStored, remove: deleteStored });

if (typeof window !== 'undefined') window.addEventListener('pagehide', () => artStore.flush());

/** fetchWithin 과 같지만 기기에 남긴다 */
export const fetchStored = artStore.fetch;

export function fetchStoredJson<T>(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<T> {
  return fetchStored(
    url,
    (response) => {
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return response.json() as Promise<T>;
    },
    timeoutMs,
  );
}

/** 지금 맵·모습은 예산을 넘어도 지우지 않는다 */
export const keepArt = (scope: string, bases: string[]) => artStore.keep(scope, bases);
