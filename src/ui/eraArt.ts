import { type Era, MAP_RENDER_TIMEOUT_MS, loginUiUrl, mapRenderUrl } from '../maple/api';
import { cropArt, cropLargeArt } from './art';

/** 시대 고르기 카드 판의 크기. styles.css .create-era-option 과 맞물려 있다 */
export const ERA_PLATE = { width: 76, height: 58 } as const;

// 원작 캐릭터직업 판(NewChar/charJob, 201×224) 아래에 매달린 은테 나무판(x 15~191, y 171~223)을 쓴다.
// 판이 카드보다 넓어서 양 끝 은테(38px씩)만 이어 붙이고, 높이는 가운데 줄 몇 개를 겹쳐 그려 늘린다
const JOB_BOARD = loginUiUrl('NewChar/charJob');
const PLANK = { x: 15, y: 171, width: 177, height: 53 };
const PLANK_CAP = ERA_PLATE.width / 2;
const PLANK_TOP_ROWS = ERA_PLATE.height / 2;

// 창을 열 때마다 부르니 같은 그림을 두 번 떼지 않게 붙잡아 둔다. 실패하면 다음에 다시 뗀다
const pending = new Map<string, Promise<string>>();
function once(key: string, make: () => Promise<string>): Promise<string> {
  let promise = pending.get(key);
  if (!promise) {
    promise = make();
    promise.catch(() => pending.delete(key));
    pending.set(key, promise);
  }
  return promise;
}

/** 카드 판(은테 나무판). 원본 크기라 1배·2배 화면에서 칸 그대로 그린다 */
export function eraPlateArt(): Promise<string> {
  return once('plate', () => cropArt(JOB_BOARD, `era-plate-${ERA_PLATE.width}x${ERA_PLATE.height}`, drawPlate));
}

function drawPlate(image: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = ERA_PLATE.width;
  canvas.height = ERA_PLATE.height;
  const context = canvas.getContext('2d')!;
  const bottomRows = ERA_PLATE.height - PLANK_TOP_ROWS;
  const halves: [sourceY: number, height: number, targetY: number][] = [
    [PLANK.y, PLANK_TOP_ROWS, 0],
    [PLANK.y + PLANK.height - bottomRows, bottomRows, PLANK_TOP_ROWS],
  ];
  const caps: [sourceX: number, targetX: number][] = [
    [PLANK.x, 0],
    [PLANK.x + PLANK.width - PLANK_CAP, PLANK_CAP],
  ];
  halves.forEach(([sy, height, dy]) =>
    caps.forEach(([sx, dx]) => context.drawImage(image, sx, sy, PLANK_CAP, height, dx, dy, PLANK_CAP, height)),
  );
  return canvas.toDataURL();
}

/** 카드 안 헤네시스 그림 칸(CSS px). 2배로 떼어 두어 레티나에서도 선명하다 */
export const ERA_THUMB = { width: 60, height: 30, density: 2 } as const;

const HENESYS = 100000000;
// 같은 헤네시스라도 두 시대 지형이 달라서 시대마다 그 시절 모습이 잘 보이는 곳을 고른다(렌더 원점 기준, 2:1).
// 지금은 주황 버섯집, 빅뱅 전은 빨간 버섯 탑이다
const HENESYS_VIEWS: Record<Era, { x: number; y: number; width: number; height: number }> = {
  current: { x: 3130, y: 640, width: 680, height: 340 },
  classic: { x: 6560, y: 620, width: 720, height: 360 },
};

/** 큰 그림을 한 번에 1/6 로 줄이면 거칠어서 반씩 여러 번 줄인다 */
function shrink(image: CanvasImageSource, x: number, y: number, width: number, height: number, toWidth: number, toHeight: number): HTMLCanvasElement {
  let source = image;
  let box = { x, y, width, height };
  for (;;) {
    const halve = box.width / 2 >= toWidth && box.height / 2 >= toHeight;
    const canvas = document.createElement('canvas');
    canvas.width = halve ? Math.round(box.width / 2) : toWidth;
    canvas.height = halve ? Math.round(box.height / 2) : toHeight;
    const context = canvas.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, canvas.width, canvas.height);
    if (!halve) return canvas;
    source = canvas;
    box = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  }
}

/** 그 시대 헤네시스 맵 렌더에서 떼어 낸 작은 그림. 맵 렌더는 마을에 들어갈 때 쓰는 것과 같은 주소라 기기에 함께 남는다 */
export function eraThumbArt(era: Era): Promise<string> {
  const view = HENESYS_VIEWS[era];
  const { width, height, density } = ERA_THUMB;
  const version = `era-thumb-${view.x},${view.y},${view.width},${view.height}@${width * density}`;
  return once(`thumb-${era}`, () =>
    cropLargeArt(mapRenderUrl(HENESYS, era), version, MAP_RENDER_TIMEOUT_MS, (image) =>
      shrink(image, view.x, view.y, view.width, view.height, width * density, height * density).toDataURL(),
    ),
  );
}
