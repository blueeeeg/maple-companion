import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings, pinnedTown } from './settings';
import { ALL_TOWN_IDS, TOWNS, drawFromTownBag, pickNextTown, rewardTown, townEra, townsFor, unlockedTowns } from './towns';

const CLASSIC = townsFor('classic');

describe('시대별 마을 목록', () => {
  it('지금 시대는 예전 목록 그대로고 클래식은 따로다', () => {
    expect(townsFor()).toBe(TOWNS);
    expect(townsFor('current')).toBe(TOWNS);
    expect(CLASSIC).not.toBe(TOWNS);
    TOWNS.forEach((town) => expect(townEra(town)).toBe('current'));
    CLASSIC.forEach((town) => expect(townEra(town)).toBe('classic'));
  });

  it('클래식 마을은 빅뱅 전 마을이고 이름 없는 마을·츄츄·세르니움이 없다', () => {
    const ids = CLASSIC.map((town) => town.id);
    expect(ids).toEqual(
      expect.arrayContaining(['henesys', 'ellinia', 'perion', 'kerning', 'lith-harbor', 'sleepywood', 'orbis', 'el-nath', 'ludibrium', 'aquarium', 'leafre', 'mureung']),
    );
    expect(ids).not.toContain('vanishing-journey');
    expect(ids).not.toContain('chewchew');
    expect(ids).not.toContain('cernium');
  });

  it('마을 id 는 시대 안에서 겹치지 않고, 같은 마을은 두 시대가 같은 id·맵 ID 를 쓴다', () => {
    [TOWNS, CLASSIC].forEach((towns) => expect(new Set(towns.map((town) => town.id)).size).toBe(towns.length));
    CLASSIC.forEach((town) => {
      const same = TOWNS.find((each) => each.id === town.id);
      if (same) expect(town.mapId).toBe(same.mapId);
    });
  });

  it('클래식 마을은 한글 이름·하늘색·몹이 있고 레벨 순서다. 첫 마을은 Lv.1 이다', () => {
    expect(CLASSIC[0].minLevel).toBe(1);
    CLASSIC.forEach((town, index) => {
      expect(town.name).toMatch(/[가-힣]/);
      expect(town.monsters.length).toBeGreaterThan(0);
      town.monsters.forEach((monster) => expect(monster.name).not.toBe(''));
      if (index > 0) expect(town.minLevel).toBeGreaterThanOrEqual(CLASSIC[index - 1].minLevel);
    });
  });

  it('열린 마을은 그 시대 목록에서만 고른다', () => {
    expect(unlockedTowns(1).map((town) => town.id)).toEqual(['henesys']);
    expect(unlockedTowns(1, 'classic').map((town) => town.id)).toEqual(['henesys']);
    expect(unlockedTowns(25, 'classic').map((town) => town.id)).toContain('sleepywood');
    expect(unlockedTowns(25).map((town) => town.id)).not.toContain('sleepywood');
    unlockedTowns(200, 'classic').forEach((town) => expect(townEra(town)).toBe('classic'));
  });

  it('셔플 백·단발 선택도 그 시대 마을을 돌려준다', () => {
    const drawn = drawFromTownBag([], null, 200, () => 0, 'classic')!;
    expect(townEra(drawn.town)).toBe('classic');
    expect(drawn.bag.every((id) => CLASSIC.some((town) => town.id === id))).toBe(true);
    // 지금 시대 가방에 남은 id 가 클래식에 없으면 버리고 새로 채운다
    expect(townEra(drawFromTownBag(['cernium'], null, 300, () => 0, 'classic')!.town)).toBe('classic');
    expect(townEra(pickNextTown(30, 'henesys', () => 0, 'classic'))).toBe('classic');
  });

  it('보상 기준은 시대와 상관없이 지금 시대 마을이고, 클래식은 비운 사이 잡을 몹만 클래식 몹이다', () => {
    [1, 30, 100, 250].forEach((level) => {
      const classic = rewardTown(level, 'classic');
      expect(classic.minLevel).toBe(rewardTown(level).minLevel);
      const shown = unlockedTowns(level, 'classic').slice(-1)[0];
      expect(classic.monsters).toEqual(shown.monsters);
    });
  });
});

describe('머물 마을 설정과 시대', () => {
  it('클래식에만 있는 마을도 저장에서 지우지 않는다', () => {
    expect(ALL_TOWN_IDS.has('sleepywood')).toBe(true);
    expect(normalizeSettings({ pinnedTownId: 'sleepywood' }).pinnedTownId).toBe('sleepywood');
  });

  it('머물 마을은 캐릭터 시대의 마을이다. 그 시대에 없으면 돈다', () => {
    const henesys = { ...DEFAULT_SETTINGS, pinnedTownId: 'henesys' };
    expect(townEra(pinnedTown(henesys, 10)!)).toBe('current');
    expect(townEra(pinnedTown(henesys, 10, 'classic')!)).toBe('classic');
    const sleepywood = { ...DEFAULT_SETTINGS, pinnedTownId: 'sleepywood' };
    expect(pinnedTown(sleepywood, 100)).toBeNull();
    expect(pinnedTown(sleepywood, 100, 'classic')?.id).toBe('sleepywood');
    const cernium = { ...DEFAULT_SETTINGS, pinnedTownId: 'cernium' };
    expect(pinnedTown(cernium, 300, 'classic')).toBeNull();
  });
});
