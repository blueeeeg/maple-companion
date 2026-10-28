import type { Texture } from 'pixi.js';
import {
  type Era,
  type MobInfo,
  type MobMeta,
  type WzValue,
  classicMobGageUrl,
  mobAnimationUrl,
  mobFrameOriginUrl,
  mobFrameUrl,
  mobGageIconLinkUrl,
  mobGageUrl,
  mobInfoUrl,
  wzImageUrl,
} from './api';
import { fetchStoredJson } from './artStore';
import type { Point } from './ground';
import { type Animation, loadAnimation, loadTexture } from './textures';

/** 프레임마다 원작 기준점(발밑)을 함께 가진 애니메이션 */
export interface PlacedAnimation extends Animation {
  origins: Point[];
}

export interface BossAnimations {
  stand: PlacedAnimation;
  /** 걷거나 나는 동작. 없으면 null */
  move: PlacedAnimation | null;
  attack: PlacedAnimation | null;
  hit: PlacedAnimation;
  die: PlacedAnimation;
}

export interface BossGaugeColors {
  /** MobGage/Gage/{번호}. 남은 HP 칸 */
  fill: number;
  /** 깎인 HP 칸 */
  background: number;
}

/** 몸통과 원점을 같이 쓰는 부위(클래식 자쿰 팔). 서 있고 맞기만 한다. 몸통이 쓰러지면 같이 흐려진다 */
export interface BossPart {
  stand: PlacedAnimation;
  hit: PlacedAnimation;
}

export interface BossMob {
  animations: BossAnimations;
  gauge: BossGaugeColors;
  parts: BossPart[];
}

/** 원작 보스 대부분이 빨간 게이지(1)에 검은 바탕(5)이다. 크림슨 발록처럼 값이 없는 보스도 이 색으로 그린다 */
const DEFAULT_GAUGE: BossGaugeColors = { fill: 1, background: 5 };

/** 기준점을 못 받으면 그림 아래 가운데를 쓴다 */
async function frameOrigin(mobId: number, action: string, frame: number, texture: Texture, era: Era): Promise<Point> {
  try {
    const { value } = await fetchStoredJson<WzValue<Point>>(mobFrameOriginUrl(mobId, action, frame, era));
    return { x: value.x, y: value.y };
  } catch {
    return { x: texture.width / 2, y: texture.height };
  }
}

async function loadPlaced(mobId: number, action: string, era: Era): Promise<PlacedAnimation> {
  const animation = await loadAnimation(mobAnimationUrl(mobId, action, era), (frame) => mobFrameUrl(mobId, action, frame, era));
  const origins = await Promise.all(animation.frames.map((texture, frame) => frameOrigin(mobId, action, frame, texture, era)));
  return { ...animation, origins };
}

/** 부위는 서 있기·맞기만 받는다. 쓰러지는 그림(팔마다 20장)까지 받으면 기준점 요청만 수백 개라 몸통과 같이 흐려지게 한다 */
async function loadPart(mobId: number, era: Era): Promise<BossPart> {
  const { framebooks } = await fetchStoredJson<MobInfo>(mobInfoUrl(mobId, era));
  const stand = await loadPlaced(mobId, 'stand', era);
  const hit = (framebooks.hit1 ?? 0) > 0 ? await loadPlaced(mobId, 'hit1', era) : stand;
  return { stand, hit };
}

/** era: 몹을 받을 시대. partIds: 몸통에 겹칠 부위(BossSpec.parts) */
export async function loadBossMob(mobId: number, era: Era = 'current', partIds: number[] = []): Promise<BossMob> {
  const info = await fetchStoredJson<MobInfo & MobMeta>(mobInfoUrl(mobId, era));
  const { framebooks } = info;
  const has = (action: string) => (framebooks[action] ?? 0) > 0;
  const idle = has('stand') ? 'stand' : has('move') ? 'move' : 'fly';
  const moving = has('move') ? 'move' : has('fly') ? 'fly' : null;
  const optional = (action: string | null) => (action && has(action) ? loadPlaced(mobId, action, era) : Promise.resolve(null));
  const [stand, move, attack, hit, die, parts] = await Promise.all([
    loadPlaced(mobId, idle, era),
    optional(moving === idle ? null : moving),
    optional('attack1'),
    loadPlaced(mobId, has('hit1') ? 'hit1' : idle, era),
    loadPlaced(mobId, has('die1') ? 'die1' : idle, era),
    Promise.all(partIds.map((partId) => loadPart(partId, era))),
  ]);
  return {
    animations: { stand, move, attack, hit, die },
    gauge: {
      fill: info.meta?.hpTagColor || DEFAULT_GAUGE.fill,
      background: info.meta?.hpTagBackgroundColor || DEFAULT_GAUGE.background,
    },
    parts,
  };
}

export interface BossGaugeTextures {
  /** 보스 아이콘 틀(37×37) */
  iconFrame: Texture;
  /** 보스 아이콘(25×25 안팎). 아이콘이 없는 보스는 null */
  icon: Texture | null;
  /** 게이지 틀 왼쪽 끝(3×20)·가운데(1×20, 늘려 쓴다)·오른쪽 끝(5×20) */
  left: Texture;
  middle: Texture;
  right: Texture;
  /** 1px 폭 색 띠(1×10). 늘려 쓴다 */
  fill: Texture;
  background: Texture;
}

const GAUGE_TRIES = 3;
const GAUGE_RETRY_MS = 1500;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** tries 번까지 받는다. 실패할 때마다 waitMs 씩 더 오래 기다린다 */
export async function retry<T>(load: () => Promise<T>, tries: number, waitMs: number, wait = sleep): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await load();
    } catch (error) {
      if (attempt >= tries) throw error;
      await wait(waitMs * attempt);
    }
  }
}

// 그림 일곱 장 중 하나만 못 받아도 게이지 전체가 단색으로 바뀐다. 팬 API 가 가끔 520 을 내서 한 장씩 다시 받는다
const gaugePart = (url: string) => retry(() => loadTexture(url), GAUGE_TRIES, GAUGE_RETRY_MS);

/** 아이콘 노드가 없는 몹은 null. 노드가 가리키는 그림을 받는다. v83 은 링크 없이 그 자리에 그림이 있다 */
async function loadGaugeIcon(mobId: number, era: Era): Promise<Texture | null> {
  if (era === 'classic') return gaugePart(classicMobGageUrl(`Mob/${mobId}`)).catch(() => null);
  let target: string;
  try {
    ({ value: target } = await retry(
      () => fetchStoredJson<WzValue<string>>(mobGageIconLinkUrl(mobId)),
      GAUGE_TRIES,
      GAUGE_RETRY_MS,
    ));
  } catch {
    return null;
  }
  return gaugePart(wzImageUrl(target)).catch(() => null);
}

/** 게이지 그림 주소. 지금 판은 틀 양 끝이 `_Canvas` 로 링크돼 있고 v83 은 모두 원래 자리다 */
function gaugeUrl(node: string, outlinked: boolean, era: Era): string {
  return era === 'classic' ? classicMobGageUrl(node) : mobGageUrl(node, outlinked);
}

/** 모든 보스가 같이 쓰는 틀과 기본 색. 첫 보스를 만났을 때 팬 API 가 느려도 틀은 이미 받아 둔 것을 쓴다 */
export function preloadBossGauge(era: Era = 'current'): Promise<unknown> {
  return Promise.all([
    gaugePart(gaugeUrl('backgrnd', true, era)),
    gaugePart(gaugeUrl('backgrnd2', true, era)),
    gaugePart(gaugeUrl('backgrnd3', false, era)),
    gaugePart(gaugeUrl('backgrnd4', true, era)),
    gaugePart(gaugeUrl(`Gage/${DEFAULT_GAUGE.fill}/1`, false, era)),
    gaugePart(gaugeUrl(`Gage/${DEFAULT_GAUGE.background}/1`, false, era)),
  ]);
}

export async function loadBossGauge(mobId: number, colors: BossGaugeColors, era: Era = 'current'): Promise<BossGaugeTextures> {
  const [iconFrame, left, middle, right, fill, background, icon] = await Promise.all([
    gaugePart(gaugeUrl('backgrnd', true, era)),
    gaugePart(gaugeUrl('backgrnd2', true, era)),
    gaugePart(gaugeUrl('backgrnd3', false, era)),
    gaugePart(gaugeUrl('backgrnd4', true, era)),
    gaugePart(gaugeUrl(`Gage/${colors.fill}/1`, false, era)),
    gaugePart(gaugeUrl(`Gage/${colors.background}/1`, false, era)),
    loadGaugeIcon(mobId, era),
  ]);
  return { iconFrame, icon, left, middle, right, fill, background };
}
