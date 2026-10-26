import { DATA_KEY, wzImageUrl } from '../maple/api';
import { artStore, keepArt } from '../maple/artStore';
import { readStored, writeStored } from './cashAssets';

// maplestory.io 는 Origin 이 있을 때만 CORS 헤더를 주고 Vary 도 안 붙인다. 일반 <img> 로 먼저 받으면
// 헤더 없는 응답이 브라우저 캐시에 남아, 같은 주소를 fetch 하는 맵 화면의 캐릭터 로딩이 CORS 로 실패한다.
// 그래서 DOM 화면(캐릭터 선택·캐시샵·HUD·창 틀)의 그림은 fetch 로 받아 기기(artStore)에 남기고 blob 주소로만 건다.
// 남겨 두지 않으면 켤 때마다 팬 API 에 기대서, 켤 때 API 가 멈춰 있으면 HUD 버튼이 글자로 남았다

/** 짧게 몇 번 다시 받은 뒤에도 못 받으면 이만큼 쉬었다가 다시 받는다. 마지막 값에서 멈춘다 */
export const ART_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 300_000] as const;
const QUICK_ATTEMPTS = 3;
const QUICK_DELAY_MS = 2000;

/** 기다리던 그림을 지금 다시 받아 볼 때를 알린다. 돌려준 함수로 그만 듣는다 */
export type Wake = (listener: () => void) => () => void;

/** 창이 다시 보이거나 네트워크가 돌아오면 쉬는 중이던 그림을 바로 다시 받는다 */
export const wakeOnReturn: Wake = (listener) => {
  const onVisible = () => {
    if (document.visibilityState === 'visible') listener();
  };
  window.addEventListener('online', listener);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('online', listener);
    document.removeEventListener('visibilitychange', onVisible);
  };
};

export interface Patient<T> {
  promise: Promise<T>;
  /** 쉬는 중이면 기다리지 않고 바로 다시 해 본다. 받는 중이면 아무것도 안 한다 */
  poke(): void;
}

/** 될 때까지 backoff 간격으로 다시 한다. isFinal 인 실패(그림이 없는 4xx 등)만 거절한다 */
export function keepTrying<T>(
  task: () => Promise<T>,
  {
    backoff = ART_BACKOFF_MS,
    wake = wakeOnReturn,
    isFinal = () => false,
  }: { backoff?: readonly number[]; wake?: Wake; isFinal?: (error: unknown) => boolean } = {},
): Patient<T> {
  let retry: (() => void) | null = null;
  const promise = new Promise<T>((resolve, reject) => {
    let failures = 0;
    const run = () => {
      task().then(resolve, (error: unknown) => {
        if (isFinal(error)) return reject(error);
        const delayMs = backoff[Math.min(failures, backoff.length - 1)];
        failures += 1;
        const timer = setTimeout(() => retry?.(), delayMs);
        const stopListening = wake(() => retry?.());
        retry = () => {
          retry = null;
          clearTimeout(timer);
          stopListening();
          run();
        };
      });
    };
    run();
  });
  return { promise, poke: () => retry?.() };
}

export class ArtStatusError extends Error {
  constructor(readonly status: number, url: string) {
    super(`${status} ${url}`);
  }
}

/** 그림이 없다는 답(404 등)은 다시 받아도 같다. 408·429 는 서버가 바빠서라 다시 받는다 */
const isMissing = (error: unknown) =>
  error instanceof ArtStatusError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface ArtLoaderOptions {
  fetchStored: <T>(url: string, read: (response: Response) => Promise<T>) => Promise<T>;
  /** 받은 그림을 걸 주소(blob)로 바꾼다. 못 그리는 그림이면 거절해서 기기에 남지 않게 한다 */
  open(blob: Blob): Promise<string>;
  wait?: (ms: number) => Promise<void>;
  backoff?: readonly number[];
  wake?: Wake;
}

export function createArtLoader({ fetchStored, open, wait = delay, backoff, wake }: ArtLoaderOptions) {
  const ready = new Map<string, string>();
  const patients = new Map<string, Patient<string>>();

  const once = (url: string) =>
    fetchStored(url, async (response) => {
      if (!response.ok) throw new ArtStatusError(response.status, url);
      return open(await response.blob());
    });

  async function quickTries(url: string): Promise<string> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await once(url);
      } catch (error) {
        if (isMissing(error) || attempt >= QUICK_ATTEMPTS) throw error;
        await wait(attempt * QUICK_DELAY_MS);
      }
    }
  }

  /**
   * 그림을 걸 주소. 기기에 있으면 네트워크 없이, 없으면 받아서 남긴다. 못 받으면 거절하지 않고 기다렸다 다시 받으며,
   * 기다리는 그림을 다시 부르면(창을 다시 열면) 바로 다시 받는다. https 가 아닌 주소(data·blob)는 그대로 돌려준다
   */
  function load(url: string): Promise<string> {
    if (!url.startsWith('https://')) return Promise.resolve(url);
    const done = ready.get(url);
    if (done) return Promise.resolve(done);
    const waiting = patients.get(url);
    if (waiting) {
      waiting.poke();
      return waiting.promise;
    }
    const patient = keepTrying(() => quickTries(url), { backoff, wake, isFinal: isMissing });
    patients.set(url, patient);
    patient.promise.then(
      (src) => {
        ready.set(url, src);
        patients.delete(url);
      },
      () => patients.delete(url),
    );
    return patient.promise;
  }

  return { load, ready: (url: string) => ready.get(url) };
}

/** 떼어 낸 그림(data URL)을 남겨 두는 곳. 떼는 법이 바뀌면 key 의 판 이름을 바꿔 새로 뗀다 */
export function createCropCache(backend: { read<T>(key: string): Promise<T | undefined>; write(key: string, value: unknown): void }) {
  return async (key: string, make: () => Promise<string>): Promise<string> => {
    const storeKey = `${DATA_KEY}:crop:${key}`;
    const stored = await backend.read<string>(storeKey).catch(() => undefined);
    if (typeof stored === 'string') return stored;
    const made = await make();
    backend.write(storeKey, made);
    return made;
  };
}

// 받아 둔 Image 를 붙잡아 둬야 브라우저가 풀어 둔 그림을 버리지 않는다. 버리면 숨겨 뒀던 창(삭제 확인 등)을
// 열 때 배경을 다시 풀어 그리느라 잠깐 빈 판이 보인다
const keptImages = new Set<HTMLImageElement>();

async function openBlob(blob: Blob): Promise<string> {
  const src = URL.createObjectURL(blob);
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
  } catch (error) {
    URL.revokeObjectURL(src);
    throw error;
  }
  keptImages.add(image);
  return src;
}

const loader = createArtLoader({ fetchStored: artStore.fetch, open: openBlob });
const cachedCrop = createCropCache({ read: readStored, write: writeStored });

// UI 그림은 켤 때마다 쓰니 맵 그림이 예산을 채워도 지우지 않는다
keepArt('ui', [wzImageUrl('UI')]);

/**
 * 원작 그림을 걸 blob 주소. 기기(IndexedDB)에 있으면 네트워크 없이 바로, 없으면 받아서 남긴다.
 * 못 받으면 15초·30초·1분… 뒤와 창이 다시 보이거나 네트워크가 돌아올 때 다시 받는다. 거절은 그림이 없을 때(4xx)뿐이다
 */
export const loadWithRetry = (url: string): Promise<string> => loader.load(url);

/** 그림을 받아 canvas 로 뗀 결과(data URL)를 기기에 남긴다. version 은 떼는 법이 바뀔 때 올린다 */
export function cropArt(url: string, version: string, draw: (image: HTMLImageElement) => string): Promise<string> {
  return cachedCrop(`${version}:${url}`, async () => {
    const image = new Image();
    image.src = await loadWithRetry(url);
    await image.decode();
    return draw(image);
  });
}

/**
 * 원작 그림을 다 받은 뒤에만 CSS 변수(--이름)로 걸고 className 을 붙인다. 그 전까지는
 * 그림 없는 기본 모양으로 남아서 깨진 그림이 보이지 않는다
 */
export function applyArt(element: HTMLElement, images: Record<string, string>, className = 'has-art', onReady?: () => void): void {
  if (element.classList.contains(className)) return;
  const names = Object.keys(images);
  Promise.all(names.map((name) => loadWithRetry(images[name]))).then(
    (sources) => {
      // 받기 전에 창을 여러 번 열었으면 같은 그림이 여러 번 온다
      if (element.classList.contains(className)) return;
      names.forEach((name, index) => element.style.setProperty(`--${name}`, `url("${sources[index]}")`));
      element.classList.add(className);
      onReady?.();
    },
    () => {},
  );
}

/**
 * 받아 둔 그림으로만 만든다. 그래도 load 전에는 감춰 두고 실패하면 떼어 내서, 깨진 그림 아이콘이
 * (WebKit 은 alt 가 비어 있어도 그린다) 보이지 않게 한다
 */
export function loadedImage(url: string, onLoad?: (image: HTMLImageElement) => void): HTMLImageElement {
  const image = document.createElement('img');
  image.alt = '';
  image.style.visibility = 'hidden';
  image.addEventListener('load', () => {
    onLoad?.(image);
    image.style.visibility = '';
  });
  image.addEventListener('error', () => image.remove());
  const ready = url.startsWith('https://') ? loader.ready(url) : url;
  if (ready) image.src = ready;
  else
    loadWithRetry(url).then(
      (src) => (image.src = src),
      () => image.remove(),
    );
  return image;
}
