import { MAP_RENDER_TIMEOUT_MS, fetchWithin, mapInfoUrl, mapRenderUrl, wzImageUrl } from './api';
import type { EffectLayer } from './skills';
import { loadTexture } from './textures';

// 맵에 늘 보이는 포털(Map.wz MapHelper.img/portal/game/pv/default). 원점은 KMS 389 값이고 딜레이 값이 없어 WZ 기본 100ms 다.
// 0번 프레임은 _outlink 가 에디터 포털 그림(portal/editor/pv)을 가리킨다
const PORTAL_FRAMES: readonly { path: string; origin: [number, number] }[] = [
  { path: 'editor/pv', origin: [49, 134] },
  ...([
    [48, 130],
    [50, 123],
    [50, 125],
    [50, 130],
    [51, 130],
    [49, 126],
    [49, 130],
  ] as [number, number][]).map((origin, index) => ({ path: `game/pv/default/${index + 1}`, origin })),
];
const PORTAL_DELAY = 100;

let portalFrames: Promise<EffectLayer> | null = null;

/** 한 번만 받는다. 실패하면 다음 호출에 다시 받는다 */
export function loadPortalFrames(): Promise<EffectLayer> {
  if (!portalFrames) {
    portalFrames = Promise.all(
      PORTAL_FRAMES.map(async ({ path, origin: [x, y] }) => ({
        texture: await loadTexture(wzImageUrl(`Map/_Canvas/MapHelper.img/portal/${path}`)),
        origin: { x, y },
        delay: PORTAL_DELAY,
      })),
    );
    portalFrames.catch(() => (portalFrames = null));
  }
  return portalFrames;
}

const WARM_GAP_MS = 3000;
const warmed = new Set<number>();
let warmQueue: number[] = [];
let warming = false;

/**
 * 곧 갈 사냥터 맵을 하나씩 미리 받아 둔다. 서버는 처음 그리는 맵 렌더에 40초 넘게 걸리기도 해서, 한 번 그려 두게 하면
 * 실제로 옮길 때 금방 온다. 받은 것은 버린다
 */
export function warmMaps(mapIds: number[]): void {
  warmQueue = mapIds.filter((mapId) => !warmed.has(mapId));
  if (!warming) void warmNext();
}

async function warmNext(): Promise<void> {
  const mapId = warmQueue.shift();
  if (mapId === undefined) {
    warming = false;
    return;
  }
  warming = true;
  warmed.add(mapId);
  const read = (response: Response) => response.arrayBuffer();
  await fetchWithin(mapInfoUrl(mapId), read)
    .then(() => fetchWithin(mapRenderUrl(mapId), read, MAP_RENDER_TIMEOUT_MS))
    .catch(() => warmed.delete(mapId));
  setTimeout(() => void warmNext(), WARM_GAP_MS);
}
