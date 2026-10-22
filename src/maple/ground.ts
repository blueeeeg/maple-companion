import type { Foothold } from './api';

export interface Point {
  x: number;
  y: number;
}

/** 이어진 발판들을 왼쪽부터 오른쪽으로 이은 선. 캐릭터와 몬스터가 이 선 위를 걷는다 */
export interface GroundPath {
  points: Point[];
  minX: number;
  maxX: number;
  /** 이 선을 이루는 발판들의 맵 레이어 */
  layer: number;
}

const isWall = (foothold: Foothold) => foothold.x1 === foothold.x2;

function mostCommonLayer(footholds: Foothold[]): number {
  const counts = new Map<number, number>();
  footholds.forEach((foothold) => counts.set(foothold.layerId, (counts.get(foothold.layerId) ?? 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

/** prev/next 로 이어진 발판들을 묶음마다 하나의 선으로 만든다 */
export function groundPaths(footholds: Foothold[]): GroundPath[] {
  const byId = new Map(footholds.map((foothold) => [foothold.id, foothold]));
  const visited = new Set<number>();
  const paths: GroundPath[] = [];

  footholds.forEach((start) => {
    if (visited.has(start.id) || isWall(start)) return;
    let head = start;
    while (byId.has(head.prev) && !visited.has(head.prev) && !isWall(byId.get(head.prev)!) && head.prev !== start.id) {
      head = byId.get(head.prev)!;
    }
    const chain: Foothold[] = [];
    let cursor: Foothold | undefined = head;
    while (cursor && !visited.has(cursor.id) && !isWall(cursor)) {
      visited.add(cursor.id);
      chain.push(cursor);
      cursor = byId.get(cursor.next);
    }
    const points = chain
      .flatMap((foothold) => [
        { x: foothold.x1, y: foothold.y1 },
        { x: foothold.x2, y: foothold.y2 },
      ])
      .sort((a, b) => a.x - b.x);
    if (points.length >= 2) {
      paths.push({ points, minX: points[0].x, maxX: points[points.length - 1].x, layer: mostCommonLayer(chain) });
    }
  });
  return paths;
}

export function groundY(path: GroundPath, x: number): number {
  const { points } = path;
  if (x <= points[0].x) return points[0].y;
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index];
    if (x <= right.x) {
      const span = right.x - left.x;
      return span === 0 ? Math.min(left.y, right.y) : left.y + ((right.y - left.y) * (x - left.x)) / span;
    }
  }
  return points[points.length - 1].y;
}

export interface AlphaMap {
  width: number;
  height: number;
  /** 0~255 */
  alphaAt(x: number, y: number): number;
}

export interface Calibration {
  dx: number;
  dy: number;
  score: number;
}

const SAMPLE_STEP = 12;
const MAX_SAMPLES = 400;
const BELOW = 6;
const ABOVE = 28;
const SEARCH_MARGIN = 12;

/**
 * 맵 렌더 이미지는 원점 정보 없이 그려진 것들의 테두리에 맞춰 잘려 온다.
 * 발판 바로 아래는 땅(불투명), 조금 위는 빈 공간(투명)이 되는 위치를 찾아 월드 좌표 → 이미지 좌표 오프셋을 구한다
 */
export function calibrateFootholds(image: AlphaMap, footholds: Foothold[]): Calibration {
  const floors = footholds.filter((foothold) => !isWall(foothold));
  const samples: Point[] = [];
  floors.forEach((foothold) => {
    const length = Math.hypot(foothold.x2 - foothold.x1, foothold.y2 - foothold.y1);
    const steps = Math.max(1, Math.floor(length / SAMPLE_STEP));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      samples.push({ x: foothold.x1 + (foothold.x2 - foothold.x1) * t, y: foothold.y1 + (foothold.y2 - foothold.y1) * t });
    }
  });
  const stride = Math.max(1, Math.ceil(samples.length / MAX_SAMPLES));
  const picked = samples.filter((_, index) => index % stride === 0);

  const xs = floors.flatMap((foothold) => [foothold.x1, foothold.x2]);
  const ys = floors.flatMap((foothold) => [foothold.y1, foothold.y2]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];

  let best: Calibration = { dx: -minX, dy: -minY, score: -1 };
  for (let dx = -minX - SEARCH_MARGIN; dx <= image.width - maxX + SEARCH_MARGIN; dx += 1) {
    for (let dy = -minY - SEARCH_MARGIN; dy <= image.height - maxY + SEARCH_MARGIN; dy += 1) {
      let score = 0;
      for (let index = 0; index < picked.length; index += 1) {
        const x = Math.round(picked[index].x + dx);
        const y = Math.round(picked[index].y + dy);
        if (image.alphaAt(x, y + BELOW) > 127) score += 1;
        if (image.alphaAt(x, y - ABOVE) < 128) score += 1;
      }
      if (score > best.score) best = { dx, dy, score };
    }
  }
  return best;
}

/** 마을 바닥은 가로로 가장 긴 발판 묶음이다 */
export function mainGround(footholds: Foothold[]): GroundPath | null {
  const paths = groundPaths(footholds).sort((a, b) => b.maxX - b.minX - (a.maxX - a.minX));
  return paths[0] ?? null;
}
