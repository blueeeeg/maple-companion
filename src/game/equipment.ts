import { BOSSES, ZAKUM_ID } from './bosses';
import { JOB_BRANCHES, type JobBranchId, type JobLineId, type JobPath, lineOf } from './jobs';

/** 장비 컬렉션 아이템을 입는 자리. 캐시 자리에 귀고리·방패가 더 있다 */
export type EquipSlot =
  | 'cap'
  | 'faceAccessory'
  | 'eyeAccessory'
  | 'earrings'
  | 'top'
  | 'overall'
  | 'bottom'
  | 'shoes'
  | 'glove'
  | 'shield'
  | 'cape'
  | 'weapon';

export type EquipWorn = Partial<Record<EquipSlot, number>>;

export type DropTier = 'rare' | 'veryRare';

/** 보스마다 그 등급 아이템이 안 나온 채로 잡은 수 */
export type EquipPity = Record<string, Partial<Record<DropTier, number>>>;

export type EquipSource =
  | { kind: 'boss'; bossId: number; tier: DropTier }
  | { kind: 'level'; level: number }
  | { kind: 'shop'; price: number };

type EntryItems =
  | { kind: 'fixed'; ids: number[] }
  | { kind: 'line'; byLine: Record<JobLineId, number> }
  | { kind: 'weapon'; byType: Record<number, number> };

export interface EquipEntry {
  id: string;
  /** 한 아이템이면 그 이름, 갈래·계열마다 다르면 시리즈 이름 */
  name: string;
  slot: EquipSlot;
  source: EquipSource;
  items: EntryItems;
}

export const DROP_RATE: Record<DropTier, number> = { rare: 0.2, veryRare: 0.05 };
/** 이만큼 잡도록 그 등급이 안 나왔으면 이번 처치에 하나는 준다 */
export const DROP_PITY: Record<DropTier, number> = { rare: 10, veryRare: 30 };

const SLOT_BY_PREFIX: Record<number, EquipSlot> = {
  100: 'cap',
  101: 'faceAccessory',
  102: 'eyeAccessory',
  103: 'earrings',
  104: 'top',
  105: 'overall',
  106: 'bottom',
  107: 'shoes',
  108: 'glove',
  109: 'shield',
  110: 'cape',
};

/** 무기 종류 번호(ID / 10000 - 100). 30 한손검, 32 한손둔기, 33 단검, 37 완드, 38 스태프, 42 두손둔기, 43 창 … */
export const weaponType = (itemId: number) => Math.floor(itemId / 10000) - 100;
const isWeapon = (itemId: number) => weaponType(itemId) >= 30 && weaponType(itemId) < 60;

export function equipSlotOf(itemId: number): EquipSlot | null {
  if (isWeapon(itemId)) return 'weapon';
  return SLOT_BY_PREFIX[Math.floor(itemId / 10000)] ?? null;
}

const STAFF = 38;
const WAND = 37;
const ONE_HANDED_SWORD = 30;
const ONE_HANDED_BLUNT = 32;

// 방패와 한손 신기 무기(메이플 우산·프라이팬 등)는 서기·걷기·공격 동작에 다 그려지는 갈래에만 준다(조사 matrix.json)
const ONE_HANDED_BRANCHES = new Set<JobBranchId>(['hero', 'firePoison', 'iceLightning', 'bishop', 'shadower']);

const branchOf = (path: JobPath | null): JobBranchId | null => (path && path in JOB_BRANCHES ? (path as JobBranchId) : null);

/** 그 갈래가 들 수 있는 무기 종류. 제 무기 종류에, 마법사는 스태프·완드를 서로, 한손 갈래는 한손검·한손둔기를 더 든다 */
export function wieldableTypes(branch: JobBranchId): number[] {
  const own = weaponType(JOB_BRANCHES[branch].weapons[1]);
  const types = new Set([own]);
  if (JOB_BRANCHES[branch].line === 'magician') [STAFF, WAND].forEach((type) => types.add(type));
  if (ONE_HANDED_BRANCHES.has(branch)) [ONE_HANDED_SWORD, ONE_HANDED_BLUNT].forEach((type) => types.add(type));
  return [...types];
}

/** 무기·방패는 2차 갈래가 정해져야 들고, 갈래에 맞는 것만 든다. 나머지 자리는 누구나 입는다 */
export function canWear(path: JobPath | null, itemId: number): boolean {
  const slot = equipSlotOf(itemId);
  if (slot !== 'weapon' && slot !== 'shield') return slot !== null;
  const branch = branchOf(path);
  if (!branch) return false;
  if (slot === 'shield') return ONE_HANDED_BRANCHES.has(branch);
  return wieldableTypes(branch).includes(weaponType(itemId));
}

type Named = [id: number, name: string];

const names = new Map<number, string>();
const fixed = (...items: Named[]): EntryItems => {
  items.forEach(([id, name]) => names.set(id, name));
  return { kind: 'fixed', ids: items.map(([id]) => id) };
};
const byLine = (items: Record<JobLineId, Named>): EntryItems => {
  Object.values(items).forEach(([id, name]) => names.set(id, name));
  return {
    kind: 'line',
    byLine: Object.fromEntries(Object.entries(items).map(([line, [id]]) => [line, id])) as Record<JobLineId, number>,
  };
};
const series = (...items: Named[]): EntryItems => {
  items.forEach(([id, name]) => names.set(id, name));
  return { kind: 'weapon', byType: Object.fromEntries(items.map(([id]) => [weaponType(id), id])) };
};

const boss = (bossId: number, tier: DropTier): EquipSource => ({ kind: 'boss', bossId, tier });
const level = (at: number): EquipSource => ({ kind: 'level', level: at });
const shop = (price: number): EquipSource => ({ kind: 'shop', price });

const MANO = 2220000;
const MUSHMOM = 6130101;
const STUMPY = 3220000;
const DYLE = 6220000;
const ZOMBIE_MUSHMOM = 6300005;
const JUNIOR_BALROG = 8130100;
const CRIMSON_BALROG = 8150000;
const PIANUS = 8510000;
const PAPULATUS = 8500002;
const LEVIATHAN = 8220003;
const ARKARIUM = 8860000;
const PINK_BEAN = 8820001;
const MAGNUS = 8880000;
const VERUS_HILLA = 8880405;

// 아이템 ID 는 KMS 389 에서 이름·부위·캐시 아님·아이콘·착용 그림(남녀)을 확인했다. 눈장식 마크 두 개는 그림이 거의 안 보여 뺐다
export const EQUIP_ENTRIES: EquipEntry[] = [
  { id: 'mapleLeaf', name: '메이플 리프', slot: 'faceAccessory', source: boss(MANO, 'rare'), items: fixed([1012098, '메이플 리프']) },
  { id: 'orangeMushroomShirt', name: '주황버섯 티셔츠', slot: 'top', source: boss(MUSHMOM, 'rare'), items: fixed([1042352, '주황버섯 티셔츠']) },
  { id: 'mushKingGlove', name: '머쉬킹의 레더 글로브', slot: 'glove', source: boss(MUSHMOM, 'veryRare'), items: fixed([1082254, '머쉬킹의 레더 글로브']) },
  { id: 'vikingHelm', name: '아이언 바이킹 헬름', slot: 'cap', source: boss(STUMPY, 'rare'), items: fixed([1002011, '아이언 바이킹 헬름']) },
  { id: 'skullEarrings', name: '해골 귀고리', slot: 'earrings', source: boss(DYLE, 'rare'), items: fixed([1032012, '해골 귀고리']) },
  { id: 'skullShield', name: '해골 방패', slot: 'shield', source: boss(DYLE, 'veryRare'), items: fixed([1092004, '해골 방패']) },
  { id: 'zakumHelmet', name: '자쿰의 투구', slot: 'cap', source: boss(ZAKUM_ID, 'rare'), items: fixed([1002357, '자쿰의 투구']) },
  { id: 'zakumBranch', name: '자쿰의 나뭇가지', slot: 'weapon', source: boss(ZAKUM_ID, 'rare'), items: fixed([1372049, '자쿰의 나뭇가지']) },
  { id: 'chaosZakumHelmet', name: '카오스 자쿰의 투구', slot: 'cap', source: boss(ZAKUM_ID, 'veryRare'), items: fixed([1003112, '카오스 자쿰의 투구']) },
  {
    id: 'zakumPoisonic',
    name: '자쿰의 포이즈닉 무기',
    slot: 'weapon',
    source: boss(ZAKUM_ID, 'veryRare'),
    items: series(
      [1302312, '자쿰의 포이즈닉 소드'],
      [1422168, '자쿰의 포이즈닉 빅해머'],
      [1432197, '자쿰의 포이즈닉 스피어'],
      [1382242, '자쿰의 포이즈닉 스태프'],
      [1372204, '자쿰의 포이즈닉 완드'],
      [1452235, '자쿰의 포이즈닉 보우'],
      [1462222, '자쿰의 포이즈닉 크로스보우'],
      [1472244, '자쿰의 포이즈닉 가즈'],
      [1332257, '자쿰의 포이즈닉 대거'],
      [1482199, '자쿰의 포이즈닉 너클'],
      [1492209, '자쿰의 포이즈닉 건'],
    ),
  },
  { id: 'weirdMushroomFace', name: '요상한 주황버섯 얼굴장식', slot: 'faceAccessory', source: boss(ZOMBIE_MUSHMOM, 'rare'), items: fixed([1012576, '요상한 주황버섯 얼굴장식']) },
  { id: 'poisonMushroom', name: '독버섯', slot: 'weapon', source: boss(ZOMBIE_MUSHMOM, 'rare'), items: fixed([1382015, '독버섯']) },
  { id: 'balrogLeatherShoes', name: '발록의 가죽 신발', slot: 'shoes', source: boss(JUNIOR_BALROG, 'rare'), items: fixed([1072375, '발록의 가죽 신발']) },
  { id: 'balrogFurShoes', name: '발록의 털가죽 신발', slot: 'shoes', source: boss(CRIMSON_BALROG, 'rare'), items: fixed([1072376, '발록의 털가죽 신발']) },
  {
    id: 'balrogWeapon',
    name: '발록 무기',
    slot: 'weapon',
    source: boss(CRIMSON_BALROG, 'veryRare'),
    items: series(
      [1302113, '발록의 프라우테'],
      [1422043, '발록의 레오마이트'],
      [1432055, '발록의 페어프로즌'],
      [1382067, '발록의 블루마린'],
      [1372051, '발록의 피닉스 완드'],
      [1452070, '발록의 메투스'],
      [1462063, '발록의 카사 크로우'],
      [1472084, '발록의 캐스터스'],
      [1332087, '발록의 바키트'],
      [1482032, '발록의 백혈귀'],
      [1492036, '발록의 피스메이커'],
    ),
  },
  { id: 'aquariusCrown', name: '아쿠아리스 크라운', slot: 'cap', source: boss(PIANUS, 'rare'), items: fixed([1004075, '아쿠아리스 크라운']) },
  { id: 'fishSpear', name: '물고기 작살', slot: 'weapon', source: boss(PIANUS, 'rare'), items: fixed([1432008, '물고기 작살']) },
  { id: 'coralWand', name: '산호 가지 지팡이', slot: 'weapon', source: boss(PIANUS, 'rare'), items: fixed([1372243, '산호 가지 지팡이']) },
  { id: 'ludibriumCape', name: '루디브리엄 망토', slot: 'cape', source: boss(PAPULATUS, 'rare'), items: fixed([1102057, '루디브리엄 망토']) },
  {
    id: 'royalVanLeon',
    name: '로얄 반 레온 무기',
    slot: 'weapon',
    source: boss(PAPULATUS, 'veryRare'),
    items: series(
      [1302316, '로얄 반 레온 세이버'],
      [1422186, '로얄 반 레온 투핸드해머'],
      [1432201, '로얄 반 레온 스피어'],
      [1382246, '로얄 반 레온 스태프'],
      [1372208, '로얄 반 레온 완드'],
      [1452239, '로얄 반 레온 보우'],
      [1462226, '로얄 반 레온 크로스보우'],
      [1472248, '로얄 반 레온 가즈'],
      [1332261, '로얄 반 레온 대거'],
      [1482203, '로얄 반 레온 클로'],
      [1492213, '로얄 반 레온 피스톨'],
    ),
  },
  { id: 'horntailShirt', name: '혼테일의 복근무늬 티셔츠', slot: 'top', source: boss(LEVIATHAN, 'rare'), items: fixed([1042243, '혼테일의 복근무늬 티셔츠']) },
  {
    id: 'fafnir',
    name: '파프니르 무기',
    slot: 'weapon',
    source: boss(LEVIATHAN, 'veryRare'),
    items: series(
      [1302275, '파프니르 미스틸테인'],
      [1422140, '파프니르 라이트닝어'],
      [1432167, '파프니르 브류나크'],
      [1382208, '파프니르 마나크라운'],
      [1372177, '파프니르 마나테이커'],
      [1452205, '파프니르 윈드체이서'],
      [1462193, '파프니르 윈드윙슈터'],
      [1472214, '파프니르 리스크홀더'],
      [1332225, '파프니르 다마스커스'],
      [1482168, '파프니르 펜리르탈론'],
      [1492179, '파프니르 첼리스카'],
    ),
  },
  { id: 'arkariumBeard', name: '아카이럼의 수염', slot: 'faceAccessory', source: boss(ARKARIUM, 'rare'), items: fixed([1012332, '아카이럼의 수염']) },
  {
    id: 'absolab',
    name: '앱솔랩스 무기',
    slot: 'weapon',
    source: boss(ARKARIUM, 'veryRare'),
    items: series(
      [1302333, '앱솔랩스 세이버'],
      [1422184, '앱솔랩스 브로드해머'],
      [1432214, '앱솔랩스 피어싱스피어'],
      [1382259, '앱솔랩스 스펠링스태프'],
      [1372222, '앱솔랩스 스펠링완드'],
      [1452252, '앱솔랩스 슈팅보우'],
      [1462239, '앱솔랩스 크로스보우'],
      [1472261, '앱솔랩스 리벤지가즈'],
      [1332274, '앱솔랩스 슬래셔'],
      [1482216, '앱솔랩스 블로우너클'],
      [1492231, '앱솔랩스 포인팅건'],
    ),
  },
  { id: 'pinkBeanHat', name: '핑크빈 모자', slot: 'cap', source: boss(PINK_BEAN, 'rare'), items: fixed([1002971, '핑크빈 모자']) },
  { id: 'pinkBeanSuit', name: '핑크빈 슈트', slot: 'overall', source: boss(PINK_BEAN, 'rare'), items: fixed([1052202, '핑크빈 슈트']) },
  { id: 'chaosPinkBeanHat', name: '카오스 핑크빈 모자', slot: 'cap', source: boss(PINK_BEAN, 'veryRare'), items: fixed([1003621, '카오스 핑크빈 모자']) },
  {
    id: 'tyrantCloak',
    name: '타일런트 클록',
    slot: 'cape',
    source: boss(MAGNUS, 'rare'),
    items: byLine({
      warrior: [1102481, '타일런트 히아데스 클록'],
      magician: [1102482, '타일런트 헤르메스 클록'],
      archer: [1102483, '타일런트 케이론 클록'],
      thief: [1102484, '타일런트 리카온 클록'],
      pirate: [1102485, '타일런트 알테어 클록'],
    }),
  },
  {
    id: 'genesis',
    name: '제네시스 무기',
    slot: 'weapon',
    source: boss(VERUS_HILLA, 'veryRare'),
    items: series(
      [1302355, '제네시스 세이버'],
      [1422197, '제네시스 투핸드해머'],
      [1432227, '제네시스 스피어'],
      [1382274, '제네시스 스태프'],
      [1372237, '제네시스 완드'],
      [1452266, '제네시스 보우'],
      [1462252, '제네시스 크로스보우'],
      [1472275, '제네시스 가즈'],
      [1332289, '제네시스 대거'],
      [1482232, '제네시스 클로'],
      [1492245, '제네시스 피스톨'],
    ),
  },

  { id: 'mapleCape', name: '메이플 망토', slot: 'cape', source: level(30), items: fixed([1102166, '메이플 망토']) },
  { id: 'mapleShield', name: '메이플 실드', slot: 'shield', source: level(43), items: fixed([1092030, '메이플 실드']) },
  {
    // 썬콜은 메이플 샤이니 완드가 3차부터 든 기본 무기라 resolveWeapon 이 메이플 위덤 스태프로 바꿔 준다
    id: 'maple64',
    name: '메이플 무기',
    slot: 'weapon',
    source: level(64),
    items: series(
      [1302064, '메이플 글로리 소드'],
      [1422029, '메이플 벨제트'],
      [1432040, '메이플 베리트 스피어'],
      [1382039, '메이플 위덤 스태프'],
      [1372034, '메이플 샤이니 완드'],
      [1452045, '메이플 간디바 보우'],
      [1462040, '메이플 니샤다'],
      [1472055, '메이플 스칸다'],
      [1332055, '메이플 다크메이트'],
      [1482022, '메이플 골든 크로'],
      [1492022, '메이플 캐논 슈터'],
    ),
  },
  { id: 'greenGiles', name: '초록색 자일즈의 망토', slot: 'cape', source: level(100), items: fixed([1102031, '초록색 자일즈의 망토']) },
  {
    id: 'highnessHat',
    name: '하이네스 모자',
    slot: 'cap',
    source: level(150),
    items: byLine({
      warrior: [1003797, '하이네스 워리어헬름'],
      magician: [1003798, '하이네스 던위치햇'],
      archer: [1003799, '하이네스 레인져베레'],
      thief: [1003800, '하이네스 어새신보닛'],
      pirate: [1003801, '하이네스 원더러햇'],
    }),
  },
  {
    id: 'eagleEyeTop',
    name: '이글아이 상의',
    slot: 'top',
    source: level(150),
    items: byLine({
      warrior: [1042254, '이글아이 워리어아머'],
      magician: [1042255, '이글아이 던위치로브'],
      archer: [1042256, '이글아이 레인져후드'],
      thief: [1042257, '이글아이 어새신셔츠'],
      pirate: [1042258, '이글아이 원더러코트'],
    }),
  },
  {
    id: 'tricksterPants',
    name: '트릭스터 하의',
    slot: 'bottom',
    source: level(150),
    items: byLine({
      warrior: [1062165, '트릭스터 워리어팬츠'],
      magician: [1062166, '트릭스터 던위치팬츠'],
      archer: [1062167, '트릭스터 레인져팬츠'],
      thief: [1062168, '트릭스터 어새신팬츠'],
      pirate: [1062169, '트릭스터 원더러팬츠'],
    }),
  },
  {
    id: 'arcaneWeapon',
    name: '아케인셰이드 무기',
    slot: 'weapon',
    source: level(200),
    items: series(
      [1302343, '아케인셰이드 세이버'],
      [1422189, '아케인셰이드 투핸드해머'],
      [1432218, '아케인셰이드 스피어'],
      [1382265, '아케인셰이드 스태프'],
      [1372228, '아케인셰이드 완드'],
      [1452257, '아케인셰이드 보우'],
      [1462243, '아케인셰이드 크로스보우'],
      [1472265, '아케인셰이드 가즈'],
      [1332279, '아케인셰이드 대거'],
      [1482221, '아케인셰이드 클로'],
      [1492235, '아케인셰이드 피스톨'],
    ),
  },

  // 캐시 아이템(모자 25,000·장갑 15,000·무기 100,000)보다 싼 세 단계. 근거는 조사 candidates.md 「경제」
  { id: 'workGloves', name: '노가다 목장갑', slot: 'glove', source: shop(5_000), items: fixed([1082002, '노가다 목장갑']) },
  {
    id: 'colorWorkGloves',
    name: '컬러 노가다 목장갑',
    slot: 'glove',
    source: shop(5_000),
    items: fixed(
      [1082145, '노란색 노가다 목장갑'],
      [1082146, '빨간색 노가다 목장갑'],
      [1082147, '파랑색 노가다 목장갑'],
      [1082148, '보라색 노가다 목장갑'],
      [1082149, '갈색 노가다 목장갑'],
      [1082150, '회색 노가다 목장갑'],
    ),
  },
  { id: 'redStarBandana', name: '빨간색 별 두건', slot: 'cap', source: shop(5_000), items: fixed([1002020, '빨간색 별 두건']) },
  { id: 'blueMoonHat', name: '블루문 고깔모자', slot: 'cap', source: shop(5_000), items: fixed([1002102, '블루문 고깔모자']) },
  { id: 'pumpkinHat', name: '할로윈 호박 모자', slot: 'cap', source: shop(5_000), items: fixed([1002699, '할로윈 호박 모자']) },
  { id: 'dragonGoggles', name: '드래곤 안경', slot: 'eyeAccessory', source: shop(5_000), items: fixed([1022097, '드래곤 안경']) },
  { id: 'orangeMushroomFace', name: '주황버섯 얼굴장식', slot: 'faceAccessory', source: shop(5_000), items: fixed([1012530, '주황버섯 얼굴장식']) },
  { id: 'roseEarrings', name: '장미꽃 귀고리', slot: 'earrings', source: shop(12_000), items: fixed([1032017, '장미꽃 귀고리']) },
  {
    id: 'adventurerCape',
    name: '모험가의 망토',
    slot: 'cape',
    source: shop(12_000),
    items: fixed([1102002, '빨간색 모험가의 망토'], [1102004, '검은색 모험가의 망토']),
  },
  { id: 'mapleUmbrella', name: '메이플 우산', slot: 'weapon', source: shop(25_000), items: fixed([1302058, '메이플 우산']) },
  { id: 'witchBroom', name: '마녀의 빗자루', slot: 'weapon', source: shop(25_000), items: fixed([1302150, '마녀의 빗자루']) },
  { id: 'fryingPan', name: '프라이팬', slot: 'weapon', source: shop(25_000), items: fixed([1322027, '프라이팬']) },
  { id: 'woodenMallet', name: '나무 망치', slot: 'weapon', source: shop(25_000), items: fixed([1422000, '나무 망치']) },
];

const entryByItem = new Map<number, EquipEntry>();
EQUIP_ENTRIES.forEach((entry) => {
  const ids =
    entry.items.kind === 'fixed'
      ? entry.items.ids
      : Object.values(entry.items.kind === 'line' ? entry.items.byLine : entry.items.byType);
  ids.forEach((id) => entryByItem.set(id, entry));
});

export const equipItemName = (itemId: number) => names.get(itemId) ?? `아이템 ${itemId}`;
export const equipEntryOf = (itemId: number): EquipEntry | null => entryByItem.get(itemId) ?? null;
export const isEquipItem = (itemId: number) => entryByItem.has(itemId);

/**
 * 시리즈 무기 중 그 갈래 것. 갈래가 3차부터 이미 들고 있는 기본 무기와 같으면 받을 맛이 없어서
 * 마법사는 스태프·완드 중 다른 쪽으로 바꾸고, 바꿀 것이 없으면 null
 */
function resolveWeapon(byType: Record<number, number>, branch: JobBranchId): number | null {
  const own = JOB_BRANCHES[branch].weapons[1];
  const item = byType[weaponType(own)];
  if (item !== undefined && item !== own) return item;
  if (JOB_BRANCHES[branch].line !== 'magician') return null;
  return byType[weaponType(own) === STAFF ? WAND : STAFF] ?? null;
}

/** 이 캐릭터가 이 칸에서 모을 수 있는 아이템. 갈래·계열이 아직 없거나 못 드는 무기·방패면 빈 배열이다 */
export function entryItems(entry: EquipEntry, path: JobPath | null): number[] {
  const { items } = entry;
  if (items.kind === 'line') return path ? [items.byLine[lineOf(path)]] : [];
  if (items.kind === 'weapon') {
    const branch = branchOf(path);
    const item = branch ? resolveWeapon(items.byType, branch) : null;
    return item === null ? [] : [item];
  }
  return items.ids.filter((id) => canWear(path, id));
}

/** 상점 칸에 늘어놓을 아이템. 못 드는 무기도 보이고 고르면 까닭을 적는다 */
export const EQUIP_SHOP_ITEMS: { id: number; price: number }[] = EQUIP_ENTRIES.flatMap(({ source, items }) =>
  source.kind === 'shop' && items.kind === 'fixed' ? items.ids.map((id) => ({ id, price: source.price })) : [],
);

export function equipShopPrice(itemId: number): number | null {
  const source = equipEntryOf(itemId)?.source;
  return source?.kind === 'shop' ? source.price : null;
}

export interface EquipOwner {
  meso: number;
  equipOwned: number[];
}

/** 메소를 내고 컬렉션에 넣는다. 상점 물건이 아니거나 못 드는 무기거나 이미 있거나 메소가 모자라면 false */
export function buyEquipItem(owner: EquipOwner, itemId: number, path: JobPath | null): boolean {
  const price = equipShopPrice(itemId);
  if (price === null || !canWear(path, itemId) || owner.equipOwned.includes(itemId) || owner.meso < price) return false;
  owner.meso -= price;
  owner.equipOwned.push(itemId);
  return true;
}

export interface BossDrop {
  drops: number[];
  pity: EquipPity;
}

/**
 * 보스 한 번 처치의 장비 드롭. 아직 없는 아이템마다 등급 확률로 굴리고, 그 등급이 천장만큼 안 나왔으면 하나를 준다.
 * 모을 것이 남지 않은 등급은 세지 않는다. 연습전은 부르지 않는다
 */
export function rollBossDrops(
  bossId: number,
  path: JobPath | null,
  owned: number[],
  pity: EquipPity,
  random = Math.random,
): BossDrop {
  const drops: number[] = [];
  const counts = { ...pity[bossId] };
  (['rare', 'veryRare'] as const).forEach((tier) => {
    const pool = EQUIP_ENTRIES.filter(
      (entry) => entry.source.kind === 'boss' && entry.source.bossId === bossId && entry.source.tier === tier,
    )
      .flatMap((entry) => entryItems(entry, path))
      .filter((id) => !owned.includes(id));
    if (pool.length === 0) return;
    const kills = (counts[tier] ?? 0) + 1;
    const dropped = pool.filter(() => random() < DROP_RATE[tier]);
    if (dropped.length === 0 && kills >= DROP_PITY[tier]) dropped.push(pool[Math.floor(random() * pool.length)]);
    counts[tier] = dropped.length > 0 ? 0 : kills;
    drops.push(...dropped);
  });
  return { drops, pity: { ...pity, [bossId]: counts } };
}

/**
 * 진짜 보스 처치(사냥 차례·보스 도전·숨긴 동안 정산한 보스 차례)의 드롭을 캐릭터에 넣는다.
 * 연습전은 보상이 없어 굴리지도 세지도 않는다. 새로 얻은 아이템 ID 를 돌려준다
 */
export function awardBossDrops(
  character: { equipOwned: number[]; equipPity: EquipPity },
  bossId: number,
  path: JobPath | null,
  practice: boolean,
  random = Math.random,
): number[] {
  if (practice) return [];
  const { drops, pity } = rollBossDrops(bossId, path, character.equipOwned, character.equipPity, random);
  character.equipPity = pity;
  character.equipOwned.push(...drops);
  return drops;
}

/** 그 보스·등급을 드롭 없이 잡은 수와 확정까지의 수(「7/10」) */
export function pityProgress(
  bossId: number,
  tier: DropTier,
  pity: EquipPity,
): { kills: number; limit: number } {
  return { kills: pity[bossId]?.[tier] ?? 0, limit: DROP_PITY[tier] };
}

/** 아직 없는 칸에 적는 얻는 법. 「핑크빈 처치 · 낮은 확률 · 7/10」·「Lv.150 달성」·「장비 상점 5,000 메소」 */
export function howToGet(entry: EquipEntry, pity: EquipPity): string {
  const { source } = entry;
  if (source.kind === 'level') return `Lv.${source.level} 달성 선물`;
  if (source.kind === 'shop') return `장비 상점 ${source.price.toLocaleString()} 메소`;
  const bossName = BOSSES.find((each) => each.id === source.bossId)?.name ?? '보스';
  const { kills, limit } = pityProgress(source.bossId, source.tier, pity);
  return `${bossName} 처치 · ${source.tier === 'rare' ? '낮은' : '아주 낮은'} 확률 · ${kills}/${limit}`;
}

/** 레벨에 닿은 선물 중 아직 안 받은 것을 준다. 이미 그 레벨을 넘은 캐릭터도 처음 불렀을 때 받는다 */
export function grantLevelGifts(
  character: { equipOwned: number[]; equipGifts: number[] },
  level: number,
  path: JobPath | null,
): number[] {
  const granted = EQUIP_ENTRIES.filter((entry) => entry.source.kind === 'level' && entry.source.level <= level)
    .flatMap((entry) => entryItems(entry, path))
    .filter((id) => !character.equipGifts.includes(id));
  granted.forEach((id) => {
    character.equipGifts.push(id);
    if (!character.equipOwned.includes(id)) character.equipOwned.push(id);
  });
  return granted;
}

/** 모은 칸 수와 이 캐릭터가 모을 수 있는 칸 수. 갈래가 못 드는 무기·방패 칸은 셈에서 뺀다 */
export function collectionProgress(owned: number[], path: JobPath | null): { owned: number; total: number } {
  const open = EQUIP_ENTRIES.map((entry) => entryItems(entry, path)).filter((items) => items.length > 0);
  return { owned: open.filter((items) => items.some((id) => owned.includes(id))).length, total: open.length };
}

/** 입는 자리에 넣는다. 한벌옷은 상의·하의를, 상의·하의는 한벌옷을 벗긴다 */
export function equipGear(worn: EquipWorn, itemId: number): EquipWorn {
  const slot = equipSlotOf(itemId);
  if (!slot) return worn;
  const next: EquipWorn = { ...worn, [slot]: itemId };
  if (slot === 'overall') {
    delete next.top;
    delete next.bottom;
  }
  if (slot === 'top' || slot === 'bottom') delete next.overall;
  return next;
}

export function unequipGear(worn: EquipWorn, slot: EquipSlot): EquipWorn {
  const next = { ...worn };
  delete next[slot];
  return next;
}

const SLOT_ORDER: EquipSlot[] = [
  'cap',
  'faceAccessory',
  'eyeAccessory',
  'earrings',
  'top',
  'overall',
  'bottom',
  'shoes',
  'glove',
  'shield',
  'cape',
  'weapon',
];

/**
 * 직업·차수 장비 위에 컬렉션 장비를 입힌 렌더용 목록. 캐시 아이템은 이 위에 composeLook 으로 덮는다.
 * 무기는 겹쳐 그릴 수 없어서 직업 무기를 빼고 바꿔 넣는다. 지금 갈래가 못 드는 무기·방패는 입은 채로 두되 그리지 않는다
 */
export function wearEquipment(look: number[], worn: EquipWorn, path: JobPath | null): number[] {
  const wearing = SLOT_ORDER.filter((slot) => {
    const itemId = worn[slot];
    return itemId !== undefined && canWear(path, itemId) && (slot !== 'weapon' || look.some(isWeapon));
  });
  const covered = new Set<EquipSlot>(wearing);
  if (covered.has('overall')) covered.add('top').add('bottom');
  if (covered.has('top') || covered.has('bottom')) covered.add('overall');
  const kept = look.filter((itemId) => {
    const slot = equipSlotOf(itemId);
    return !slot || !covered.has(slot);
  });
  return [...kept, ...wearing.map((slot) => worn[slot]!)];
}

/** 같은 자리의 캐시 아이템에 가려 안 보이는지. 원작처럼 캐시가 앞이다 */
export function hiddenByCash(slot: EquipSlot, cash: Partial<Record<string, number>>): boolean {
  if (cash[slot] !== undefined) return true;
  if ((slot === 'top' || slot === 'bottom') && cash.overall !== undefined) return true;
  return slot === 'overall' && (cash.top !== undefined || cash.bottom !== undefined);
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** 저장된 컬렉션 값을 정리한다. 없는 값(예전 저장)은 비우고, 모르는 아이템이나 가진 적 없는 착용은 버린다 */
export function normalizeEquipData(saved: {
  equipOwned?: unknown;
  equipWorn?: unknown;
  equipPity?: unknown;
  equipGifts?: unknown;
}): { equipOwned: number[]; equipWorn: EquipWorn; equipPity: EquipPity; equipGifts: number[] } {
  const known = (list: unknown) =>
    Array.isArray(list) ? [...new Set(list.filter((id): id is number => typeof id === 'number' && isEquipItem(id)))] : [];
  const equipOwned = known(saved.equipOwned);
  const equipWorn = Object.entries((saved.equipWorn ?? {}) as Record<string, unknown>).reduce<EquipWorn>(
    (worn, [slot, itemId]) =>
      typeof itemId === 'number' && equipOwned.includes(itemId) && equipSlotOf(itemId) === slot ? equipGear(worn, itemId) : worn,
    {},
  );
  const bossIds = new Set(
    EQUIP_ENTRIES.flatMap((entry) => (entry.source.kind === 'boss' ? [String(entry.source.bossId)] : [])),
  );
  const equipPity = Object.entries((saved.equipPity ?? {}) as Record<string, unknown>).reduce<EquipPity>((pity, [bossId, counts]) => {
    if (!bossIds.has(bossId) || typeof counts !== 'object' || counts === null) return pity;
    const { rare, veryRare } = counts as Record<string, unknown>;
    pity[bossId] = { ...(isCount(rare) ? { rare } : {}), ...(isCount(veryRare) ? { veryRare } : {}) };
    return pity;
  }, {});
  return { equipOwned, equipWorn, equipPity, equipGifts: known(saved.equipGifts) };
}

/** 양쪽 저장의 천장을 합칠 때는 보스·등급마다 더 많이 센 쪽을 쓴다. 드롭으로 0 이 된 쪽은 컬렉션 합치기가 받아 준다 */
export function mergeEquipPity(a: EquipPity, b: EquipPity): EquipPity {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].reduce<EquipPity>((merged, bossId) => {
    const left = a[bossId] ?? {};
    const right = b[bossId] ?? {};
    merged[bossId] = {};
    (['rare', 'veryRare'] as const).forEach((tier) => {
      const count = Math.max(left[tier] ?? 0, right[tier] ?? 0);
      if (left[tier] !== undefined || right[tier] !== undefined) merged[bossId][tier] = count;
    });
    return merged;
  }, {});
}
