import { BOSSES } from './bosses';

/** 보스가 떨어뜨리는 의자. 겉모습뿐이고 쉴 때 앉는다 */
export interface Chair {
  id: number;
  name: string;
  bossId: number;
}

const chair = (id: number, name: string, bossName: string): Chair => ({
  id,
  name,
  bossId: BOSSES.find((boss) => boss.name === bossName)!.id,
});

// 아이템 ID 는 KMS 389 Item/Install 에서 이름과 effect 프레임을 확인했다. tamingMob 으로 그리는 의자 셋은 effect 가 빈 그림이라 뺐다
export const CHAIRS: Chair[] = [
  chair(3010001, '하늘색 나무 의자', '마노'),
  chair(3010423, '버섯친구 의자', '머쉬맘'),
  chair(3017000, '주황버섯 큐브 의자', '머쉬맘'),
  chair(3018221, '숲속 휴식 의자 : 그루터기', '스텀피'),
  chair(3017028, '할로윈의 해골 큐브 의자', '다일'),
  chair(3010455, '자쿰의 제왕 의자', '자쿰'),
  chair(3017079, '자쿰 큐브 의자', '자쿰'),
  chair(3017029, '할로윈의 좀비 큐브 의자', '좀비 머쉬맘'),
  chair(3010636, '발록 의자', '주니어 발록'),
  chair(3015521, '프랑켄발록 의자', '크림슨 발록'),
  chair(3010965, '인어의 산호초', '피아누스'),
  chair(3017005, '스쿠버페페 큐브 의자', '피아누스'),
  chair(3017004, '로보토이 큐브 의자', '파풀라투스'),
  chair(3018790, '루디브리엄 의자', '파풀라투스'),
  chair(3010430, '블루 드래곤 의자', '레비아탄'),
  chair(3010581, '혼테일 의자', '레비아탄'),
  chair(3010321, '아카이럼의 동화책 의자', '아카이럼'),
  chair(3010676, '군단장의 의자', '아카이럼'),
  chair(3010225, '핑크빈 의자', '핑크빈'),
  chair(3010592, '블랙빈 의자', '핑크빈'),
  chair(3015118, '힐라와 매그너스', '매그너스'),
  chair(3017061, '진 힐라 큐브 의자', '진 힐라'),
  chair(3010404, '힐라의 겟잇뷰티', '진 힐라'),
];

const chairById = new Map(CHAIRS.map((each) => [each.id, each]));

export const chairOf = (itemId: number): Chair | null => chairById.get(itemId) ?? null;
export const isChairItem = (itemId: number) => chairById.has(itemId);
export const chairsOfBoss = (bossId: number): Chair[] => CHAIRS.filter((each) => each.bossId === bossId);

/** 가진 의자를 고른다. 고른 의자를 다시 고르면 내려서 의자 없이 선다 */
export function selectChair(owned: number[], selected: number | null, chairId: number): number | null {
  if (!owned.includes(chairId)) return selected;
  return selected === chairId ? null : chairId;
}

export function chairProgress(owned: number[]): { owned: number; total: number } {
  return { owned: CHAIRS.filter((each) => owned.includes(each.id)).length, total: CHAIRS.length };
}

/** 의자가 생기기 전 저장은 빈 목록이다. 모르는 의자는 버리고, 가진 적 없는 의자를 골라 뒀으면 고르지 않은 것으로 친다 */
export function normalizeChairData(saved: { chairOwned?: unknown; chairSelected?: unknown }): {
  chairOwned: number[];
  chairSelected: number | null;
} {
  const chairOwned = Array.isArray(saved.chairOwned)
    ? [...new Set(saved.chairOwned.filter((id): id is number => typeof id === 'number' && isChairItem(id)))]
    : [];
  const { chairSelected } = saved;
  return {
    chairOwned,
    chairSelected: typeof chairSelected === 'number' && chairOwned.includes(chairSelected) ? chairSelected : null,
  };
}
