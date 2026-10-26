import { type Calibration, type Point, correctCalibration } from './ground';
import type { LadderRope } from './navigation';

const MAP_LAYERS = 8;

/**
 * 맵 레이어 groundLayer 의 발판에 선 캐릭터를 가리는 렌더 레이어 번호들.
 * 원작은 캐릭터를 자기 레이어의 타일 다음, 다음 레이어의 오브젝트 앞에 그린다
 */
export function frontRenderLayers(groundLayer: number): number[] {
  const first = (groundLayer + 1) * 2;
  return Array.from({ length: Math.max(0, MAP_LAYERS * 2 - first) }, (_, index) => first + index);
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 줄 그림이 x 에서 옆으로 퍼지는 폭과 위 끝(y1)보다 솟는 높이. 로프 위 끝 말뚝과 사다리 기둥까지 덮게 렌더로 재어 잡았다
const ROPE_HALF_WIDTH = 14;
const LADDER_HALF_WIDTH = 32;
const LADDER_ROPE_RISE = 24;
const LADDER_ROPE_DROP = 4;

/**
 * renderLayers 마다 앞 레이어에서 지울 사다리·로프 그림 자리. origin 은 그 레이어 그림 왼쪽 위의 맵 좌표다.
 * 줄 그림은 그 page 의 오브젝트 레이어에 있어서 더 낮은 발판을 걷는 캐릭터가 줄 끝(말뚝·사다리 아래 끝) 뒤로 숨는다.
 * 지나가기만 해도 줄 뒤로 밀려 보이지 않게 앞 레이어에서는 빼고 캐릭터 뒤의 전체 렌더에만 남긴다
 */
export function ladderRopeMasks(ladders: readonly LadderRope[], renderLayers: readonly number[], origin: Point): Rect[][] {
  return renderLayers.map((layer) =>
    ladders
      .filter((ladder) => ladder.page !== undefined && ladder.page * 2 === layer)
      .map((ladder) => {
        const half = ladder.isLadder ? LADDER_HALF_WIDTH : ROPE_HALF_WIDTH;
        return {
          x: ladder.x - half - origin.x,
          y: ladder.y1 - LADDER_ROPE_RISE - origin.y,
          width: half * 2,
          height: ladder.y2 - ladder.y1 + LADDER_ROPE_RISE + LADDER_ROPE_DROP,
        };
      }),
  );
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
/** 자리마다 먼저 보는 고르게 뽑은 표본 수 */
const PROBES = 16;

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
export function alignOverlay(
  base: Pixels,
  overlay: Pixels,
  guess: Point,
  radius: number,
  minMatchRatio = MIN_MATCH_RATIO,
): Point | null {
  const samples = opaqueSamples(overlay);
  if (samples.length === 0) return null;
  const allowedMisses = Math.floor(samples.length * (1 - minMatchRatio));
  let best: Point | null = null;
  let bestMisses = allowedMisses + 1;
  const matches = (sample: Point, x: number, y: number) => {
    const baseX = sample.x + x;
    const baseY = sample.y + y;
    if (baseX < 0 || baseY < 0 || baseX >= base.width || baseY >= base.height) return false;
    const from = (sample.y * overlay.width + sample.x) * 4;
    const to = (baseY * base.width + baseX) * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      if (Math.abs(overlay.data[from + channel] - base.data[to + channel]) > TOLERANCE) return false;
    }
    return true;
  };
  // 넓게 찾으면 자리가 수십만 곳이라, 그림 전체에서 고르게 뽑은 표본이 하나도 안 맞는 자리는 다 보지 않고 버린다.
  // 제자리는 표본 대부분이 맞으니 이것으로 버려지지 않는다
  const probeStride = Math.max(1, Math.floor(samples.length / PROBES));
  const probes = samples.filter((_, index) => index % probeStride === 0);

  for (let y = guess.y - radius; y <= guess.y + radius; y += 1) {
    for (let x = guess.x - radius; x <= guess.x + radius; x += 1) {
      if (!probes.some((sample) => matches(sample, x, y))) continue;
      let misses = 0;
      for (let index = 0; index < samples.length && misses < bestMisses; index += 1) {
        if (!matches(samples[index], x, y)) misses += 1;
      }
      if (misses < bestMisses) {
        bestMisses = misses;
        best = { x, y };
      }
    }
  }
  return best;
}

/**
 * 레이어를 겹쳐 볼 단계. pad 는 레이어 원점을 어림보다 왼쪽·위로 얼마나 물려 받는지, radius 는 어림 자리 둘레 몇 px 를
 * 찾는지다. 좁은 단계는 가로로 25px 넘게 틀린 어림(츄츄 알록달록 숲지대1)까지 덮는다. 넓은 단계는 발판 위까지 배경이
 * 불투명해 투명도 어림이 120~330px 틀리는 맵(무릉 수련장·세르니움 성문) 때문에 있다
 */
export const CALIBRATION_PASSES = [
  { pad: 24, radius: 48 },
  { pad: 424, radius: 400 },
] as const;

/**
 * 바닥 레이어 그림을 전체 렌더에 겹쳐 어림 보정(rough)을 정확히 고친다. 좁은 단계에서 모든 레이어 조합이 안 맞을 때만
 * 넓은 단계로 간다. loadOverlay(variant, minX, minY) 는 그 원점으로 받은 variant 번째 레이어 조합, 없으면 null.
 * 어느 단계에서도 못 맞추면 null 이고 부르는 쪽은 어림 보정을 그대로 쓴다
 */
export async function exactCalibrationFrom(
  rough: Calibration,
  base: Pixels,
  variants: number,
  loadOverlay: (variant: number, minX: number, minY: number) => Promise<Pixels | null>,
  minMatchRatio: number,
): Promise<Calibration | null> {
  for (const { pad, radius } of CALIBRATION_PASSES) {
    for (let variant = 0; variant < variants; variant += 1) {
      const overlay = await loadOverlay(variant, Math.round(-rough.dx) - pad, Math.round(-rough.dy) - pad);
      if (!overlay) continue;
      const at = alignOverlay(base, overlay, { x: -pad, y: -pad }, radius, minMatchRatio);
      if (at) return correctCalibration(rough, at, pad);
    }
  }
  return null;
}
