// maplestory.io 는 Origin 이 있을 때만 CORS 헤더를 주고 Vary 도 안 붙인다. 일반 <img> 로 먼저 받으면
// 헤더 없는 응답이 브라우저 캐시에 남아, 같은 주소를 fetch 하는 맵 화면의 캐릭터 로딩이 CORS 로 실패한다.
// 그래서 DOM 화면(캐릭터 선택·캐시샵·HUD)의 이미지는 모두 crossorigin 으로 받고, CSS 배경도 crossorigin 으로 먼저 받아 둔 뒤에만 건다
const loadedImages = new Map<string, Promise<void>>();
// 받아 둔 Image 를 붙잡아 둬야 브라우저가 풀어 둔 그림을 버리지 않는다. 버리면 숨겨 뒀던 창(삭제 확인 등)을
// 열 때 배경을 다시 풀어 그리느라 잠깐 빈 판이 보인다
const keptImages = new Set<HTMLImageElement>();
function loadImage(url: string): Promise<void> {
  let loading = loadedImages.get(url);
  if (!loading) {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = url;
    loading = image.decode().then(
      () => void keptImages.add(image),
      (error: unknown) => {
        loadedImages.delete(url);
        throw error;
      },
    );
    loadedImages.set(url, loading);
  }
  return loading;
}

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** maplestory.io 는 가끔 느리거나 실패한다. 몇 번 쉬었다 다시 받고, 끝내 못 받으면 거절한다 */
export async function loadWithRetry(url: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await loadImage(url);
    } catch (error) {
      if (attempt >= RETRY_ATTEMPTS) throw error;
      await wait(attempt * RETRY_DELAY_MS);
    }
  }
}

/**
 * 원작 그림을 다 받은 뒤에만 CSS 변수(--이름)로 걸고 className 을 붙인다. 그 전까지와 끝내 못 받았을 때는
 * 그림 없는 기본 모양으로 남아서 깨진 그림이 보이지 않는다
 */
export function applyArt(element: HTMLElement, images: Record<string, string>, className = 'has-art', onReady?: () => void): void {
  if (element.classList.contains(className)) return;
  Promise.all(Object.values(images).map(loadWithRetry)).then(
    () => {
      Object.entries(images).forEach(([name, url]) => element.style.setProperty(`--${name}`, `url("${url}")`));
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
  image.crossOrigin = 'anonymous';
  image.style.visibility = 'hidden';
  image.addEventListener('load', () => {
    onLoad?.(image);
    image.style.visibility = '';
  });
  image.addEventListener('error', () => image.remove());
  image.src = url;
  return image;
}
