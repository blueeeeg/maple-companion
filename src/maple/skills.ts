import type { Texture } from 'pixi.js';
import { type SkillFrameData, type SkillInfo, fetchJson, skillUrl } from './api';
import { textureFromBase64 } from './textures';

export interface EffectFrame {
  texture: Texture;
  origin: { x: number; y: number };
  delay: number;
}

/** 한 레이어의 프레임들. 스킬 이펙트는 레이어 여러 장을 겹쳐 그린다 */
export type EffectLayer = EffectFrame[];

export interface Skill {
  id: number;
  name: string;
  /** 캐릭터 앞쪽 사거리(px) */
  range: number;
  /** 한 번 쓸 때 뜨는 데미지 줄 수 */
  hits: number;
  effect: EffectLayer[];
  hit: EffectLayer[];
}

const MAX_HIT_LINES = 8;
const skills = new Map<number, Promise<Skill>>();

export function frontRange(lt: string | undefined): number | null {
  const x = lt?.match(/X=(-?\d+)/)?.[1];
  return x !== undefined && Number(x) < 0 ? -Number(x) : null;
}

const loadLayers = (layers: { frames: SkillFrameData[] }[] | undefined): Promise<EffectLayer[]> =>
  Promise.all(
    (layers ?? []).map((layer) =>
      Promise.all(
        layer.frames.map(async (frame) => ({
          texture: await textureFromBase64(frame.image),
          origin: { x: frame.origin.x, y: frame.origin.y },
          delay: frame.delay || 100,
        })),
      ),
    ),
  );

/** 스킬 하나에 수백 KB~수 MB 라서 같은 스킬은 한 번만 받는다 */
export function loadSkill(skillId: number, fallbackRange: number): Promise<Skill> {
  let pending = skills.get(skillId);
  if (!pending) {
    pending = fetchJson<SkillInfo>(skillUrl(skillId)).then(async (info) => ({
      id: skillId,
      name: info.description.name,
      range: frontRange(info.properties.lt) ?? fallbackRange,
      hits: Math.min(MAX_HIT_LINES, Math.max(1, parseInt(info.properties.attackCount ?? '1', 10) || 1)),
      effect: await loadLayers(info.effect),
      hit: await loadLayers(info.hit),
    }));
    pending.catch(() => skills.delete(skillId));
    skills.set(skillId, pending);
  }
  return pending;
}
