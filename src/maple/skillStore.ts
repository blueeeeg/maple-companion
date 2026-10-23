// 스킬 데이터(/job/skill/{ID}, 이펙트 프레임이 base64 로 들어 있어 수백 KB~수십 MB)를 기기(IndexedDB)에 남겨 두는 곳.
// 캐시샵 아이콘과 같은 DB 라 KMS 버전이 바뀌면 통째로 새로 받는다. 크기 제한을 넘는 스킬은 남기지 않고,
// 모두 합쳐 예산을 넘으면 가장 오래 안 쓴 스킬부터 지운다
import { deleteStored, readStored, writeStored } from '../ui/cashAssets';
import { DATA_KEY, type SkillInfo } from './api';

/** 이보다 큰 스킬은 기기에 남기지 않는다. 눌렀을 때마다 받는다 */
export const SKILL_STORE_CAP_BYTES = 5 * 1024 * 1024;
/** 남겨 둔 스킬 데이터를 모두 합친 크기 */
export const SKILL_STORE_BUDGET_BYTES = 60 * 1024 * 1024;

const INDEX_KEY = `${DATA_KEY}:skill-index`;
const dataKey = (skillId: number) => `${DATA_KEY}:skill:${skillId}`;

/** 남겨 둔 스킬 → 크기·마지막으로 쓴 때 */
export type SkillStoreIndex = Record<string, { bytes: number; usedAt: number }>;

/** 합이 budget 을 넘으면 마지막으로 쓴 때가 오래된 것부터 지울 스킬 */
export function evictionPlan(index: SkillStoreIndex, budget: number): string[] {
  let total = Object.values(index).reduce((sum, { bytes }) => sum + bytes, 0);
  const evicted: string[] = [];
  Object.entries(index)
    .sort(([, a], [, b]) => a.usedAt - b.usedAt)
    .forEach(([id, { bytes }]) => {
      if (total <= budget) return;
      evicted.push(id);
      total -= bytes;
    });
  return evicted;
}

/** 맵에 그리는 데 쓰는 것만 남긴다. 아이콘·설명·레벨별 수치는 버린다 */
export function trimSkillInfo(info: SkillInfo): SkillInfo {
  const { lt, attackCount } = info.properties ?? {};
  return {
    description: { name: info.description?.name ?? '' },
    properties: { ...(lt !== undefined ? { lt } : {}), ...(attackCount !== undefined ? { attackCount } : {}) },
    effect: info.effect ?? [],
    hit: info.hit ?? [],
    actions: info.actions ?? [],
  };
}

let index: Promise<SkillStoreIndex> | null = null;
const loadIndex = () => (index ??= readStored<SkillStoreIndex>(INDEX_KEY).then((saved) => saved ?? {}));
const saveIndex = (current: SkillStoreIndex) => writeStored(INDEX_KEY, current);

export async function readStoredSkill(skillId: number): Promise<SkillInfo | undefined> {
  const current = await loadIndex();
  const entry = current[skillId];
  if (!entry) return undefined;
  const info = await readStored<SkillInfo>(dataKey(skillId));
  if (!info) {
    // 저장소를 비웠으면 목록에서도 뺀다
    delete current[skillId];
    saveIndex(current);
    return undefined;
  }
  entry.usedAt = Date.now();
  saveIndex(current);
  return info;
}

/** bytes: 남길 데이터의 크기(JSON 길이) */
export async function storeSkill(skillId: number, info: SkillInfo, bytes: number): Promise<void> {
  if (bytes > SKILL_STORE_CAP_BYTES) return;
  const current = await loadIndex();
  writeStored(dataKey(skillId), info);
  current[skillId] = { bytes, usedAt: Date.now() };
  evictionPlan(current, SKILL_STORE_BUDGET_BYTES).forEach((id) => {
    delete current[id];
    deleteStored(dataKey(Number(id)));
  });
  saveIndex(current);
}
