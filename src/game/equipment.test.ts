import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from './appearance';
import { BOSSES, ZAKUM_ID } from './bosses';
import { composeLook } from './cashShop';
import { type Character, characterJob, createCharacter } from './characters';
import {
  DROP_PITY,
  EQUIP_ENTRIES,
  EQUIP_SHOP_ITEMS,
  awardBossDrops,
  buyEquipItem,
  canWear,
  collectionProgress,
  entryItems,
  equipGear,
  equipItemName,
  equipSlotOf,
  grantLevelGifts,
  hiddenByCash,
  howToGet,
  rollBossDrops,
  wearEquipment,
  wieldableTypes,
} from './equipment';
import { JOB_BRANCHES, type JobBranchId, describeJob } from './jobs';
import { totalXpForLevel } from './progression';

const PINK_BEAN = 8820001;
const PINK_BEAN_HAT = 1002971;
const PINK_BEAN_SUIT = 1052202;
const CHAOS_PINK_BEAN_HAT = 1003621;
const ZAKUM_HELMET = 1002357;
const CHAOS_ZAKUM_HELMET = 1003112;
const ZAKUM_BRANCH = 1372049;
const GENESIS_SABER = 1302355;
const GENESIS_STAFF = 1382274;
const WORK_GLOVES = 1082002;
const FRYING_PAN = 1322027;
const SKULL_SHIELD = 1092004;
const CASH_HAT = 1000000;
const CASH_WEAPON = 1703482;

const never = () => 0.99;
const always = () => 0;

const character = (branch: JobBranchId | null, level: number, change: Partial<Character> = {}): Character => ({
  ...createCharacter('a', '테스트', DEFAULT_APPEARANCE),
  jobLine: branch ? JOB_BRANCHES[branch].line : null,
  jobBranch: branch,
  activeSeconds: totalXpForLevel(level) / 2 + 1,
  ...change,
});

describe('컬렉션 목록', () => {
  it('보스 드롭·레벨 선물·장비 상점 50칸이고 눈장식 마크는 없다', () => {
    expect(EQUIP_ENTRIES).toHaveLength(50);
    const ids = EQUIP_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(EQUIP_ENTRIES.filter((entry) => entry.source.kind === 'shop')).toHaveLength(13);
    expect(EQUIP_ENTRIES.some((entry) => entry.slot === 'eyeAccessory' && entry.source.kind === 'boss')).toBe(false);
  });

  it('보스 드롭은 지금 보스 목록에 있는 보스이고 자쿰도 떨어뜨린다', () => {
    const bossIds = new Set(BOSSES.map((boss) => boss.id));
    EQUIP_ENTRIES.forEach((entry) => {
      if (entry.source.kind === 'boss') expect(bossIds.has(entry.source.bossId)).toBe(true);
    });
    const zakum = EQUIP_ENTRIES.filter((entry) => entry.source.kind === 'boss' && entry.source.bossId === ZAKUM_ID);
    expect(zakum.map((entry) => entry.name)).toEqual(['자쿰의 투구', '자쿰의 나뭇가지', '카오스 자쿰의 투구', '자쿰의 포이즈닉 무기']);
  });

  it('칸의 자리와 아이템 부위가 맞다', () => {
    EQUIP_ENTRIES.forEach((entry) => {
      const items = entry.items.kind === 'fixed' ? entry.items.ids : Object.values(entry.items.kind === 'line' ? entry.items.byLine : entry.items.byType);
      items.forEach((id) => expect(equipSlotOf(id)).toBe(entry.slot));
    });
  });

  it('상점은 세 가지 값이다', () => {
    expect([...new Set(EQUIP_SHOP_ITEMS.map((item) => item.price))].sort((a, b) => a - b)).toEqual([5_000, 12_000, 25_000]);
    expect(equipItemName(WORK_GLOVES)).toBe('노가다 목장갑');
  });
});

describe('무기·방패를 들 수 있는 갈래', () => {
  it('제 무기 종류만 든다. 마법사는 스태프·완드를 서로 든다', () => {
    expect(wieldableTypes('paladin')).toEqual([42]);
    expect(wieldableTypes('darkKnight')).toEqual([43]);
    expect(wieldableTypes('bowmaster')).toEqual([45]);
    expect(wieldableTypes('iceLightning').sort()).toEqual([30, 32, 37, 38]);
    expect(canWear('firePoison', ZAKUM_BRANCH)).toBe(true);
    expect(canWear('hero', ZAKUM_BRANCH)).toBe(false);
    expect(canWear('hero', GENESIS_SABER)).toBe(true);
    expect(canWear('paladin', GENESIS_SABER)).toBe(false);
  });

  it('방패·한손 신기 무기는 한손 갈래(히어로·마법사·섀도어)만 든다', () => {
    (['hero', 'firePoison', 'iceLightning', 'bishop', 'shadower'] as const).forEach((branch) => {
      expect(canWear(branch, SKULL_SHIELD)).toBe(true);
      expect(canWear(branch, FRYING_PAN)).toBe(true);
    });
    (['paladin', 'darkKnight', 'bowmaster', 'marksman', 'nightLord', 'viper', 'captain'] as const).forEach((branch) => {
      expect(canWear(branch, SKULL_SHIELD)).toBe(false);
      expect(canWear(branch, FRYING_PAN)).toBe(false);
    });
  });

  it('갈래를 고르기 전에는 무기·방패를 못 든다. 다른 자리는 누구나 입는다', () => {
    expect(canWear(null, GENESIS_SABER)).toBe(false);
    expect(canWear('warrior', SKULL_SHIELD)).toBe(false);
    expect(canWear(null, ZAKUM_HELMET)).toBe(true);
  });

  it('시리즈 무기는 갈래 무기 종류 하나로 풀린다', () => {
    const genesis = EQUIP_ENTRIES.find((entry) => entry.id === 'genesis')!;
    expect(entryItems(genesis, 'hero')).toEqual([GENESIS_SABER]);
    expect(entryItems(genesis, 'bishop')).toEqual([GENESIS_STAFF]);
    expect(entryItems(genesis, 'iceLightning')).toEqual([1372237]);
    expect(entryItems(genesis, 'warrior')).toEqual([]);
  });

  it('메이플 무기 선물은 기본 무기와 같으면 다른 것으로 바꾼다. 썬콜은 메이플 위덤 스태프다', () => {
    const maple = EQUIP_ENTRIES.find((entry) => entry.id === 'maple64')!;
    (Object.keys(JOB_BRANCHES) as JobBranchId[]).forEach((branch) => {
      const [item] = entryItems(maple, branch);
      expect(item).not.toBe(JOB_BRANCHES[branch].weapons[1]);
      expect(canWear(branch, item)).toBe(true);
    });
    expect(entryItems(maple, 'iceLightning')).toEqual([1382039]);
  });
});

describe('보스 드롭', () => {
  it('등급 확률보다 작게 굴리면 떨어진다. 레어 20% · 매우 레어 5%', () => {
    const rare = rollBossDrops(PINK_BEAN, 'hero', [], {}, () => 0.1);
    expect(rare.drops).toEqual([PINK_BEAN_HAT, PINK_BEAN_SUIT]);
    expect(rollBossDrops(PINK_BEAN, 'hero', [], {}, () => 0.04).drops).toContain(CHAOS_PINK_BEAN_HAT);
    expect(rollBossDrops(PINK_BEAN, 'hero', [], {}, () => 0.2).drops).toEqual([]);
  });

  it('갈래가 못 드는 무기는 안 떨어진다', () => {
    expect(rollBossDrops(ZAKUM_ID, 'hero', [], {}, always).drops).toEqual([ZAKUM_HELMET, CHAOS_ZAKUM_HELMET, 1302312]);
    expect(rollBossDrops(ZAKUM_ID, 'bishop', [], {}, always).drops).toEqual([ZAKUM_HELMET, ZAKUM_BRANCH, CHAOS_ZAKUM_HELMET, 1382242]);
  });

  it('가진 아이템은 다시 안 나오고 다 모은 등급은 세지 않는다', () => {
    const owned = [PINK_BEAN_HAT, PINK_BEAN_SUIT];
    const result = rollBossDrops(PINK_BEAN, 'hero', owned, {}, always);
    expect(result.drops).toEqual([CHAOS_PINK_BEAN_HAT]);
    expect(result.pity[PINK_BEAN].rare).toBeUndefined();
  });

  it('레어는 10번째, 매우 레어는 30번째 처치에 하나는 준다', () => {
    let pity = {};
    const drops: number[][] = [];
    for (let kill = 1; kill <= 30; kill += 1) {
      const result = rollBossDrops(PINK_BEAN, 'hero', drops.flat(), pity, never);
      pity = result.pity;
      drops.push(result.drops);
    }
    expect(drops.findIndex((each) => each.length > 0) + 1).toBe(DROP_PITY.rare);
    expect(drops[9]).toHaveLength(1);
    expect(drops[19]).toHaveLength(1);
    expect(drops[29]).toEqual([CHAOS_PINK_BEAN_HAT]);
    expect(drops.flat().sort()).toEqual([PINK_BEAN_HAT, CHAOS_PINK_BEAN_HAT, PINK_BEAN_SUIT].sort());
  });

  it('그 등급이 나오면 천장을 다시 센다', () => {
    const pity = { [PINK_BEAN]: { rare: 7, veryRare: 12 } };
    const result = rollBossDrops(PINK_BEAN, 'hero', [], pity, () => 0.1);
    expect(result.pity[PINK_BEAN]).toEqual({ rare: 0, veryRare: 13 });
  });

  it('연습전은 굴리지도 세지도 않는다. 진짜 처치는 컬렉션에 넣는다', () => {
    const fighter = character('hero', 200);
    expect(awardBossDrops(fighter, PINK_BEAN, 'hero', true, always)).toEqual([]);
    expect(fighter.equipPity).toEqual({});
    expect(fighter.equipOwned).toEqual([]);
    expect(awardBossDrops(fighter, PINK_BEAN, 'hero', false, always)).toHaveLength(3);
    expect(fighter.equipOwned).toContain(PINK_BEAN_SUIT);
  });
});

describe('얻는 법', () => {
  it('보스는 이름·확률·천장, 레벨은 레벨, 상점은 값을 적는다', () => {
    const entry = (id: string) => EQUIP_ENTRIES.find((each) => each.id === id)!;
    expect(howToGet(entry('pinkBeanHat'), { [PINK_BEAN]: { rare: 7 } })).toBe('핑크빈 처치 · 낮은 확률 · 7/10');
    expect(howToGet(entry('chaosZakumHelmet'), {})).toBe('자쿰 처치 · 아주 낮은 확률 · 0/30');
    expect(howToGet(entry('highnessHat'), {})).toBe('Lv.150 달성 선물');
    expect(howToGet(entry('workGloves'), {})).toBe('장비 상점 5,000 메소');
  });
});

describe('레벨 선물', () => {
  it('이미 넘은 레벨 선물을 한 번에 받고 다시 부르면 안 준다', () => {
    const hero = character('hero', 156);
    const granted = grantLevelGifts(hero, 156, 'hero');
    expect(granted).toEqual([1102166, 1092030, 1302064, 1102031, 1003797, 1042254, 1062165]);
    expect(hero.equipOwned).toEqual(granted);
    expect(grantLevelGifts(hero, 156, 'hero')).toEqual([]);
  });

  it('두손 갈래는 메이플 실드를 안 받고, 레벨이 오르면 그 선물만 더 받는다', () => {
    const paladin = character('paladin', 64);
    expect(grantLevelGifts(paladin, 64, 'paladin')).toEqual([1102166, 1422029]);
    expect(grantLevelGifts(paladin, 200, 'paladin')).toEqual([1102031, 1003797, 1042254, 1062165, 1422189]);
  });

  it('갈래를 고르기 전이면 무기·방패 선물은 고른 뒤에 받는다', () => {
    const mage = character(null, 70, { jobLine: 'magician' });
    expect(grantLevelGifts(mage, 70, 'magician')).toEqual([1102166]);
    expect(grantLevelGifts(mage, 70, 'iceLightning')).toEqual([1092030, 1382039]);
  });
});

describe('입은 모습', () => {
  const hero = (change: Partial<Character>) => character('hero', 120, change);

  it('컬렉션 장비는 같은 자리 직업 장비를 바꾸고, 무기는 직업 무기를 빼고 바꿔 든다', () => {
    const job = describeJob(120, 'hero', DEFAULT_APPEARANCE).look;
    const look = characterJob(hero({ equipWorn: { cap: ZAKUM_HELMET, weapon: GENESIS_SABER, glove: WORK_GLOVES } }), 120).look;
    expect(look).toContain(ZAKUM_HELMET);
    expect(look).toContain(GENESIS_SABER);
    expect(look).toContain(WORK_GLOVES);
    expect(look).not.toContain(JOB_BRANCHES.hero.weapons[1]);
    expect(look).not.toContain(job.find((id) => Math.floor(id / 10000) === 100));
  });

  it('같은 자리 캐시 아이템이 앞이다. 캐시 무기는 컬렉션 무기 위에 그려진다', () => {
    const look = characterJob(
      hero({ equipWorn: { cap: ZAKUM_HELMET, weapon: GENESIS_SABER }, cashEquipped: { cap: CASH_HAT, weapon: CASH_WEAPON } }),
      120,
    ).look;
    expect(look).toContain(CASH_HAT);
    expect(look).not.toContain(ZAKUM_HELMET);
    expect(look).toContain(GENESIS_SABER);
    expect(look).toContain(CASH_WEAPON);
    expect(hiddenByCash('cap', { cap: CASH_HAT })).toBe(true);
    expect(hiddenByCash('top', { overall: 1050004 })).toBe(true);
    expect(hiddenByCash('earrings', { cap: CASH_HAT })).toBe(false);
  });

  it('컬렉션 한벌옷은 직업 상의·하의를 다 바꾸고, 캐시 상의는 컬렉션 한벌옷을 가린다', () => {
    const job = describeJob(120, 'hero', DEFAULT_APPEARANCE).look;
    const worn = wearEquipment(job, equipGear({}, PINK_BEAN_SUIT), 'hero');
    expect(worn.filter((id) => [104, 105, 106].includes(Math.floor(id / 10000)))).toEqual([PINK_BEAN_SUIT]);
    expect(composeLook(worn, { top: 1040001 })).not.toContain(PINK_BEAN_SUIT);
  });

  it('갈래를 바꿔 못 드는 무기가 되면 그리지 않고 직업 무기를 든다', () => {
    const look = characterJob(character('paladin', 120, { equipWorn: { weapon: GENESIS_SABER, shield: SKULL_SHIELD } }), 120).look;
    expect(look).toContain(JOB_BRANCHES.paladin.weapons[1]);
    expect(look).not.toContain(GENESIS_SABER);
    expect(look).not.toContain(SKULL_SHIELD);
  });

  it('초보자는 무기가 없어 컬렉션 무기를 안 든다', () => {
    const look = wearEquipment(describeJob(5, null, DEFAULT_APPEARANCE).look, { weapon: GENESIS_SABER }, null);
    expect(look).not.toContain(GENESIS_SABER);
  });
});

describe('장비 상점', () => {
  it('메소를 내고 컬렉션에 넣는다. 이미 있거나 모자라면 안 산다', () => {
    const owner = { meso: 9_000, equipOwned: [] as number[] };
    expect(buyEquipItem(owner, WORK_GLOVES, 'hero')).toBe(true);
    expect(owner).toEqual({ meso: 4_000, equipOwned: [WORK_GLOVES] });
    expect(buyEquipItem(owner, WORK_GLOVES, 'hero')).toBe(false);
    expect(buyEquipItem(owner, 1002020, 'hero')).toBe(false);
    expect(owner.meso).toBe(4_000);
  });

  it('상점 물건이 아니거나 못 드는 무기는 안 판다', () => {
    const owner = { meso: 1_000_000, equipOwned: [] as number[] };
    expect(buyEquipItem(owner, ZAKUM_HELMET, 'hero')).toBe(false);
    expect(buyEquipItem(owner, FRYING_PAN, 'paladin')).toBe(false);
    expect(buyEquipItem(owner, 1422000, 'paladin')).toBe(true);
    expect(owner.meso).toBe(975_000);
  });
});

describe('컬렉션 셈', () => {
  it('갈래가 못 모으는 칸은 셈에서 뺀다', () => {
    expect(collectionProgress([], 'hero').total).toBe(45);
    expect(collectionProgress([], 'paladin').total).toBe(41);
    expect(collectionProgress([], 'bishop').total).toBe(48);
    expect(collectionProgress([ZAKUM_HELMET, 1082146], 'hero').owned).toBe(2);
  });
});
