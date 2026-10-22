import type { Texture } from 'pixi.js';
import {
  type MobInfo,
  type MobMeta,
  type WzValue,
  fetchJson,
  mobAnimationUrl,
  mobFrameOriginUrl,
  mobFrameUrl,
  mobGageUrl,
  mobInfoUrl,
} from './api';
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

export interface BossMob {
  animations: BossAnimations;
  gauge: BossGaugeColors;
}

/** 원작 보스 대부분이 빨간 게이지(1)에 검은 바탕(5)이다. 크림슨 발록처럼 값이 없는 보스도 이 색으로 그린다 */
const DEFAULT_GAUGE: BossGaugeColors = { fill: 1, background: 5 };

/** 기준점을 못 받으면 그림 아래 가운데를 쓴다 */
async function frameOrigin(mobId: number, action: string, frame: number, texture: Texture): Promise<Point> {
  try {
    const { value } = await fetchJson<WzValue<Point>>(mobFrameOriginUrl(mobId, action, frame));
    return { x: value.x, y: value.y };
  } catch {
    return { x: texture.width / 2, y: texture.height };
  }
}

async function loadPlaced(mobId: number, action: string): Promise<PlacedAnimation> {
  const animation = await loadAnimation(mobAnimationUrl(mobId, action), (frame) => mobFrameUrl(mobId, action, frame));
  const origins = await Promise.all(animation.frames.map((texture, frame) => frameOrigin(mobId, action, frame, texture)));
  return { ...animation, origins };
}

export async function loadBossMob(mobId: number): Promise<BossMob> {
  const info = await fetchJson<MobInfo & MobMeta>(mobInfoUrl(mobId));
  const { framebooks } = info;
  const has = (action: string) => (framebooks[action] ?? 0) > 0;
  const idle = has('stand') ? 'stand' : has('move') ? 'move' : 'fly';
  const moving = has('move') ? 'move' : has('fly') ? 'fly' : null;
  const optional = (action: string | null) => (action && has(action) ? loadPlaced(mobId, action) : Promise.resolve(null));
  const [stand, move, attack, hit, die] = await Promise.all([
    loadPlaced(mobId, idle),
    optional(moving === idle ? null : moving),
    optional('attack1'),
    loadPlaced(mobId, has('hit1') ? 'hit1' : idle),
    loadPlaced(mobId, has('die1') ? 'die1' : idle),
  ]);
  return {
    animations: { stand, move, attack, hit, die },
    gauge: {
      fill: info.meta?.hpTagColor || DEFAULT_GAUGE.fill,
      background: info.meta?.hpTagBackgroundColor || DEFAULT_GAUGE.background,
    },
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

export async function loadBossGauge(mobId: number, colors: BossGaugeColors): Promise<BossGaugeTextures> {
  const [iconFrame, left, middle, right, fill, background, icon] = await Promise.all([
    loadTexture(mobGageUrl('backgrnd', true)),
    loadTexture(mobGageUrl('backgrnd2', true)),
    loadTexture(mobGageUrl('backgrnd3', false)),
    loadTexture(mobGageUrl('backgrnd4', true)),
    loadTexture(mobGageUrl(`Gage/${colors.fill}/1`, false)),
    loadTexture(mobGageUrl(`Gage/${colors.background}/1`, false)),
    loadTexture(mobGageUrl(`Mob/${mobId}`, true)).catch(() => null),
  ]);
  return { iconFrame, icon, left, middle, right, fill, background };
}
