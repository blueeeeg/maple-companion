import type { DropTier, EquipEntry, EquipSource, EntryItems, Named } from './equipment';
import type { JobLineId } from './jobs';

/** equipment.ts 의 표 만들기 도구. 이 파일이 equipment.ts 를 값으로 불러오면 서로 불러오는 고리가 생겨서 받아 쓴다 */
export interface EntryTools {
  fixed(...items: Named[]): EntryItems;
  byLine(items: Record<JobLineId, Named>): EntryItems;
  series(...items: Named[]): EntryItems;
  boss(bossId: number, tier: DropTier): EquipSource;
  level(at: number): EquipSource;
  shop(price: number): EquipSource;
}

const MANO = 2220000;
const MUSHMOM = 6130101;
const STUMPY = 3220000;
const DYLE = 6220000;
const ZAKUM = 8800000;
const ZOMBIE_MUSHMOM = 6300005;
const JUNIOR_BALROG = 8130100;
const CRIMSON_BALROG = 8150000;
const GRIFFEY = 8180001;
const MANON = 8180000;
const PIANUS = 8510000;
const LEVIATHAN = 8220003;
const PAPULATUS = 8500002;
const PINK_BEAN = 8820001;

/**
 * 클래식 장비 컬렉션. 아이템은 모두 GMS 83 에 있고 이름은 같은 ID 의 KMS 389 이름이다. 지금 시대 표에서 v83 에 있는 것은
 * 같은 칸 ID 로 두고(빅뱅 뒤 아이템은 뺐다), 그 시대 대표 장비(자쿰의 투구 3·메이플 무기 Lv43·타임리스·리버스)를 더했다
 */
export function classicEquipEntries({ fixed, byLine, series, boss, level, shop }: EntryTools): EquipEntry[] {
  return [
    { id: 'mapleLeaf', name: '메이플 리프', slot: 'faceAccessory', source: boss(MANO, 'rare'), items: fixed([1012098, '메이플 리프']) },
    { id: 'brownPitsBandana', name: '브라운 피츠 반다나', slot: 'cap', source: boss(MANO, 'rare'), items: fixed([1002619, '브라운 피츠 반다나']) },
    { id: 'brownToolkGalley', name: '브라운 툴크갤리', slot: 'overall', source: boss(MANO, 'rare'), items: fixed([1052104, '브라운 툴크갤리']) },
    { id: 'hardLeatherGlove', name: '하드레더 글로브', slot: 'glove', source: boss(MANO, 'rare'), items: fixed([1082186, '하드레더 글로브']) },
    { id: 'brownWoodenKrag', name: '브라운 우든크라그', slot: 'shoes', source: boss(MANO, 'rare'), items: fixed([1072291, '브라운 우든크라그']) },
    { id: 'vikingHelm', name: '아이언 바이킹 헬름', slot: 'cap', source: boss(STUMPY, 'rare'), items: fixed([1002011, '아이언 바이킹 헬름']) },
    { id: 'redBarbei', name: '레드 바르베이', slot: 'overall', source: boss(STUMPY, 'rare'), items: fixed([1052113, '레드 바르베이']) },
    { id: 'brownLeatherKrag', name: '브라운 레더크라그', slot: 'shoes', source: boss(STUMPY, 'rare'), items: fixed([1072300, '브라운 레더크라그']) },
    { id: 'redRoyalMisty', name: '레드 로얄미스티', slot: 'cap', source: boss(STUMPY, 'rare'), items: fixed([1002628, '레드 로얄미스티']) },
    { id: 'zakumHelmet', name: '자쿰의 투구', slot: 'cap', source: boss(ZAKUM, 'rare'), items: fixed([1002357, '자쿰의 투구']) },
    { id: 'zakumBranch', name: '자쿰의 나뭇가지', slot: 'weapon', source: boss(ZAKUM, 'rare'), items: fixed([1372049, '자쿰의 나뭇가지']) },
    { id: 'zakumHelmet3', name: '자쿰의 투구3', slot: 'cap', source: boss(ZAKUM, 'veryRare'), items: fixed([1002430, '자쿰의 투구3']) },
    { id: 'mushKingGlove', name: '머쉬킹의 레더 글로브', slot: 'glove', source: boss(MUSHMOM, 'veryRare'), items: fixed([1082254, '머쉬킹의 레더 글로브']) },
    { id: 'crystalFlowerRing', name: '크리스탈 플라워링', slot: 'earrings', source: boss(MUSHMOM, 'rare'), items: fixed([1032019, '크리스탈 플라워링']) },
    { id: 'steelTowerShield', name: '스틸 타워 실드', slot: 'shield', source: boss(MUSHMOM, 'rare'), items: fixed([1092012, '스틸 타워 실드']) },
    { id: 'thorns', name: '쏜즈', slot: 'weapon', source: boss(MUSHMOM, 'rare'), items: fixed([1382006, '쏜즈']) },
    { id: 'skullEarrings', name: '해골 귀고리', slot: 'earrings', source: boss(DYLE, 'rare'), items: fixed([1032012, '해골 귀고리']) },
    { id: 'skullShield', name: '해골 방패', slot: 'shield', source: boss(DYLE, 'veryRare'), items: fixed([1092004, '해골 방패']) },
    { id: 'boneHelm', name: '본 헬름', slot: 'cap', source: boss(DYLE, 'rare'), items: fixed([1002006, '본 헬름']) },
    {
      id: 'dyleWeapon',
      name: '다일 무기',
      slot: 'weapon',
      source: boss(DYLE, 'veryRare'),
      items: series(
        [1302012, '레드 카타나'],
        [1422010, '호프만'],
        [1432007, '스페판'],
        [1382010, '레이든 스태프'],
        [1372015, '엔젤윙즈'],
        [1452011, '골든 힌켈'],
        [1462009, '그로스야거'],
        [1472029, '흑갑충'],
        [1332018, '칸디네'],
        [1482009, '베이아 크래쉬'],
        [1492009, '어비스 슈터'],
      ),
    },
    { id: 'poisonMushroom', name: '독버섯', slot: 'weapon', source: boss(ZOMBIE_MUSHMOM, 'rare'), items: fixed([1382015, '독버섯']) },
    { id: 'pinkFlowerEarrings', name: '분홍꽃 귀고리', slot: 'earrings', source: boss(ZOMBIE_MUSHMOM, 'rare'), items: fixed([1032014, '분홍꽃 귀고리']) },
    { id: 'blackGaiaCape', name: '검은색 가이아의 망토', slot: 'cape', source: boss(ZOMBIE_MUSHMOM, 'rare'), items: fixed([1102024, '검은색 가이아의 망토']) },
    { id: 'silverLegendShield', name: '실버 레전드 실드', slot: 'shield', source: boss(ZOMBIE_MUSHMOM, 'rare'), items: fixed([1092010, '실버 레전드 실드']) },
    { id: 'balrogLeatherShoes', name: '발록의 가죽 신발', slot: 'shoes', source: boss(JUNIOR_BALROG, 'rare'), items: fixed([1072375, '발록의 가죽 신발']) },
    { id: 'silverAncientShield', name: '실버 에인션트 실드', slot: 'shield', source: boss(JUNIOR_BALROG, 'rare'), items: fixed([1092016, '실버 에인션트 실드']) },
    {
      id: 'balrogWeapon80',
      name: '발록 무기(Lv80)',
      slot: 'weapon',
      source: boss(JUNIOR_BALROG, 'veryRare'),
      items: series(
        [1302112, '발록의 아츠'],
        [1422042, '발록의 크롬'],
        [1432054, '발록의 호진공창'],
        [1382066, '발록의 케이그'],
        [1372050, '발록의 마기코라스'],
        [1452067, '발록의 파이어 아룬드'],
        [1462060, '발록의 파이어 샬리트'],
        [1472083, '발록의 코브라스티어'],
        [1332084, '발록의 카타르'],
        [1482031, '발록의 스틸르노'],
        [1492035, '발록의 인피티니'],
      ),
    },
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
    // 리프레 숲의 두 보스는 그 시대 드래곤 투구를 준다
    { id: 'blueDragonBabuta', name: '블루 드래곤 바부타', slot: 'cap', source: boss(GRIFFEY, 'rare'), items: fixed([1002339, '블루 드래곤 바부타']) },
    { id: 'redDragonBabuta', name: '레드 드래곤 바부타', slot: 'cap', source: boss(MANON, 'rare'), items: fixed([1002338, '레드 드래곤 바부타']) },
    { id: 'goldDragonCrown', name: '골드 드래곤 크라운', slot: 'cap', source: boss(MANON, 'veryRare'), items: fixed([1002773, '골드 드래곤 크라운']) },
    { id: 'fishSpear', name: '물고기 작살', slot: 'weapon', source: boss(PIANUS, 'rare'), items: fixed([1432008, '물고기 작살']) },
    { id: 'oxygenTank', name: '산소통', slot: 'cape', source: boss(PIANUS, 'rare'), items: fixed([1102061, '산소통']) },
    { id: 'blueDragonHelm', name: '블루 드래곤 투구', slot: 'cap', source: boss(LEVIATHAN, 'rare'), items: fixed([1002551, '블루 드래곤 투구']) },
    { id: 'blueDragonGauntlet', name: '블루 드래곤 건틀렛', slot: 'glove', source: boss(LEVIATHAN, 'rare'), items: fixed([1082168, '블루 드래곤 건틀렛']) },
    { id: 'blueDragonBoots', name: '블루 드래곤 부츠', slot: 'shoes', source: boss(LEVIATHAN, 'rare'), items: fixed([1072273, '블루 드래곤 부츠']) },
    { id: 'blueDragonShield', name: '블루 드래곤 실드', slot: 'shield', source: boss(LEVIATHAN, 'veryRare'), items: fixed([1092060, '블루 드래곤 실드']) },
    { id: 'ludibriumCape', name: '루디브리엄 망토', slot: 'cape', source: boss(PAPULATUS, 'rare'), items: fixed([1102057, '루디브리엄 망토']) },
    { id: 'toyNose', name: '장난감 코', slot: 'faceAccessory', source: boss(PAPULATUS, 'rare'), items: fixed([1012146, '장난감 코']) },
    { id: 'blackSkelDuke', name: '블랙 스켈듀크', slot: 'glove', source: boss(PAPULATUS, 'rare'), items: fixed([1082213, '블랙 스켈듀크']) },
    { id: 'blueCrescentBoots', name: '블루 크리센트부츠', slot: 'shoes', source: boss(PAPULATUS, 'rare'), items: fixed([1072221, '블루 크리센트부츠']) },
    { id: 'pinkBeanHat', name: '핑크빈 모자', slot: 'cap', source: boss(PINK_BEAN, 'rare'), items: fixed([1002971, '핑크빈 모자']) },
    { id: 'pinkBeanSuit', name: '핑크빈 슈트', slot: 'overall', source: boss(PINK_BEAN, 'rare'), items: fixed([1052202, '핑크빈 슈트']) },
    // 시간의 신전 깊은 곳의 보스라 그 시대 타임리스 장비를 준다
    { id: 'timelessMoonlight', name: '타임리스 문라이트', slot: 'cape', source: boss(PINK_BEAN, 'rare'), items: fixed([1102172, '타임리스 문라이트']) },
    { id: 'timelessEarrings', name: '타임리스 이어링', slot: 'earrings', source: boss(PINK_BEAN, 'rare'), items: fixed([1032031, '타임리스 이어링']) },
    {
      id: 'timelessHat',
      name: '타임리스 모자',
      slot: 'cap',
      source: boss(PINK_BEAN, 'veryRare'),
      items: byLine({
        warrior: [1002776, '타임리스 휀넬'],
        magician: [1002777, '타임리스 코럴'],
        archer: [1002778, '타임리스 라피드'],
        thief: [1002779, '타임리스 차이브'],
        pirate: [1002780, '타임리스 콘라드 헨켈'],
      }),
    },

    { id: 'mapleCape', name: '메이플 망토', slot: 'cape', source: level(30), items: fixed([1102166, '메이플 망토']) },
    { id: 'mapleShield', name: '메이플 실드', slot: 'shield', source: level(43), items: fixed([1092030, '메이플 실드']) },
    {
      // 3차부터 드는 Lv.64 메이플 무기보다 한 단계 아래다. 썬콜은 메이플 완드가 없어 메이플 라마 스태프를 받는다
      id: 'maple43',
      name: '메이플 무기',
      slot: 'weapon',
      source: level(43),
      items: series(
        [1302030, '메이플 켈트 소드'],
        [1422014, '메이플 빅 모울'],
        [1432012, '메이플 스피어'],
        [1382012, '메이플 라마 스태프'],
        [1452022, '메이플 헌터스'],
        [1462019, '메이플 크로스보우'],
        [1472032, '메이플 칸데오'],
        [1332025, '메이플 바그나'],
        [1482021, '메이플 스톰 핑거'],
        [1492021, '메이플 스톰 피스톨'],
      ),
    },
    { id: 'greenGiles', name: '초록색 자일즈의 망토', slot: 'cape', source: level(100), items: fixed([1102031, '초록색 자일즈의 망토']) },
    {
      id: 'timelessWeapon',
      name: '타임리스 무기',
      slot: 'weapon',
      source: level(120),
      items: series(
        [1302081, '타임리스 엑서큐서너스'],
        [1422037, '타임리스 벨로체'],
        [1432047, '타임리스 알슈피스'],
        [1382057, '타임리스 에아스 핸드'],
        [1372044, '타임리스 엔릴 티어'],
        [1452057, '타임리스 엔가우'],
        [1462050, '타임리스 블랙뷰티'],
        [1472068, '타임리스 람피온'],
        [1332073, '타임리스 페스카즈'],
        [1482023, '타임리스 에퀴녹스'],
        [1492023, '타임리스 블라인드니스'],
      ),
    },
    {
      id: 'reverseHat',
      name: '리버스 모자',
      slot: 'cap',
      source: level(200),
      items: byLine({
        warrior: [1002790, '리버스 휀넬'],
        magician: [1002791, '리버스 코럴'],
        archer: [1002792, '리버스 라피드'],
        thief: [1002793, '리버스 차이브'],
        pirate: [1002794, '리버스 콘라드 헨켈'],
      }),
    },

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
    { id: 'roseEarrings', name: '장미꽃 귀고리', slot: 'earrings', source: shop(12_000), items: fixed([1032017, '장미꽃 귀고리']) },
    {
      id: 'adventurerCape',
      name: '모험가의 망토',
      slot: 'cape',
      source: shop(12_000),
      items: fixed([1102002, '빨간색 모험가의 망토'], [1102004, '검은색 모험가의 망토']),
    },
    { id: 'mapleUmbrella', name: '메이플 우산', slot: 'weapon', source: shop(25_000), items: fixed([1302058, '메이플 우산']) },
    { id: 'fryingPan', name: '프라이팬', slot: 'weapon', source: shop(25_000), items: fixed([1322027, '프라이팬']) },
    { id: 'woodenMallet', name: '나무 망치', slot: 'weapon', source: shop(25_000), items: fixed([1422000, '나무 망치']) },
  ];
}
