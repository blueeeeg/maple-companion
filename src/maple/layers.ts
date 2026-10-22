import type { Point } from './ground';

const MAP_LAYERS = 8;

/**
 * 맵 레이어 groundLayer 의 발판에 선 캐릭터를 가리는 렌더 레이어 번호들.
 * 원작은 캐릭터를 자기 레이어의 타일 다음, 다음 레이어의 오브젝트 앞에 그린다
 */
export function frontRenderLayers(groundLayer: number): number[] {
  const first = (groundLayer + 1) * 2;
  return Array.from({ length: Math.max(0, MAP_LAYERS * 2 - first) }, (_, index) => first + index);
}

export interface Pixels {
  width: number;
  height: number;
  /** RGBA */
  data: ArrayLike<number>;
}

const MAX_SAMPLES = 400;
const MIN_MATCH_RATIO = 0.9;
const TOLERANCE = 2;

function opaqueSamples(image: Pixels): Point[] {
  let count = 0;
  for (let index = 3; index < image.data.length; index += 4) if (image.data[index] === 255) count += 1;
  const stride = Math.max(1, Math.ceil(count / MAX_SAMPLES));
  const samples: Point[] = [];
  let seen = 0;
  for (let index = 3; index < image.data.length; index += 4) {
    if (image.data[index] !== 255) continue;
    if (seen % stride === 0) {
      const pixel = (index - 3) / 4;
      samples.push({ x: pixel % image.width, y: Math.floor(pixel / image.width) });
    }
    seen += 1;
  }
  return samples;
}

/**
 * overlay 의 왼쪽 위를 base 의 어디에 놓아야 그림이 겹치는지 찾는다. guess 둘레 radius 안에서만 찾고, 못 맞추면 null.
 * overlay 는 base 를 그릴 때 맨 위에 올라간 레이어들이라 불투명한 픽셀은 base 에 같은 색으로 남아 있다
 */
export function alignOverlay(base: Pixels, overlay: Pixels, guess: Point, radius: number): Point | null {
  const samples = opaqueSamples(overlay);
  if (samples.length === 0) return null;
  const allowedMisses = Math.floor(samples.length * (1 - MIN_MATCH_RATIO));
  let best: Point | null = null;
  let bestMisses = allowedMisses + 1;

  for (let y = guess.y - radius; y <= guess.y + radius; y += 1) {
    for (let x = guess.x - radius; x <= guess.x + radius; x += 1) {
      let misses = 0;
      for (let index = 0; index < samples.length && misses < bestMisses; index += 1) {
        const sample = samples[index];
        const baseX = sample.x + x;
        const baseY = sample.y + y;
        if (baseX < 0 || baseY < 0 || baseX >= base.width || baseY >= base.height) {
          misses += 1;
          continue;
        }
        const from = (sample.y * overlay.width + sample.x) * 4;
        const to = (baseY * base.width + baseX) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          if (Math.abs(overlay.data[from + channel] - base.data[to + channel]) > TOLERANCE) {
            misses += 1;
            break;
          }
        }
      }
      if (misses < bestMisses) {
        bestMisses = misses;
        best = { x, y };
      }
    }
  }
  return best;
}
