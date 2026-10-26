import { wzImageUrl } from './api';
import type { EffectLayer } from './skills';
import { loadTexture } from './textures';

// 보스 의자의 Item.wz Install 값(KMS 389). 프레임은 [origin x, origin y, delay] 이고, delay 가 없는 프레임은 WZ 기본 100ms 로 적었다.
// 그림은 _outlink 가 가리키는 _Canvas 아래에서 받는다. 다른 프레임·다른 의자 그림을 가리키는 프레임만 넷째 값에 그 경로를 적는다
type ChairFrame = [originX: number, originY: number, delay: number, link?: string];

export interface ChairLayerData {
  node: string;
  /** 음수면 캐릭터 뒤, 0 이상이면 앞 */
  z: number;
  /** 1 이면 기준점이 캐릭터 이마다 */
  pos?: number;
  frames: ChairFrame[];
}

export interface ChairArt {
  id: number;
  img: string;
  /** 캐릭터를 발에서 이만큼 옮겨 그린다. 왼쪽을 볼 때 기준이다 */
  bodyRelMove?: [number, number];
  /** 앉기(sit) 대신 쓰는 캐릭터 동작. 있으면 의자 기준점이 옮기기 전 발이다 */
  sitAction?: string;
  /** 오른쪽을 봐도 뒤집지 않는다 */
  sitLeft?: true;
  hideWeapon?: true;
  hideCape?: true;
  layers: ChairLayerData[];
}

export const CHAIR_ART: ChairArt[] = [
  {
    id: 3010001,
    img: '03010.img',
    layers: [
      { node: 'effect', z: -1, frames: [[21, 33, 100]] },
    ],
  },
  {
    id: 3010423,
    img: '03010.img',
    bodyRelMove: [0, -80],
    layers: [
      { node: 'effect', z: -1, frames: [[62, 52, 180], [62, 52, 180], [62, 52, 180], [62, 52, 180], [62, 52, 180], [62, 52, 180], [62, 52, 180]] },
    ],
  },
  {
    id: 3017000,
    img: '03017.img',
    bodyRelMove: [0, -33],
    hideWeapon: true,
    hideCape: true,
    layers: [
      { node: 'effect', z: -1, frames: [[59, 17, 100], [58, 17, 100], [57, 16, 100], [58, 17, 100, '03017.img/03017000/effect/1']] },
    ],
  },
  {
    id: 3018221,
    img: '03018.img',
    bodyRelMove: [8, -11],
    hideWeapon: true,
    hideCape: true,
    layers: [
      { node: 'effect', z: 3, frames: [[52, 6, 210], [52, 12, 210], [52, 14, 210], [53, 16, 210], [53, 19, 210], [52, 24, 210], [52, 16, 210], [53, 19, 210], [53, 22, 210]] },
      { node: 'effect2', z: -2, frames: [[57, 83, 100]] },
    ],
  },
  {
    id: 3017028,
    img: '03017.img',
    bodyRelMove: [0, -33],
    layers: [
      { node: 'effect', z: -1, frames: [[62, 16, 180], [62, 15, 180], [62, 14, 180], [62, 15, 180]] },
    ],
  },
  {
    id: 3010455,
    img: '03010.img',
    layers: [
      { node: 'effect', z: -1, pos: 1, frames: [[57, 76, 150], [56, 76, 150], [55, 76, 150], [56, 76, 150]] },
    ],
  },
  {
    id: 3017079,
    img: '03017.img',
    bodyRelMove: [0, -33],
    hideWeapon: true,
    hideCape: true,
    layers: [
      { node: 'effect', z: -1, frames: [[47, 32, 100], [49, 32, 100], [50, 32, 100], [50, 32, 100], [48, 32, 100], [47, 33, 100], [47, 33, 100], [48, 32, 100], [49, 32, 100], [48, 32, 100], [47, 32, 100], [47, 32, 100]] },
    ],
  },
  {
    id: 3017029,
    img: '03017.img',
    bodyRelMove: [0, -33],
    layers: [
      { node: 'effect', z: -1, frames: [[73, 19, 180], [73, 18, 180], [73, 17, 180], [73, 18, 180]] },
    ],
  },
  {
    id: 3010636,
    img: '03010.img',
    layers: [
      { node: 'effect', z: -1, pos: 1, frames: [[69, 60, 120], [69, 59, 120], [69, 57, 120], [69, 56, 120], [69, 59, 120], [69, 60, 120]] },
    ],
  },
  {
    id: 3015521,
    img: '030155.img',
    bodyRelMove: [-50, -65],
    sitAction: 'stand1',
    sitLeft: true,
    hideWeapon: true,
    hideCape: true,
    layers: [
      { node: 'effect', z: 3, frames: [[106, 197, 100], [112, 192, 100], [111, 185, 100], [107, 182, 100], [101, 190, 100], [99, 185, 100], [104, 178, 100], [113, 175, 100]] },
      { node: 'effect2', z: -1, frames: [[86, 188, 100], [86, 189, 100], [86, 190, 100], [86, 189, 100], [86, 188, 100], [86, 187, 100], [86, 186, 100], [86, 187, 100]] },
    ],
  },
  {
    id: 3010965,
    img: '03010.img',
    bodyRelMove: [0, -2],
    layers: [
      { node: 'effect', z: -1, frames: [[138, 191, 100], [138, 191, 100], [138, 191, 100], [138, 191, 100], [138, 191, 100], [138, 191, 100], [138, 191, 100], [138, 191, 100]] },
    ],
  },
  {
    id: 3017005,
    img: '03017.img',
    bodyRelMove: [0, -33],
    hideWeapon: true,
    hideCape: true,
    layers: [
      { node: 'effect', z: -1, frames: [[58, 17, 100], [57, 17, 100], [56, 16, 100], [57, 17, 100, '03017.img/03017005/effect/1']] },
    ],
  },
  {
    id: 3017004,
    img: '03017.img',
    bodyRelMove: [0, -33],
    layers: [
      { node: 'effect', z: -1, frames: [[58, 16, 100], [57, 16, 100], [56, 15, 100], [57, 16, 100, '03017.img/03017004/effect/1']] },
    ],
  },
  {
    id: 3018790,
    img: '03018.img',
    bodyRelMove: [2, -7],
    sitAction: 'sit',
    hideWeapon: true,
    hideCape: true,
    layers: [
      { node: 'effect', z: -1, frames: [[137, 252, 150], [138, 252, 150], [139, 252, 150], [139, 252, 150], [139, 252, 150], [138, 252, 150], [137, 252, 150], [136, 252, 150], [137, 252, 150], [138, 252, 150], [139, 252, 150], [139, 252, 150], [140, 252, 150], [139, 252, 150], [139, 252, 150], [138, 252, 150]] },
    ],
  },
  {
    id: 3010430,
    img: '03010.img',
    layers: [
      { node: 'effect', z: -1, frames: [[72, 104, 2400], [72, 104, 96], [72, 104, 120], [72, 104, 6000, '03010.img/03010430/effect/0'], [72, 104, 96, '03010.img/03010430/effect/1'], [72, 104, 120, '03010.img/03010430/effect/2'], [72, 104, 4800, '03010.img/03010430/effect/0'], [72, 104, 120], [72, 104, 120, '03010.img/03010430/effect/1'], [72, 104, 240, '03010.img/03010430/effect/2'], [72, 104, 144, '03010.img/03010430/effect/1'], [72, 104, 6000, '03010.img/03010430/effect/7'], [72, 104, 144, '03010.img/03010430/effect/1'], [72, 104, 360, '03010.img/03010430/effect/2'], [72, 104, 144, '03010.img/03010430/effect/1'], [72, 104, 7200, '03010.img/03010430/effect/7'], [72, 104, 144, '03010.img/03010430/effect/1'], [72, 104, 720, '03010.img/03010430/effect/2'], [72, 104, 96, '03010.img/03010430/effect/1']] },
    ],
  },
  {
    id: 3010581,
    img: '03010.img',
    layers: [
      { node: 'effect', z: -1, pos: 1, frames: [[43, 78, 120], [44, 77, 120], [45, 76, 120], [44, 76, 120], [43, 77, 120], [44, 77, 120], [45, 77, 120], [46, 77, 120], [44, 78, 120]] },
    ],
  },
  {
    id: 3010321,
    img: '03010.img',
    layers: [
      { node: 'effect', z: -1, frames: [[20, 62, 200, '03010.img/03010320/effect/0'], [20, 62, 200, '03010.img/03010320/effect/1'], [20, 62, 200, '03010.img/03010320/effect/2'], [20, 62, 200, '03010.img/03010320/effect/3'], [20, 62, 200, '03010.img/03010320/effect/0'], [20, 62, 200, '03010.img/03010320/effect/1'], [20, 62, 200, '03010.img/03010320/effect/2'], [20, 62, 200, '03010.img/03010320/effect/3'], [20, 62, 200, '03010.img/03010320/effect/0'], [20, 62, 200, '03010.img/03010320/effect/1'], [20, 62, 200, '03010.img/03010320/effect/2'], [20, 62, 200, '03010.img/03010320/effect/3']] },
      { node: 'effect2', z: 3, frames: [[58, 88, 200], [58, 88, 200], [58, 88, 200], [58, 88, 200], [58, 88, 200], [58, 88, 200], [58, 88, 200], [58, 88, 200], [58, 88, 200, '03010.img/03010321/effect2/4'], [58, 88, 200], [58, 88, 200, '03010.img/03010321/effect2/2'], [58, 88, 200, '03010.img/03010321/effect2/7']] },
    ],
  },
  {
    id: 3010676,
    img: '03010.img',
    bodyRelMove: [0, -30],
    layers: [
      { node: 'effect', z: 1, frames: [[160, 96, 120], [160, 95, 120], [160, 94, 120]] },
      { node: 'effect2', z: -1, frames: [[166, 141, 120], [166, 141, 120, '03010.img/03010676/effect2/0'], [166, 141, 120, '03010.img/03010676/effect2/0']] },
    ],
  },
  {
    id: 3010225,
    img: '03010.img',
    bodyRelMove: [0, -86],
    layers: [
      { node: 'effect', z: -1, frames: [[60, 34, 100], [60, 34, 100], [60, 34, 100], [60, 34, 100], [60, 34, 100], [60, 34, 100], [60, 34, 100], [60, 34, 100]] },
    ],
  },
  {
    id: 3010592,
    img: '03010.img',
    bodyRelMove: [0, -86],
    layers: [
      { node: 'effect', z: -1, frames: [[60, 34, 100], [60, 34, 100], [60, 34, 100], [60, 34, 100], [60, 34, 100], [60, 34, 100], [60, 34, 100], [60, 34, 100]] },
    ],
  },
  {
    id: 3015118,
    img: '030151.img',
    bodyRelMove: [50, -65],
    sitAction: 'sit',
    sitLeft: true,
    hideWeapon: true,
    hideCape: true,
    layers: [
      { node: 'effect', z: 1, frames: [[86, 147, 150], [86, 149, 150], [86, 150, 150], [82, 149, 150], [72, 147, 150], [83, 146, 150], [83, 143, 150], [87, 146, 150]] },
      { node: 'effect2', z: -1, frames: [[-1, 183, 150], [-1, 183, 150], [-1, 183, 150, '030151.img/03015118/effect2/0'], [-1, 183, 150, '030151.img/03015118/effect2/1'], [-1, 183, 150, '030151.img/03015118/effect2/0'], [-1, 183, 150, '030151.img/03015118/effect2/1'], [-1, 183, 150, '030151.img/03015118/effect2/0'], [-1, 183, 150, '030151.img/03015118/effect2/1']] },
    ],
  },
  {
    id: 3017061,
    img: '03017.img',
    bodyRelMove: [0, -33],
    hideWeapon: true,
    hideCape: true,
    layers: [
      { node: 'effect', z: -1, frames: [[83, 80, 100], [86, 89, 100], [88, 84, 100], [82, 86, 100], [87, 71, 100], [76, 89, 100], [77, 78, 100], [79, 90, 100]] },
    ],
  },
  {
    id: 3010404,
    img: '03010.img',
    layers: [
      { node: 'effect', z: -1, frames: [[106, 158, 100], [105, 158, 100], [104, 158, 100], [105, 157, 100], [106, 158, 100], [105, 158, 100], [104, 158, 100], [105, 158, 100]] },
    ],
  },
];

const artById = new Map(CHAIR_ART.map((art) => [art.id, art]));
export const chairArtOf = (chairId: number): ChairArt | null => artById.get(chairId) ?? null;

const frameUrl = (art: ChairArt, layer: ChairLayerData, index: number) => {
  const link = layer.frames[index][3] ?? `${art.img}/0${art.id}/${layer.node}/${index}`;
  return wzImageUrl(`Item/Install/_Canvas/${link}`);
};

export interface LoadedChairLayer {
  data: ChairLayerData;
  frames: EffectLayer;
}

const loaded = new Map<number, Promise<LoadedChairLayer[]>>();

/** 한 번만 받는다. 실패하면 다음 호출에 다시 받는다 */
export function loadChairLayers(art: ChairArt): Promise<LoadedChairLayer[]> {
  let pending = loaded.get(art.id);
  if (!pending) {
    pending = Promise.all(
      art.layers.map(async (layer) => ({
        data: layer,
        frames: await Promise.all(
          layer.frames.map(async ([x, y, delay], index) => ({
            texture: await loadTexture(frameUrl(art, layer, index)),
            origin: { x, y },
            delay,
          })),
        ),
      })),
    );
    pending.catch(() => loaded.delete(art.id));
    loaded.set(art.id, pending);
  }
  return pending;
}
