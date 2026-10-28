import { type Era, MAP_RENDER_TIMEOUT_MS, mapInfoUrl, mapRenderUrl, wzImageUrl } from './api';
import { artStore, fetchStored } from './artStore';
import type { EffectLayer } from './skills';
import { loadTexture } from './textures';

// 맵에 늘 보이는 포털(Map.wz MapHelper.img/portal/game/pv/default). 원점은 KMS 389 값이고 딜레이 값이 없어 WZ 기본 100ms 다.
// 0번 프레임은 _outlink 가 에디터 포털 그림(portal/editor/pv)을 가리킨다
const PORTAL_FRAMES: readonly { path: string; origin: [number, number] }[] = [
  { path: 'Map/_Canvas/MapHelper.img/portal/editor/pv', origin: [49, 134] },
  ...([
    [48, 130],
    [50, 123],
    [50, 125],
    [50, 130],
    [51, 130],
    [49, 126],
    [49, 130],
  ] as [number, number][]).map((origin, index) => ({ path: `Map/_Canvas/MapHelper.img/portal/game/pv/default/${index + 1}`, origin })),
];
// GMS 83 은 `_Canvas` 가 없고 그림이 원래 자리(game/pv/0~7)에 있다. 원점은 v83 WZ 값이고 딜레이 값이 없다
const CLASSIC_PORTAL_FRAMES: readonly { path: string; origin: [number, number] }[] = (
  [
    [43, 173],
    [43, 173],
    [44, 193],
    [43, 193],
    [42, 209],
    [42, 209],
    [41, 248],
    [42, 246],
  ] as [number, number][]
).map((origin, index) => ({ path: `Map/MapHelper.img/portal/game/pv/${index}`, origin }));
const PORTAL_DELAY = 100;

const portalFrames = new Map<Era, Promise<EffectLayer>>();

/** 시대마다 한 번만 받는다. 실패하면 다음 호출에 다시 받는다 */
export function loadPortalFrames(era: Era = 'current'): Promise<EffectLayer> {
  let frames = portalFrames.get(era);
  if (!frames) {
    frames = Promise.all(
      (era === 'classic' ? CLASSIC_PORTAL_FRAMES : PORTAL_FRAMES).map(async ({ path, origin: [x, y] }) => ({
        texture: await loadTexture(wzImageUrl(path, era)),
        origin: { x, y },
        delay: PORTAL_DELAY,
      })),
    );
    portalFrames.set(era, frames);
    frames.catch(() => portalFrames.delete(era));
  }
  return frames;
}

const WARM_GAP_MS = 3000;
/** 맵 정보 주소로 센다. 시대가 다르면 같은 맵 ID 라도 다른 맵이다 */
const warmed = new Set<string>();
let warmQueue: { mapId: number; era: Era }[] = [];
let warming = false;

/**
 * 곧 갈 사냥터 맵을 하나씩 미리 받아 둔다. 서버는 처음 그리는 맵 렌더에 40초 넘게 걸리기도 해서, 한 번 그려 두게 하면
 * 실제로 옮길 때 금방 온다. 받은 것은 기기에 남겨 다음 실행에는 받지 않는다
 */
export function warmMaps(mapIds: number[], era: Era = 'current'): void {
  warmQueue = mapIds.filter((mapId) => !warmed.has(mapInfoUrl(mapId, era))).map((mapId) => ({ mapId, era }));
  if (!warming) void warmNext();
}

async function warmNext(): Promise<void> {
  const next = warmQueue.shift();
  if (next === undefined) {
    warming = false;
    return;
  }
  const { mapId, era } = next;
  warming = true;
  warmed.add(mapInfoUrl(mapId, era));
  const store = async (url: string, timeoutMs?: number) => {
    if (await artStore.has(url)) return;
    await fetchStored(
      url,
      async (response) => {
        if (!response.ok) throw new Error(`${response.status} ${url}`);
        await response.arrayBuffer();
      },
      timeoutMs,
    );
  };
  await store(mapInfoUrl(mapId, era))
    .then(() => store(mapRenderUrl(mapId, era), MAP_RENDER_TIMEOUT_MS))
    .catch(() => warmed.delete(mapInfoUrl(mapId, era)));
  setTimeout(() => void warmNext(), WARM_GAP_MS);
}
