import { BOSSES } from './bosses';

/** 레벨 선물이거나 보스 드롭이다. null 은 그림만 있고 아직 얻는 법을 정하지 않은 시험판 탈것이다 */
export type MountSource = { kind: 'level'; level: number } | { kind: 'boss'; bossId: number } | null;

/** 타고 돌아다니는 탈것(Character.wz/TamingMob). 겉모습뿐이고 걷는 속도만 조금 빠르다 */
export interface Mount {
  id: number;
  name: string;
  source: MountSource;
}

const level = (id: number, name: string, at: number): Mount => ({ id, name, source: { kind: 'level', level: at } });
const boss = (id: number, name: string, bossName: string): Mount => ({
  id,
  name,
  source: { kind: 'boss', bossId: BOSSES.find((each) => each.name === bossName)!.id },
});
const unassigned = (id: number, name: string): Mount => ({ id, name, source: null });

// 원작 안장 3단계는 WZ reqLevel 그대로 레벨 선물이다. 보스 드롭은 이름·테마가 맞는 것만 골랐다
export const MOUNTS: Mount[] = [
  level(1902000, '멧돼지', 60),
  level(1902001, '은빛갈기', 100),
  level(1902002, '레드 드라코', 200),
  boss(1932023, '주황버섯', '머쉬맘'),
  boss(1932010, '발록', '주니어 발록'),
  boss(1932012, '미스트 발록', '크림슨 발록'),
  boss(1932178, '드래곤 라이딩', '레비아탄'),
  boss(1932323, '함께해! 핑크빈', '핑크빈'),
  boss(1932241, '힐라와 설원을', '진 힐라'),
  unassigned(1932179, '멧돼지(스킬형)'),
  unassigned(1932006, '돌격! 목마'),
  unassigned(1932007, '크로코'),
  unassigned(1932008, '네이키드 바이크'),
  unassigned(1932009, '핑크 스쿠터'),
  unassigned(1932011, '근두운'),
  unassigned(1932034, '오토바이'),
  unassigned(1932005, '마녀의 빗자루'),
  unassigned(1932004, '예티'),
  unassigned(1932027, '핑크곰 열기구'),
  unassigned(1932026, '타조'),
  unassigned(1932049, '나무 비행기'),
  unassigned(1932013, '경주용 카트'),
  unassigned(1932028, '트랜스폼 로봇'),
  unassigned(1932025, '나이트메어'),
  unassigned(1932089, '페가수스 라이딩'),
  unassigned(1932250, '투명발록'),
  unassigned(1932161, '핑크빈과 둥둥 여행'),
  unassigned(1932162, '블랙빈과 둥둥 여행'),
  unassigned(1932392, '붕붕붕 핑크빈'),
  unassigned(1932544, '루시드의 날개'),
  unassigned(1932204, '헤카톤의 주먹'),
  unassigned(1932636, '샤레니안의 악마'),
];

const mountById = new Map(MOUNTS.map((each) => [each.id, each]));

export const mountOf = (itemId: number): Mount | null => mountById.get(itemId) ?? null;
export const isMountItem = (itemId: number) => mountById.has(itemId);
export const mountsOfBoss = (bossId: number): Mount[] =>
  MOUNTS.filter((each) => each.source?.kind === 'boss' && each.source.bossId === bossId);

/** 가진 탈것을 고른다. 고른 탈것을 다시 고르면 내려서 걷는다 */
export function selectMount(owned: number[], selected: number | null, mountId: number): number | null {
  if (!owned.includes(mountId)) return selected;
  return selected === mountId ? null : mountId;
}

/** 얻는 법이 있는 탈것만 센다 */
export function mountProgress(owned: number[]): { owned: number; total: number } {
  const open = MOUNTS.filter((each) => each.source !== null);
  return { owned: open.filter((each) => owned.includes(each.id)).length, total: open.length };
}

/** 레벨에 닿은 탈것 선물 중 아직 없는 것을 준다. 탈것은 잃지 않아서 가진 목록이 받은 기록이다 */
export function grantMountGifts(character: { mountOwned: number[] }, reached: number): number[] {
  const granted = MOUNTS.filter(
    (each) => each.source?.kind === 'level' && each.source.level <= reached && !character.mountOwned.includes(each.id),
  ).map((each) => each.id);
  character.mountOwned.push(...granted);
  return granted;
}

/** 탈것이 생기기 전 저장은 빈 목록이다. 모르는 탈것은 버리고, 가진 적 없는 탈것을 골라 뒀으면 고르지 않은 것으로 친다 */
export function normalizeMountData(saved: { mountOwned?: unknown; mountSelected?: unknown }): {
  mountOwned: number[];
  mountSelected: number | null;
} {
  const mountOwned = Array.isArray(saved.mountOwned)
    ? [...new Set(saved.mountOwned.filter((id): id is number => typeof id === 'number' && isMountItem(id)))]
    : [];
  const { mountSelected } = saved;
  return {
    mountOwned,
    mountSelected: typeof mountSelected === 'number' && mountOwned.includes(mountSelected) ? mountSelected : null,
  };
}
