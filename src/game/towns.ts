export interface MonsterSpec {
  /** 메이플 몹 ID */
  id: number;
  name: string;
}

export interface Town {
  id: string;
  name: string;
  /** 메이플 맵 ID. 배경·발판·BGM 을 이 맵에서 가져온다 */
  mapId: number;
  minLevel: number;
  /** 맵 렌더에는 하늘 배경이 빠져 있어서 뒤에 까는 색 */
  sky: [top: number, bottom: number];
  monsters: MonsterSpec[];
}

// 맵·몹 ID 는 KMS 389 기준으로 API 에서 이름을 대조해 확인한 값이다
export const TOWNS: Town[] = [
  {
    id: 'henesys',
    name: '헤네시스',
    mapId: 100000000,
    minLevel: 1,
    sky: [0x7ec8ff, 0xd9f2ff],
    monsters: [
      { id: 100100, name: '달팽이' },
      { id: 100101, name: '파란 달팽이' },
      { id: 120100, name: '스포아' },
      { id: 1210102, name: '주황버섯' },
    ],
  },
  {
    id: 'lith-harbor',
    name: '리스항구',
    mapId: 104000000,
    minLevel: 5,
    sky: [0x6fb8f0, 0xe3f4ff],
    monsters: [
      { id: 1210100, name: '돼지' },
      { id: 1210101, name: '리본 돼지' },
      { id: 130101, name: '빨간 달팽이' },
    ],
  },
  {
    id: 'ellinia',
    name: '엘리니아',
    mapId: 101000000,
    minLevel: 10,
    sky: [0x3f7d6b, 0xb7e3c4],
    monsters: [
      { id: 210100, name: '슬라임' },
      { id: 1110100, name: '초록버섯' },
      { id: 2220100, name: '파란버섯' },
    ],
  },
  {
    id: 'perion',
    name: '페리온',
    mapId: 102000000,
    minLevel: 15,
    sky: [0xf3b27a, 0xffe2b8],
    monsters: [
      { id: 130100, name: '스텀프' },
      { id: 1110101, name: '다크 스텀프' },
      { id: 2230102, name: '와일드보어' },
    ],
  },
  {
    id: 'kerning',
    name: '커닝시티',
    mapId: 103000000,
    minLevel: 20,
    sky: [0x3b3f5c, 0x8a8fb3],
    monsters: [
      { id: 2230101, name: '좀비버섯' },
      { id: 2300100, name: '스티지' },
      { id: 3230100, name: '커즈아이' },
    ],
  },
  {
    id: 'orbis',
    name: '오르비스',
    mapId: 200000000,
    minLevel: 30,
    sky: [0xbfe3ff, 0xffffff],
    monsters: [
      { id: 3230200, name: '스타픽시' },
      { id: 4230106, name: '루나픽시' },
      { id: 5120000, name: '러스터픽시' },
    ],
  },
  {
    id: 'el-nath',
    name: '엘나스',
    mapId: 211000000,
    minLevel: 45,
    sky: [0x9fb8d6, 0xeaf2fb],
    monsters: [
      { id: 5100000, name: '주니어 예티' },
      { id: 5130105, name: '다크 주니어 예티' },
      { id: 5100002, name: '파이어봄' },
    ],
  },
  {
    id: 'ludibrium',
    name: '루디브리엄',
    mapId: 220000000,
    minLevel: 60,
    sky: [0xffc4e1, 0xfff5d6],
    monsters: [
      { id: 3230302, name: '블록퍼스' },
      { id: 4230111, name: '로보토이' },
      { id: 4230113, name: '틱톡' },
    ],
  },
  {
    id: 'aquarium',
    name: '아쿠아리움',
    mapId: 230000000,
    minLevel: 75,
    sky: [0x1e5aa8, 0x7cc4f0],
    monsters: [
      { id: 3210450, name: '스쿠버 페페' },
      { id: 5130103, name: '크로코' },
    ],
  },
  {
    id: 'leafre',
    name: '리프레',
    mapId: 240000000,
    minLevel: 100,
    sky: [0x6aa66e, 0xdcefc9],
    monsters: [
      { id: 8150300, name: '레드 와이번' },
      { id: 8150301, name: '블루 와이번' },
      { id: 8190003, name: '스켈레곤' },
    ],
  },
  {
    id: 'mureung',
    name: '무릉',
    mapId: 250000000,
    minLevel: 130,
    sky: [0xa8d8ea, 0xf6f1e0],
    monsters: [{ id: 6130203, name: '판다곰' }],
  },
  {
    id: 'vanishing-journey',
    name: '이름 없는 마을',
    mapId: 450001000,
    minLevel: 200,
    sky: [0x241a4a, 0x5b4aa6],
    monsters: [
      { id: 8641000, name: '기쁨의 에르다스' },
      { id: 8641001, name: '분노의 에르다스' },
      { id: 8641002, name: '슬픔의 에르다스' },
    ],
  },
  {
    id: 'chewchew',
    name: '츄츄 빌리지',
    mapId: 450002000,
    minLevel: 210,
    sky: [0x7fd3f7, 0xfff0c2],
    monsters: [{ id: 8642016, name: '츄릅나무' }],
  },
  {
    id: 'cernium',
    name: '세르니움',
    mapId: 410000500,
    minLevel: 260,
    sky: [0xf1a35b, 0xfbe3b0],
    monsters: [{ id: 8645123, name: '흑태양 보병' }],
  },
];

export function unlockedTowns(level: number): Town[] {
  return TOWNS.filter((town) => town.minLevel <= level);
}

/** 보상 기준 마을: 레벨에 맞는 가장 높은 마을. 표시 중인 마을과 상관없이 메소 보상에 쓴다 */
export function rewardTown(level: number): Town {
  const towns = unlockedTowns(level);
  return towns[towns.length - 1] ?? TOWNS[0];
}

function shuffleArray<T>(arr: T[], random: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 셔플 백에서 마을을 하나 꺼낸다. 자격 없는 ID 를 제거하고, 비었으면 열린 마을을 섞어 새 주기로 채운다.
 * 새 주기 첫 마을이 직전 마을과 같으면(2개 이상일 때) 한 칸 뒤로 밀어 연속을 막는다.
 */
export function drawFromTownBag(
  bag: string[],
  lastTownId: string | null,
  level: number,
  random = Math.random,
): { town: Town; bag: string[]; lastTownId: string } | null {
  const eligible = unlockedTowns(level);
  if (eligible.length === 0) return null;
  const eligibleIds = new Set(eligible.map((t) => t.id));
  let remaining = bag.filter((id) => eligibleIds.has(id));
  if (remaining.length === 0) {
    remaining = shuffleArray(eligible.map((t) => t.id), random);
    // 새 주기 첫 마을이 직전 마을과 겹치지 않도록
    if (eligible.length >= 2 && remaining[0] === lastTownId) {
      remaining.push(remaining.shift()!);
    }
  }
  const id = remaining[0];
  const town = TOWNS.find((t) => t.id === id)!;
  return { town, bag: remaining.slice(1), lastTownId: id };
}

/** 초기 배치·캐릭터 전환 등 가방을 쓰지 않는 단발 선택. 열린 마을 전체에서 현재 마을 외를 고른다 */
export function pickNextTown(level: number, currentId: string | null, random = Math.random): Town {
  const candidates = unlockedTowns(level);
  const others = candidates.filter((town) => town.id !== currentId);
  const pool = others.length > 0 ? others : candidates;
  return pool[Math.floor(random() * pool.length)];
}
