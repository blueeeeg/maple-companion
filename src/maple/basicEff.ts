import { Texture } from 'pixi.js';
import { basicEffUrl } from './api';
import type { EffectLayer } from './skills';
import { loadTexture } from './textures';

// 원점·딜레이는 KMS 389 Effect.wz BasicEff.img 값이다. 그림은 _outlink 가 가리키는 _Canvas 아래에서 받는다

type Origin = readonly [x: number, y: number];

/** 0~9 순서. 큰 글꼴(…1)과 작은 글꼴(…0)은 크기가 달라 원점도 다르다 */
const DIGIT_ORIGINS: Record<string, readonly Origin[]> = {
  NoRed0: [[15, 32], [11, 31], [14, 32], [14, 31], [15, 32], [14, 31], [15, 32], [14, 31], [15, 32], [15, 32]],
  NoRed1: [[18, 37], [12, 36], [17, 37], [16, 37], [18, 36], [17, 37], [18, 37], [16, 37], [18, 38], [18, 37]],
  NoCri0: [[18, 37], [12, 36], [17, 37], [16, 37], [18, 36], [17, 37], [18, 37], [16, 37], [18, 38], [18, 37]],
  NoCri1: [[21, 45], [14, 43], [20, 44], [20, 45], [21, 44], [19, 45], [21, 44], [20, 44], [20, 45], [21, 45]],
};
/** 크리티컬 첫 자리 뒤에 터지는 불꽃. 첫 자리 원점에 맞춰 그리면 숫자 왼쪽 위에 걸린다 */
const CRITICAL_EFFECT_ORIGIN: Origin = [41, 70];

/** 0번 프레임은 1×1 빈 그림에 딜레이 500 이라 이펙트가 반 박자 늦게 터진다 */
const LEVEL_UP_LEAD_MS = 500;
const LEVEL_UP_DELAY = 90;
const LEVEL_UP_ORIGINS: readonly Origin[] = [
  [131, 564], [105, 613], [113, 599], [121, 599], [165, 535], [192, 522], [190, 296], [193, 306], [198, 310], [202, 311],
  [423, 486], [423, 526], [423, 543], [423, 606], [448, 643], [448, 643], [448, 643], [448, 643], [448, 643], [353, 549],
];
const JOB_CHANGED_DELAY = 100;
const JOB_CHANGED_ORIGINS: readonly Origin[] = [
  [51, 108], [52, 111], [54, 111], [56, 121], [58, 316], [75, 318], [83, 316], [85, 328], [85, 343], [83, 340], [82, 309],
  [82, 303], [82, 295],
];

export interface GlyphMetrics {
  width: number;
  origin: { x: number; y: number };
}

export interface Glyph extends GlyphMetrics {
  texture: Texture;
}

export interface DamageFont<G extends GlyphMetrics = Glyph> {
  /** 첫 자리용 큰 숫자 0~9 */
  first: G[];
  /** 둘째 자리부터 쓰는 숫자 0~9 */
  rest: G[];
  /** 크리티컬 불꽃. 일반 대미지는 null */
  effect: G | null;
}

export type DamageStyle = 'normal' | 'critical';

/** 이웃한 숫자의 테두리를 겹치는 폭(원본 px). 원작 대미지 숫자는 테두리끼리 붙어 한 덩어리로 보인다 */
export const DIGIT_OVERLAP = 8;

/**
 * 숫자마다 원점을 둘 x 위치. 원점은 숫자 아래 가운데이고 모든 숫자의 원점 y 가 한 줄(바닥선)이다.
 * 이웃한 두 숫자는 그림 가장자리가 overlap 만큼 겹치게 붙이고, 줄 전체 그림 폭의 가운데가 0 에 오게 민다
 */
export function layoutDamage<G extends GlyphMetrics>(
  value: number,
  font: Pick<DamageFont<G>, 'first' | 'rest'>,
  overlap: number,
): { glyph: G; x: number }[] {
  const digits = String(Math.max(0, Math.floor(value)));
  const placed: { glyph: G; x: number }[] = [];
  let x = 0;
  for (let index = 0; index < digits.length; index += 1) {
    const glyph = (index === 0 ? font.first : font.rest)[Number(digits[index])];
    const previous = placed[placed.length - 1];
    if (previous) x = previous.x + (previous.glyph.width - previous.glyph.origin.x) + glyph.origin.x - overlap;
    placed.push({ glyph, x });
  }
  const last = placed[placed.length - 1];
  const left = -placed[0].glyph.origin.x;
  const right = last.x + last.glyph.width - last.glyph.origin.x;
  const shift = -(left + right) / 2;
  return placed.map((each) => ({ glyph: each.glyph, x: each.x + shift }));
}

async function loadGlyph(node: string, [x, y]: Origin): Promise<Glyph> {
  const texture = await loadTexture(basicEffUrl(node));
  return { texture, width: texture.width, origin: { x, y } };
}

const loadDigits = (set: string) => Promise.all(DIGIT_ORIGINS[set].map((origin, digit) => loadGlyph(`${set}/${digit}`, origin)));

async function loadFrames(node: string, origins: readonly Origin[], delay: number, firstFrame: number): Promise<EffectLayer> {
  return Promise.all(
    origins.map(async (origin, index) => {
      const glyph = await loadGlyph(`${node}/${index + firstFrame}`, origin);
      return { texture: glyph.texture, origin: glyph.origin, delay };
    }),
  );
}

const pending = new Map<string, Promise<unknown>>();

/** 한 번만 받는다. 실패하면 지워서 다음 호출에 다시 받는다 */
function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  let promise = pending.get(key) as Promise<T> | undefined;
  if (!promise) {
    promise = load();
    promise.catch(() => pending.delete(key));
    pending.set(key, promise);
  }
  return promise;
}

/** 일반 공격은 주황 숫자(NoRed), 크리티컬은 붉은 숫자(NoCri)에 첫 자리 불꽃을 얹는다 */
export function loadDamageFont(style: DamageStyle): Promise<DamageFont> {
  return once(`damage:${style}`, async () => {
    const [small, large] = style === 'critical' ? ['NoCri0', 'NoCri1'] : ['NoRed0', 'NoRed1'];
    const [rest, first, effect] = await Promise.all([
      loadDigits(small),
      loadDigits(large),
      style === 'critical' ? loadGlyph('NoCri1/effect', CRITICAL_EFFECT_ORIGIN) : Promise.resolve(null),
    ]);
    return { first, rest, effect };
  });
}

/** 발밑을 원점으로 그리는 레벨업 이펙트. 프레임이 커서(최대 904×904) 다 합치면 4MB 쯤 된다 */
export function loadLevelUp(): Promise<EffectLayer> {
  return once('levelUp', async () => [
    { texture: Texture.EMPTY, origin: { x: 0, y: 0 }, delay: LEVEL_UP_LEAD_MS },
    ...(await loadFrames('LevelUp', LEVEL_UP_ORIGINS, LEVEL_UP_DELAY, 1)),
  ]);
}

/** 전직 이펙트. WZ 의 z 가 -1 이라 캐릭터 뒤에 그린다 */
export function loadJobChanged(): Promise<EffectLayer> {
  return once('jobChanged', () => loadFrames('JobChanged', JOB_CHANGED_ORIGINS, JOB_CHANGED_DELAY, 0));
}
