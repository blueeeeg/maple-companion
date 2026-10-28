import type { Texture } from 'pixi.js';
import { hasUsableEffect } from '../game/skillBook';
import { type Era, type SkillFrameData, type SkillInfo, fetchWithin, skillUrl } from './api';
import { readStoredSkill, storeSkill, trimSkillInfo } from './skillStore';
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
  /** 한 번에 때리는 몬스터 수. 스킬 데이터에 없으면 null */
  mobCount: number | null;
  effect: EffectLayer[];
  hit: EffectLayer[];
  /** 원작에서 이 스킬을 쓸 때의 캐릭터 동작 이름(alert2·darksight 등). 없으면 빈 목록 */
  actions: string[];
}

const MAX_HIT_LINES = 8;
/** 같은 ID 라도 시대마다 다른 스킬일 수 있어 `{시대}|{ID}` 로 나눈다 */
const skills = new Map<string, Promise<Skill>>();
const loadKey = (skillId: number, era: Era) => `${era}|${skillId}`;

/** 맵에서 캐릭터가 쓰는 모습을 그릴 수 있는지 */
export const canDrawSkill = (skill: Skill): boolean => hasUsableEffect(skill.effect.map((layer) => layer.length));

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

const infoLoads = new Map<string, Promise<SkillInfo>>();

/**
 * 스킬 데이터. 기기에 남긴 것이 있으면 그것을, 없으면 받아서 그리는 데 쓰는 것만 남겨 기기에 둔다.
 * 같은 스킬을 동시에 두 번 받지 않는다. 받은 데이터는 그림으로 풀고 나면 놓아서 큰 JSON 이 메모리에 남지 않는다
 */
function skillInfo(skillId: number, era: Era): Promise<SkillInfo> {
  const key = loadKey(skillId, era);
  let pending = infoLoads.get(key);
  if (!pending) {
    pending = readStoredSkill(skillId, era)
      .then(
        (stored) => stored,
        () => undefined,
      )
      .then(async (stored) => {
        if (stored) return stored;
        const url = skillUrl(skillId, era);
        const text = await fetchWithin(url, (response) => {
          if (!response.ok) throw new Error(`${response.status} ${url}`);
          return response.text();
        });
        const info = trimSkillInfo(JSON.parse(text) as SkillInfo);
        void storeSkill(skillId, info, JSON.stringify(info).length, era).catch(() => {});
        return info;
      })
      .finally(() => infoLoads.delete(key));
    infoLoads.set(key, pending);
  }
  return pending;
}

/**
 * 스킬 데이터를 하나씩 받아 기기에 남겨 둔다. 그림으로 풀지는 않는다. 맵·BGM 을 받는 것과 다투지 않게 한 번에 하나다.
 * 이미 남긴 것은 건너뛴다
 */
export async function prefetchSkillData(skillIds: number[], era: Era = 'current'): Promise<void> {
  await skillIds.reduce(
    (previous, skillId) =>
      previous.then(() =>
        skills.has(loadKey(skillId, era))
          ? undefined
          : skillInfo(skillId, era).then(
              () => undefined,
              () => undefined,
            ),
      ),
    Promise.resolve(),
  );
}

/** 스킬 하나에 수백 KB~수 MB 라서 같은 스킬은 한 번만 받고, 받은 것은 기기에 남긴다(skillStore.ts) */
export function loadSkill(skillId: number, fallbackRange: number, era: Era = 'current'): Promise<Skill> {
  const key = loadKey(skillId, era);
  let pending = skills.get(key);
  if (!pending) {
    pending = skillInfo(skillId, era).then(async (info) => ({
      id: skillId,
      name: info.description?.name ?? '',
      range: frontRange(info.properties?.lt) ?? fallbackRange,
      hits: Math.min(MAX_HIT_LINES, Math.max(1, parseInt(info.properties?.attackCount ?? '1', 10) || 1)),
      mobCount: parseInt(info.properties?.mobCount ?? '', 10) || null,
      effect: await loadLayers(info.effect),
      hit: await loadLayers(info.hit),
      actions: info.actions ?? [],
    }));
    pending.catch(() => skills.delete(key));
    skills.set(key, pending);
  }
  return pending;
}
