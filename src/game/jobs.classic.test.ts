import { describe, expect, it } from 'vitest';
import { CLASSIC_ITEM_IDS } from '../maple/classicItems';
import { DEFAULT_APPEARANCE, defaultAppearance } from './appearance';
import { characterLevel, createCharacter, summarizeCharacter } from './characters';
import {
  ADVANCEMENT_LEVELS,
  CLASSIC_ADVANCEMENT_LEVELS,
  JOB_BRANCHES,
  type JobBranchId,
  advancementLevels,
  advancementTier,
  describeJob,
  jobBranches,
  jobLines,
  pathTier,
  tierName,
} from './jobs';
import { CLASSIC_MAX_LEVEL, MAX_LEVEL, levelInfo, maxLevel, totalXpForLevel } from './progression';

const BRANCH_IDS = Object.keys(JOB_BRANCHES) as JobBranchId[];
const weaponOf = (look: number[]) => look[look.length - 1];

describe('클래식 전직', () => {
  it('빅뱅 전처럼 Lv.10·30·70·120 에 4차까지 전직한다', () => {
    expect(advancementLevels('classic')).toEqual([10, 30, 70, 120]);
    expect(CLASSIC_ADVANCEMENT_LEVELS.map((level) => advancementTier(level, 'classic'))).toEqual([1, 2, 3, 4]);
    expect(advancementTier(69, 'classic')).toBe(2);
    expect(advancementTier(119, 'classic')).toBe(3);
    expect(advancementTier(200, 'classic')).toBe(4);
    expect(pathTier(200, 'hero', 'classic')).toBe(4);
  });

  it('지금 시대 전직 레벨은 그대로다', () => {
    expect(advancementLevels()).toBe(ADVANCEMENT_LEVELS);
    expect(advancementTier(65)).toBe(3);
    expect(advancementTier(65, 'classic')).toBe(2);
    expect(pathTier(260, 'hero')).toBe(6);
  });

  it('클래식 최고 레벨은 200 이고 경험치 곡선은 같다', () => {
    expect(maxLevel('classic')).toBe(CLASSIC_MAX_LEVEL);
    expect(maxLevel('current')).toBe(MAX_LEVEL);
    expect(levelInfo(totalXpForLevel(250), maxLevel('classic'))).toMatchObject({ level: 200, ratio: 1, xpForLevel: 0 });
    expect(levelInfo(totalXpForLevel(150), maxLevel('classic'))).toEqual(levelInfo(totalXpForLevel(150)));
    expect(levelInfo(totalXpForLevel(250)).level).toBe(250);
  });

  it('클래식 캐릭터는 Lv.200 에서 멈추고 4차 이름이다', () => {
    const classic = { ...createCharacter('a', '옛용사', DEFAULT_APPEARANCE, 'classic'), jobLine: 'warrior' as const, jobBranch: 'hero' as const };
    classic.activeSeconds = totalXpForLevel(280);
    expect(characterLevel(classic).level).toBe(200);
    expect(summarizeCharacter(classic).jobTitle).toBe('히어로 · 4차');
    const current = { ...classic, era: 'current' as const };
    expect(characterLevel(current).level).toBe(280);
    expect(summarizeCharacter(current).jobTitle).toBe('히어로 · 6차');
  });
});

describe('클래식 갈래', () => {
  it('지금과 같은 12갈래이고 3차 스피어맨만 그 시대 이름 드래곤나이트다', () => {
    const routes = (era: 'current' | 'classic') =>
      Object.fromEntries(BRANCH_IDS.map((id) => [id, jobBranches(era)[id].names.join('→')]));
    const classic = routes('classic');
    const current = routes('current');
    expect(classic.darkKnight).toBe('스피어맨→드래곤나이트→다크나이트');
    expect(current.darkKnight).toBe('스피어맨→버서커→다크나이트');
    BRANCH_IDS.filter((id) => id !== 'darkKnight').forEach((id) => expect(classic[id]).toBe(current[id]));
    expect(tierName('darkKnight', 3, 'classic')).toBe('드래곤나이트');
    expect(tierName('darkKnight', 3)).toBe('버서커');
  });

  it('갈래 ID·계열·직업 번호·동작은 시대와 상관없이 같다', () => {
    BRANCH_IDS.forEach((id) => {
      const [classic, current] = [jobBranches('classic')[id], jobBranches('current')[id]];
      expect([classic.line, classic.jobIds, classic.attackAction, classic.standAction, classic.walkAction]).toEqual([
        current.line,
        current.jobIds,
        current.attackAction,
        current.standAction,
        current.walkAction,
      ]);
    });
    expect(Object.keys(jobLines('classic'))).toEqual(Object.keys(jobLines('current')));
  });

  it('차수마다 무기가 바뀐다. 3차는 Lv.64 메이플 무기, 4차는 드래곤 무기다', () => {
    const at = (level: number) => weaponOf(describeJob(level, 'hero', DEFAULT_APPEARANCE, 'classic').look);
    expect([at(30), at(70), at(120), at(200)]).toEqual([1302000, 1302064, 1302059, 1302059]);
    expect(describeJob(120, 'darkKnight', DEFAULT_APPEARANCE, 'classic')).toMatchObject({
      title: '다크나이트 · 4차',
      skillId: 1321003,
      standAction: 'stand2',
    });
    expect(describeJob(120, 'hero', DEFAULT_APPEARANCE, 'classic').skillId).toBe(1121008);
  });

  it('클래식 직업 장비는 모두 v83 에 있어 v83 그림으로 그린다', () => {
    const items = new Set<number>();
    BRANCH_IDS.forEach((id) =>
      [10, 30, 70, 120].forEach((level) =>
        (['male', 'female'] as const).forEach((gender) =>
          describeJob(level, level < 30 ? jobBranches('classic')[id].line : id, defaultAppearance(gender), 'classic').look.forEach(
            (item) => item >= 1000000 && items.add(item),
          ),
        ),
      ),
    );
    expect([...items].filter((item) => !CLASSIC_ITEM_IDS.has(item))).toEqual([]);
  });

  it('여자 캐릭터는 v83 에 있는 여자 옷을 입는다', () => {
    const female = defaultAppearance('female');
    expect(describeJob(10, 'thief', female, 'classic').look).toContain(1061008);
    expect(describeJob(10, 'thief', female).look).toContain(1061160);
    expect(describeJob(30, 'bowmaster', female, 'classic').look).toEqual(expect.arrayContaining([1041055, 1061051]));
  });

  it('지금 시대 장비·스킬은 그대로다', () => {
    expect(describeJob(65, 'hero', DEFAULT_APPEARANCE)).toMatchObject({ title: '크루세이더 · 3차', skillId: 1111010 });
    expect(weaponOf(describeJob(265, 'hero', DEFAULT_APPEARANCE).look)).toBe(1302020);
  });
});
