import { ImageSource, Texture } from 'pixi.js';
import { MAP_RENDER_TIMEOUT_MS, fetchWithin } from './api';
import { gifFrameDelays } from './gif';
import type { AlphaMap } from './ground';
import type { Pixels } from './layers';

const textures = new Map<string, Promise<Texture>>();

function loadBitmap(url: string, timeoutMs?: number): Promise<ImageBitmap> {
  return fetchWithin(
    url,
    async (response) => {
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return createImageBitmap(await response.blob());
    },
    timeoutMs,
  );
}

const toTexture = (bitmap: ImageBitmap) =>
  new Texture({ source: new ImageSource({ resource: bitmap, scaleMode: 'nearest' }) });

/** 도트가 뭉개지지 않게 최근접 보간으로 올린다. 같은 주소는 한 번만 받는다 */
export function loadTexture(url: string): Promise<Texture> {
  let pending = textures.get(url);
  if (!pending) {
    pending = loadBitmap(url).then(toTexture);
    pending.catch(() => textures.delete(url));
    textures.set(url, pending);
  }
  return pending;
}

export function loadFrames(urls: string[]): Promise<Texture[]> {
  return Promise.all(urls.map(loadTexture));
}

export async function textureFromBase64(png: string): Promise<Texture> {
  return toTexture(await loadBitmap(`data:image/png;base64,${png}`));
}

export interface Animation {
  frames: Texture[];
  /** ms. 원작 프레임 딜레이 */
  delays: number[];
}

/** 애니메이션 GIF 로 프레임 수와 딜레이를 읽고, 프레임은 투명도가 살아 있는 PNG 로 받는다 */
export async function loadAnimation(gifUrl: string, frameUrl: (frame: number) => string): Promise<Animation> {
  const delays = await fetchWithin(gifUrl, async (response) => {
    if (!response.ok) throw new Error(`${response.status} ${gifUrl}`);
    return gifFrameDelays(await response.arrayBuffer());
  });
  const frames = await loadFrames(delays.map((_, frame) => frameUrl(frame)));
  return { frames, delays };
}

/** 지난 시간(ms)에 해당하는 프레임 번호. loop 가 아니면 마지막 프레임에서 멈추고 -1 을 돌려준다 */
export function frameAt(delays: number[], elapsedMs: number, loop: boolean): number {
  const total = delays.reduce((sum, delay) => sum + delay, 0);
  if (!loop && elapsedMs >= total) return -1;
  let remaining = loop ? elapsedMs % total : elapsedMs;
  for (let index = 0; index < delays.length; index += 1) {
    if (remaining < delays[index]) return index;
    remaining -= delays[index];
  }
  return delays.length - 1;
}

/** 맵 이미지는 발판과 앞 레이어 위치를 맞추려고 픽셀값도 함께 읽는다 */
export async function loadMapImage(url: string): Promise<{ texture: Texture; alpha: AlphaMap; pixels: Pixels }> {
  const bitmap = await loadBitmap(url, MAP_RENDER_TIMEOUT_MS);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return {
    texture: toTexture(bitmap),
    alpha: {
      width,
      height,
      alphaAt: (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : data[(y * width + x) * 4 + 3]),
    },
    pixels: { width, height, data },
  };
}

/** 그릴 것이 없는 레이어는 404, 맵 레이어가 통째로 비어 있으면 400(서버가 빈 목록의 최솟값을 구하다 실패)으로 온다 */
function loadOptionalBitmap(url: string): Promise<ImageBitmap | null> {
  return fetchWithin(
    url,
    async (response) => {
      if (response.status === 404 || response.status === 400) return null;
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return createImageBitmap(await response.blob());
    },
    MAP_RENDER_TIMEOUT_MS,
  );
}

/** 원점을 같게 받은 레이어 이미지들을 순서대로 겹쳐 한 장으로 만든다. 모두 비어 있으면 null */
export async function loadLayerStack(urls: string[]): Promise<{ texture: Texture; pixels: Pixels } | null> {
  const bitmaps = (await Promise.all(urls.map(loadOptionalBitmap))).filter((bitmap) => bitmap !== null);
  if (bitmaps.length === 0) return null;
  const width = Math.max(...bitmaps.map((bitmap) => bitmap.width));
  const height = Math.max(...bitmaps.map((bitmap) => bitmap.height));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  bitmaps.forEach((bitmap) => {
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
  });
  const { data } = context.getImageData(0, 0, width, height);
  return { texture: toTexture(await createImageBitmap(canvas)), pixels: { width, height, data } };
}
