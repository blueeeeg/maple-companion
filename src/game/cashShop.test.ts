import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, baseLook, defaultAppearance } from './appearance';
import { BOSS_EVERY_ENCOUNTERS, BOSS_MESO_MULTIPLIER, pickBoss } from './bosses';
import {
  CASH_CATEGORIES,
  buyCashItem,
  cashPrice,
  cashSlotOf,
  cashWeaponFits,
  composeLook,
  equipCash,
  fitsGender,
  neighborPages,
  normalizeCashData,
  toCashItems,
  unequipCash,
} from './cashShop';
import { characterJob, createCharacter, summarizeCharacter } from './characters';
import { ENCOUNTER_EVERY_ACTIVE_SECONDS, KILL_XP, averageMesoDrop, mesoDrop } from './encounters';
import { describeJob } from './jobs';
import { totalXpForLevel } from './progression';
import { unlockedTowns } from './towns';
import { parseRoster } from './save';

// 전사 2차: 흑룡포(한벌옷 1050011)·모자 1002023·신발 1072039·검 1302000
const warrior = describeJob(30, 'warrior', DEFAULT_APPEARANCE).look;
const beginner = describeJob(1, null, DEFAULT_APPEARANCE).look;
const CASH_HAT = 1000000;
const CASH_OVERALL = 1050004;
const CASH_TOP = 1040001;
const CASH_BOTTOM = 1060001;
const CASH_WEAPON = 1703482;

describe('캐시 아이템 자리', () => {
  it('ID 앞자리로 부위를 정한다', () => {
    expect(cashSlotOf(1000000)).toBe('cap');
    expect(cashSlotOf(1012000)).toBe('faceAccessory');
    expect(cashSlotOf(1022000)).toBe('eyeAccessory');
    expect(cashSlotOf(1042000)).toBe('top');
    expect(cashSlotOf(1052000)).toBe('overall');
    expect(cashSlotOf(1062000)).toBe('bottom');
    expect(cashSlotOf(1072000)).toBe('shoes');
    expect(cashSlotOf(1082000)).toBe('glove');
    expect(cashSlotOf(1102000)).toBe('cape');
    expect(cashSlotOf(1702000)).toBe('weapon');
    expect(cashSlotOf(1302000)).toBe('weapon');
    expect(cashSlotOf(30000)).toBeNull();
    expect(cashSlotOf(2000)).toBeNull();
  });

  it('진짜 무기는 팔지 않는다', () => {
    expect(cashPrice(1302000)).toBeNull();
    expect(cashPrice(1702000)).toBe(CASH_CATEGORIES.find((category) => category.slot === 'weapon')!.price);
  });
});

describe('겉모습 합치기', () => {
  it('캐시 아이템이 없으면 직업 장비 그대로다', () => {
    expect(composeLook(warrior, {})).toEqual(warrior);
  });

  it('같은 자리의 장비를 캐시 아이템으로 바꾼다', () => {
    const look = composeLook(warrior, { cap: CASH_HAT });
    expect(look).toContain(CASH_HAT);
    expect(look).not.toContain(1002023);
    expect(look).toContain(1050011);
  });

  it('캐시 한벌옷은 직업 상의·하의를 가린다', () => {
    const look = composeLook(beginner, { overall: CASH_OVERALL });
    expect(look).toContain(CASH_OVERALL);
    expect(look).not.toContain(1040002);
    expect(look).not.toContain(1060002);
  });

  it('캐시 상의·하의는 직업 한벌옷을 벗긴다', () => {
    const top = composeLook(warrior, { top: CASH_TOP });
    expect(top).toContain(CASH_TOP);
    expect(top).not.toContain(1050011);
    const bottom = composeLook(warrior, { bottom: CASH_BOTTOM });
    expect(bottom).toContain(CASH_BOTTOM);
    expect(bottom).not.toContain(1050011);
  });

  it('캐시 무기는 진짜 무기 위에 덧입고, 무기가 없으면 보이지 않는다', () => {
    const look = composeLook(warrior, { weapon: CASH_WEAPON });
    expect(look).toContain(1302000);
    expect(look).toContain(CASH_WEAPON);
    expect(composeLook(beginner, { weapon: CASH_WEAPON })).toEqual(beginner);
  });

  it('몸·얼굴·헤어는 그대로 둔다', () => {
    const look = composeLook(warrior, { cap: CASH_HAT, overall: CASH_OVERALL, shoes: 1072000 });
    baseLook(DEFAULT_APPEARANCE).forEach((itemId) => expect(look).toContain(itemId));
  });

  it('맵·캐릭터 선택 화면이 같은 합친 모습을 쓴다', () => {
    const character = { ...createCharacter('a', '하나', DEFAULT_APPEARANCE), cashEquipped: { cap: CASH_HAT } };
    expect(characterJob(character, 1).look).toContain(CASH_HAT);
    expect(summarizeCharacter(character).look).toEqual(characterJob(character, 1).look);
  });
});

describe('입고 벗기', () => {
  it('한벌옷을 입으면 캐시 상의·하의를 벗고, 상의를 입으면 한벌옷을 벗는다', () => {
    const separates = equipCash(equipCash({}, CASH_TOP), CASH_BOTTOM);
    expect(separates).toEqual({ top: CASH_TOP, bottom: CASH_BOTTOM });
    const overall = equipCash(separates, CASH_OVERALL);
    expect(overall).toEqual({ overall: CASH_OVERALL });
    expect(equipCash(overall, CASH_TOP)).toEqual({ top: CASH_TOP });
  });

  it('같은 자리는 새 아이템으로 바뀌고, 벗으면 자리가 빈다', () => {
    const equipped = equipCash({ cap: CASH_HAT }, 1000001);
    expect(equipped).toEqual({ cap: 1000001 });
    expect(unequipCash(equipped, 'cap')).toEqual({});
  });
});

describe('사기', () => {
  it('메소를 내고 옷장에 넣는다', () => {
    const owner = { meso: 30_000, wardrobe: [] as number[] };
    expect(buyCashItem(owner, CASH_HAT)).toBe(true);
    expect(owner).toEqual({ meso: 30_000 - cashPrice(CASH_HAT)!, wardrobe: [CASH_HAT] });
  });

  it('메소가 모자라거나 이미 있으면 사지 않는다', () => {
    const poor = { meso: 10, wardrobe: [] as number[] };
    expect(buyCashItem(poor, CASH_HAT)).toBe(false);
    expect(poor).toEqual({ meso: 10, wardrobe: [] });
    const owned = { meso: 1_000_000, wardrobe: [CASH_HAT] };
    expect(buyCashItem(owned, CASH_HAT)).toBe(false);
    expect(owned.meso).toBe(1_000_000);
  });
});

describe('목록 거르기', () => {
  it('이름 없는 아이템과 다른 부위는 뺀다', () => {
    const items = toCashItems(
      [
        { id: 1000000, name: '파란색 털모자', isCash: true, requiredGender: 0 },
        { id: 1002320, name: '', isCash: true, requiredGender: 2 },
        { id: 1002000, name: '갈색 항공 모자', isCash: false, requiredGender: 2 },
        { id: 1040001, name: '상의', isCash: true, requiredGender: 0 },
      ],
      'cap',
    );
    expect(items).toEqual([{ id: 1000000, name: '파란색 털모자', requiredGender: 0 }]);
  });

  it('requiredGender 0 은 남자, 1 은 여자, 2 이상은 공용이다', () => {
    expect(fitsGender(0, 'male')).toBe(true);
    expect(fitsGender(0, 'female')).toBe(false);
    expect(fitsGender(1, 'female')).toBe(true);
    expect(fitsGender(1, 'male')).toBe(false);
    expect(fitsGender(5, 'male')).toBe(true);
    expect(fitsGender(2, 'female')).toBe(true);
  });

  it('캐시 무기는 한손검(30) 그림이 있거나 무기 종류가 맞아야 보인다', () => {
    const archer = describeJob(30, 'archer', DEFAULT_APPEARANCE).look;
    expect(cashWeaponFits(['30', '49'], archer)).toBe(true);
    expect(cashWeaponFits(['33'], archer)).toBe(false);
    expect(cashWeaponFits(['33', '45'], archer)).toBe(true);
    expect(cashWeaponFits(['30'], beginner)).toBe(false);
  });
});

describe('저장', () => {
  it('옷장이 없던 저장은 빈 옷장으로 옮긴다', () => {
    const saved = JSON.stringify({ version: 2, characters: [{ id: 'a', name: '하나', meso: 5 }], selectedId: 'a' });
    const [character] = parseRoster(saved, null, 0).characters;
    expect(character.wardrobe).toEqual([]);
    expect(character.cashEquipped).toEqual({});
    expect(character.meso).toBe(5);
  });

  it('옷장과 착용을 그대로 읽고, 산 적 없거나 자리가 안 맞는 착용은 버린다', () => {
    const saved = JSON.stringify({
      version: 2,
      characters: [
        {
          id: 'a',
          name: '하나',
          wardrobe: [CASH_HAT, CASH_OVERALL, CASH_HAT, 'x'],
          cashEquipped: { cap: CASH_HAT, overall: CASH_OVERALL, shoes: 1072000, top: CASH_HAT },
        },
      ],
      selectedId: 'a',
    });
    const [character] = parseRoster(saved, null, 0).characters;
    expect(character.wardrobe).toEqual([CASH_HAT, CASH_OVERALL]);
    expect(character.cashEquipped).toEqual({ cap: CASH_HAT, overall: CASH_OVERALL });
  });

  it('잘못된 값이면 비운다', () => {
    expect(normalizeCashData({ wardrobe: 'x', cashEquipped: 3 })).toEqual({ wardrobe: [], cashEquipped: {} });
  });

  it('캐릭터마다 옷장이 따로다', () => {
    const female = defaultAppearance('female');
    const a = createCharacter('a', '하나', female);
    const b = createCharacter('b', '둘둘', female);
    a.wardrobe.push(CASH_HAT);
    expect(b.wardrobe).toEqual([]);
  });
});

describe('메소 벌이', () => {
  const HOURS_PER_DAY = 4;
  const killsPerDay = (HOURS_PER_DAY * 3600) / ENCOUNTER_EVERY_ACTIVE_SECONDS;
  /**
   * 마을 이동은 최근에 열린 네 곳을 고루 돈다(pickNextTown). 사냥 BOSS_EVERY_ENCOUNTERS 번 중 한 번은
   * 레벨에 맞는 보스가 있으면 보스로 바뀌고 메소를 BOSS_MESO_MULTIPLIER 배 준다
   */
  const mesoPerDay = (level: number) => {
    const pool = unlockedTowns(level).slice(-4);
    const perKill = pool.reduce((sum, town) => sum + averageMesoDrop(town), 0) / pool.length;
    const bossShare = pickBoss(level) ? 1 / BOSS_EVERY_ENCOUNTERS : 0;
    return Math.round(killsPerDay * perKill * (1 - bossShare + bossShare * BOSS_MESO_MULTIPLIER));
  };
  const price = (slot: string) => CASH_CATEGORIES.find((category) => category.slot === slot)!.price;
  const cheap = CASH_CATEGORIES.filter((category) => category.slot !== 'overall' && category.slot !== 'weapon');
  const averageCheapPrice = cheap.reduce((sum, category) => sum + category.price, 0) / cheap.length;
  const daysToLevel = (level: number) =>
    totalXpForLevel(level) / (1 + KILL_XP / ENCOUNTER_EVERY_ACTIVE_SECONDS) / 3600 / HOURS_PER_DAY;

  it('하루 4시간이면 몬스터 80마리를 잡는다', () => {
    expect(killsPerDay).toBe(80);
  });

  it('한 마리 메소는 평균의 ±1/3 안이다', () => {
    const [town] = unlockedTowns(100).slice(-1);
    expect(mesoDrop(town, () => 0)).toBeGreaterThanOrEqual(Math.floor((averageMesoDrop(town) * 2) / 3));
    expect(mesoDrop(town, () => 0.9999)).toBeLessThanOrEqual(Math.ceil((averageMesoDrop(town) * 4) / 3));
  });

  it('중간 레벨(Lv.60~200)은 싼 부위를 하루 1~2개 산다', () => {
    [60, 100, 150, 200].forEach((level) => {
      const items = mesoPerDay(level) / averageCheapPrice;
      expect(items).toBeGreaterThanOrEqual(1);
      expect(items).toBeLessThanOrEqual(2);
    });
  });

  it('한벌옷·무기는 중간 레벨에서 며칠 모아야 한다', () => {
    [60, 100, 150].forEach((level) => {
      ['overall', 'weapon'].forEach((slot) => {
        const days = price(slot) / mesoPerDay(level);
        expect(days).toBeGreaterThanOrEqual(2);
        expect(days).toBeLessThanOrEqual(5);
      });
    });
  });

  it('레벨별 하루 벌이', () => {
    const table = [10, 30, 60, 100, 150, 200, 260].map((level) => ({
      level,
      day: Math.round(daysToLevel(level) * 10) / 10,
      mesoPerDay: mesoPerDay(level),
      cheapPerDay: Math.round((mesoPerDay(level) / averageCheapPrice) * 10) / 10,
      overallDays: Math.round((price('overall') / mesoPerDay(level)) * 10) / 10,
      weaponDays: Math.round((price('weapon') / mesoPerDay(level)) * 10) / 10,
    }));
    expect(table.map((row) => row.mesoPerDay)).toEqual([...table.map((row) => row.mesoPerDay)].sort((a, b) => a - b));
    console.table(table);
  });
});

describe('페이지 미리 받기', () => {
  it('다음 페이지를 먼저, 그다음 앞 페이지를 받는다', () => {
    expect(neighborPages(3, 10)).toEqual([4, 2]);
  });

  it('첫 페이지와 마지막 페이지는 있는 쪽만, 한 페이지뿐이면 받을 것이 없다', () => {
    expect(neighborPages(0, 10)).toEqual([1]);
    expect(neighborPages(9, 10)).toEqual([8]);
    expect(neighborPages(0, 1)).toEqual([]);
  });
});
