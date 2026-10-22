// 캐시샵이 maplestory.io 에서 받는 것(목록 JSON·아이콘·미리보기 그림)을 기기에 남겨 두는 곳.
// 같은 버전의 리소스는 바뀌지 않으니 한 번 받은 것은 다시 받지 않는다. 버전이 바뀌면 DB 이름이 바뀌어 새로 받는다
import { DATA_KEY } from '../maple/api';

const DB_PREFIX = 'maple-companion-cache';
const DB_NAME = `${DB_PREFIX}:${DATA_KEY}`;
const STORE = 'entries';

let database: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (!database) {
    database = new Promise((resolve) => {
      // 테스트(node)나 저장소가 막힌 창에서는 기기에 남기지 않고 매번 받는다
      if (typeof indexedDB === 'undefined') return resolve(null);
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    void database.then(dropOldVersions);
  }
  return database;
}

/** 지난 버전 DB 는 다시 쓸 일이 없어 지운다. databases() 가 없는 엔진이면 그냥 둔다 */
function dropOldVersions(db: IDBDatabase | null): void {
  if (!db || typeof indexedDB.databases !== 'function') return;
  indexedDB
    .databases()
    .then((list) =>
      list.forEach(({ name }) => {
        if (name?.startsWith(`${DB_PREFIX}:`) && name !== DB_NAME) indexedDB.deleteDatabase(name);
      }),
    )
    .catch(() => {});
}

export async function readStored<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export function writeStored(key: string, value: unknown): void {
  void openDatabase().then((db) => {
    try {
      db?.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
    } catch {
      // 용량이 차거나 막혔으면 이번 실행 동안만 메모리에 둔다
    }
  });
}

/**
 * 동시에 limit 개까지만 돌리고, 기다리는 것은 priority 가 큰 것부터(같으면 먼저 온 것부터) 꺼낸다.
 * 다음 페이지 아이콘을 미리 받는 동안 지금 페이지 아이콘·미리보기가 뒤로 밀리지 않게 한다
 */
export function createQueue(limit: number) {
  const waiting: { priority: number; start: () => void }[] = [];
  let active = 0;
  const next = () => {
    while (active < limit && waiting.length > 0) {
      const index = waiting.reduce((best, job, i) => (job.priority > waiting[best].priority ? i : best), 0);
      const [job] = waiting.splice(index, 1);
      active += 1;
      job.start();
    }
  };
  return <T>(task: () => Promise<T>, priority = 0): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      waiting.push({
        priority,
        start: () =>
          task()
            .then(resolve, reject)
            .finally(() => {
              active -= 1;
              next();
            }),
      });
      next();
    });
}

export const PRIORITY = { prefetch: 0, page: 1, preview: 2 } as const;

class HttpError extends Error {
  constructor(readonly status: number, url: string) {
    super(`${status} ${url}`);
  }
}

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 600;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * maplestory.io 는 그림을 처음 그릴 때 보통 1~4초지만 가끔 수십 초 걸리거나 500·503 을 낸다.
 * 한 번에 기다리는 시간을 끊고 다시 받는다. 다시 받을 때는 브라우저 캐시를 건너뛴다 — 같은 주소의 먼저 간 요청이
 * 멈춰 있으면 브라우저가 캐시 자리를 잡고 있어 뒤 요청도 같이 멈춘다
 */
export async function fetchPatiently<T>(
  url: string,
  read: (response: Response) => Promise<T>,
  { timeoutMs, signal }: { timeoutMs: number; signal?: AbortSignal },
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, timeoutMs);
    signal?.addEventListener('abort', abort);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: attempt > 1 ? 'no-store' : 'default' });
      if (!response.ok) throw new HttpError(response.status, url);
      return await read(response);
    } catch (error) {
      // 404 같은 4xx 는 다시 받아도 같다(아이콘이 없는 아이템 등)
      const final = error instanceof HttpError && error.status < 500;
      if (signal?.aborted || final || attempt >= RETRY_ATTEMPTS) throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    await wait(attempt * RETRY_DELAY_MS);
  }
}

/** 받아 둔 JSON. 기기에 있으면 그것을, 없으면 받아서 shape 로 필요한 것만 남겨 기기에 둔다 */
export async function loadStoredJson<Raw, T>(url: string, shape: (raw: Raw) => T, timeoutMs: number): Promise<T> {
  const stored = await readStored<T>(url);
  if (stored !== undefined) return stored;
  const value = shape(await fetchPatiently(url, (response) => response.json() as Promise<Raw>, { timeoutMs }));
  writeStored(url, value);
  return value;
}

interface StoredImage {
  type: string;
  bytes: ArrayBuffer;
}

const ICON_TIMEOUT_MS = 8000;
const PREVIEW_TIMEOUT_MS = 12000;
const queue = createQueue(6);
/** 다 받은 그림의 blob 주소. 같은 그림은 다시 받지도 다시 읽지도 않는다 */
const ready = new Map<string, string>();
const loading = new Map<string, Promise<string>>();

export const readyImage = (url: string): string | undefined => ready.get(url);

async function fetchImage(url: string, priority: number, signal?: AbortSignal): Promise<string> {
  let stored = await readStored<StoredImage>(url);
  if (!stored) {
    const timeoutMs = priority === PRIORITY.preview ? PREVIEW_TIMEOUT_MS : ICON_TIMEOUT_MS;
    stored = await queue(
      () =>
        fetchPatiently(
          url,
          async (response) => ({ type: response.headers.get('content-type') ?? 'image/png', bytes: await response.arrayBuffer() }),
          { timeoutMs, signal },
        ),
      priority,
    );
    writeStored(url, stored);
  }
  const src = ready.get(url) ?? URL.createObjectURL(new Blob([stored.bytes], { type: stored.type }));
  ready.set(url, src);
  return src;
}

/**
 * 그림을 받아 blob 주소로 돌려준다. signal 을 넘긴 요청(미리보기)은 따로 받아서 취소할 수 있고,
 * 안 넘긴 요청(아이콘)은 같은 주소끼리 한 번만 받는다. 실패하면 잊어서 다음에 다시 받는다
 */
export function loadImageAsset(url: string, priority: number, signal?: AbortSignal): Promise<string> {
  const done = ready.get(url);
  if (done) return Promise.resolve(done);
  if (signal) return fetchImage(url, priority, signal);
  let pending = loading.get(url);
  if (!pending) {
    pending = fetchImage(url, priority).finally(() => loading.delete(url));
    loading.set(url, pending);
  }
  return pending;
}
