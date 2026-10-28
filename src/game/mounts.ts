import { BOSSES } from './bosses';

/** 레벨 선물, 보스 드롭(레어 칸), 장비 상점 중 하나로 얻는다 */
export type MountSource =
  | { kind: 'level'; level: number }
  | { kind: 'boss'; bossId: number }
  | { kind: 'shop'; price: number };

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
const shop = (id: number, name: string, price: number): Mount => ({ id, name, source: { kind: 'shop', price } });

// 원작 안장 3단계(60·100·200)는 WZ reqLevel 그대로고, 그 사이를 원작 레벨 제한이 비슷한 탈것으로 채웠다.
// 보스 드롭은 이름·테마가 맞는 보스에 한 보스 탈것 셋까지만 둔다. 레어 칸이 커지면 장비·의자 천장이 늦어진다.
// 상점 값은 장비 상점 무기(25,000) 위, Lv.60~100 하루(4시간) 벌이 27,000~35,000 의 1~2일 몫이다(cashShop.test.ts 「메소 벌이」)
export const MOUNTS: Mount[] = [
  level(1932006, '돌격! 목마', 30),
  level(1902000, '멧돼지', 60),
  level(1902001, '은빛갈기', 100),
  level(1932011, '근두운', 140),
  level(1932089, '페가수스 라이딩', 170),
  level(1902002, '레드 드라코', 200),
  boss(1932023, '주황버섯', '머쉬맘'),
  boss(1932004, '예티', '자쿰'),
  boss(1932010, '발록', '주니어 발록'),
  boss(1932012, '미스트 발록', '크림슨 발록'),
  boss(1932250, '투명발록', '크림슨 발록'),
  boss(1932178, '드래곤 라이딩', '레비아탄'),
  boss(1932323, '함께해! 핑크빈', '핑크빈'),
  boss(1932161, '핑크빈과 둥둥 여행', '핑크빈'),
  boss(1932162, '블랙빈과 둥둥 여행', '핑크빈'),
  boss(1932204, '헤카톤의 주먹', '매그너스'),
  boss(1932241, '힐라와 설원을', '진 힐라'),
  boss(1932544, '루시드의 날개', '진 힐라'),
  shop(1932007, '크로코', 30_000),
  shop(1932026, '타조', 30_000),
  shop(1932009, '핑크 스쿠터', 30_000),
  shop(1932005, '마녀의 빗자루', 30_000),
  shop(1932049, '나무 비행기', 45_000),
  shop(1932013, '경주용 카트', 45_000),
  shop(1932008, '네이키드 바이크', 45_000),
  shop(1932034, '오토바이', 45_000),
  shop(1932027, '핑크곰 열기구', 60_000),
  shop(1932028, '트랜스폼 로봇', 60_000),
];

const mountById = new Map(MOUNTS.map((each) => [each.id, each]));

export const mountOf = (itemId: number): Mount | null => mountById.get(itemId) ?? null;
export const isMountItem = (itemId: number) => mountById.has(itemId);
export const mountsOfBoss = (bossId: number): Mount[] =>
  MOUNTS.filter((each) => each.source.kind === 'boss' && each.source.bossId === bossId);

/** 가진 탈것을 고른다. 고른 탈것을 다시 고르면 내려서 걷는다 */
export function selectMount(owned: number[], selected: number | null, mountId: number): number | null {
  if (!owned.includes(mountId)) return selected;
  return selected === mountId ? null : mountId;
}

export function mountProgress(owned: number[]): { owned: number; total: number } {
  return { owned: MOUNTS.filter((each) => owned.includes(each.id)).length, total: MOUNTS.length };
}

/** 상점 탈것 칸. 장비 상점 「탈것」에 이 순서로 늘어놓는다 */
export const MOUNT_SHOP_ITEMS: { id: number; price: number }[] = MOUNTS.flatMap(({ id, source }) =>
  source.kind === 'shop' ? [{ id, price: source.price }] : [],
);

export function mountShopPrice(itemId: number): number | null {
  const source = mountOf(itemId)?.source;
  return source?.kind === 'shop' ? source.price : null;
}

/** 메소를 내고 바로 탄다. 상점 탈것이 아니거나 이미 있거나 메소가 모자라면 false */
export function buyMount(
  owner: { meso: number; mountOwned: number[]; mountSelected: number | null },
  itemId: number,
): boolean {
  const price = mountShopPrice(itemId);
  if (price === null || owner.mountOwned.includes(itemId) || owner.meso < price) return false;
  owner.meso -= price;
  owner.mountOwned.push(itemId);
  owner.mountSelected = itemId;
  return true;
}

/** 레벨에 닿은 탈것 선물 중 아직 없는 것을 준다. 탈것은 잃지 않아서 가진 목록이 받은 기록이다 */
export function grantMountGifts(character: { mountOwned: number[] }, reached: number): number[] {
  const granted = MOUNTS.filter(
    (each) => each.source.kind === 'level' && each.source.level <= reached && !character.mountOwned.includes(each.id),
  ).map((each) => each.id);
  character.mountOwned.push(...granted);
  return granted;
}

/** 탈것이 생기기 전 저장은 빈 목록이다. 모르는 탈것(목록에서 뺀 것 포함)은 버리고, 가진 적 없는 탈것을 골라 뒀으면 고르지 않은 것으로 친다 */
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
