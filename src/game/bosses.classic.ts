import type { BossSpec } from './bosses';

/** 자쿰 팔 1~8. v83 은 팔이 몸통과 따로 나오는 몹이고 프레임 그림이 있어서, 몸통과 같은 자리에 원점을 맞춰 겹친다 */
export const CLASSIC_ZAKUM_ARMS = [8800003, 8800004, 8800005, 8800006, 8800007, 8800008, 8800009, 8800010];

// 클래식(GMS 83) 보스. 몹·맵 ID 는 v83 에서 이름·애니메이션(stand·hit1·die1)·렌더·BGM 이 모두 받아지는 것을 확인했고,
// 맵은 v83 몹 정보의 foundAt 이 가리키는 맵이다. minLevel 은 v83 몹 레벨이고 자쿰만 원작 입장 레벨(50)이다.
// 마노·주니어 발록은 지금 시대 맵이 v83 에 없어서 그 시대에 나오던 맵으로 바꿨다. 혼테일은 머리·몸·팔다리 아홉 부위가
// 따로 움직이는 몹이라 넣지 않았다
export const CLASSIC_BOSSES: BossSpec[] = [
  { id: 2220000, name: '마노', minLevel: 20, mapId: 104000400, sky: [0x6fb8f0, 0xe3f4ff] },
  { id: 3220000, name: '스텀피', minLevel: 35, mapId: 101030404, sky: [0xe8a466, 0xffe0b0] },
  { id: 8800000, name: '자쿰', minLevel: 50, mapId: 280030000, sky: [0x1a0806, 0x6a2410], parts: CLASSIC_ZAKUM_ARMS },
  { id: 6130101, name: '머쉬맘', minLevel: 60, mapId: 100000005, sky: [0x8fd3ff, 0xe6f7ff] },
  { id: 6220000, name: '다일', minLevel: 65, mapId: 107000300, sky: [0x3d5a3a, 0x9fbf8a] },
  { id: 6300005, name: '좀비 머쉬맘', minLevel: 65, mapId: 105070002, sky: [0x3a3550, 0x8c86a8] },
  { id: 8130100, name: '주니어 발록', minLevel: 80, mapId: 105090900, sky: [0x1a1420, 0x4a3a4a] },
  { id: 8150000, name: '크림슨 발록', minLevel: 100, mapId: 200090010, sky: [0x5aa8f0, 0xdff1ff] },
  { id: 8180001, name: '그리프', minLevel: 105, mapId: 240020101, sky: [0x5a8a5a, 0xcfe6c0] },
  { id: 8180000, name: '마뇽', minLevel: 105, mapId: 240020401, sky: [0x5a7a4a, 0xd6e2b0] },
  { id: 8510000, name: '피아누스', minLevel: 110, mapId: 230040420, sky: [0x0c2a55, 0x2f78b8] },
  { id: 8220003, name: '레비아탄', minLevel: 120, mapId: 240040401, sky: [0x5a4a3a, 0xc8b08a] },
  { id: 8500002, name: '파풀라투스', minLevel: 125, mapId: 220080001, sky: [0x2a1f3d, 0x6b5a8a] },
  { id: 8820001, name: '핑크빈', minLevel: 180, mapId: 270050100, sky: [0x2a2040, 0x8a6aa8] },
];
