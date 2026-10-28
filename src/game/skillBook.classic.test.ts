import { describe, expect, it } from 'vitest';
import { trimSkillInfo, skillStoreId } from '../maple/skillStore';
import type { SkillInfo } from '../maple/api';
import { DEFAULT_APPEARANCE } from './appearance';
import { characterJob, createCharacter } from './characters';
import { JOB_BRANCHES, type JobBranchId, jobBranches, jobLines } from './jobs';
import { totalXpForLevel } from './progression';
import {
  CLASSIC_SKILL_TIERS,
  autoHuntSkill,
  findSkill,
  huntSkill,
  huntSkillChoices,
  iconPrefetchOrder,
  learnedSkills,
  skillDataPrefetchOrder,
  skillIconPath,
  skillTiers,
  tierSkills,
} from './skillBook';

const BRANCHES = Object.keys(JOB_BRANCHES) as JobBranchId[];

describe('클래식 스킬북', () => {
  it('초보자부터 4차까지 탭이 있고 5·6차는 없다', () => {
    expect(skillTiers('classic')).toBe(CLASSIC_SKILL_TIERS);
    expect(tierSkills('hero', 5, 'classic')).toEqual([]);
    expect(tierSkills('hero', 6, 'classic')).toEqual([]);
    expect(tierSkills(null, 0, 'classic').map(({ name }) => name)).toEqual(['달팽이 세마리', '회복', '민첩한 몸놀림']);
  });

  it('12갈래가 2·3·4차 스킬을 모두 가진다', () => {
    BRANCHES.forEach((id) => [2, 3, 4].forEach((tier) => expect(tierSkills(id, tier, 'classic').length).toBeGreaterThan(4)));
  });

  it('빅뱅 전 스킬 이름이다. 뜻이 바뀐 ID 는 그때 이름을 쓴다', () => {
    expect(findSkill('hero', 1121008, 'classic')?.name).toBe('브랜디쉬');
    expect(findSkill('hero', 1121008)?.name).toBe('레이징 블로우');
    expect(findSkill('darkKnight', 1311001, 'classic')?.name).toBe('스피어 크러셔');
    expect(findSkill('firePoison', 2121003, 'classic')?.name).toBe('파이어 데몬');
    const names = BRANCHES.flatMap((id) => learnedSkills(id, 4, 'classic')).map(({ name }) => name);
    expect(names.filter((name) => /[A-Za-z]{3}/.test(name.replace('MP', '').replace('HP', '')))).toEqual([]);
  });

  it('자동 스킬은 그 길의 클래식 스킬북에 있다', () => {
    BRANCHES.forEach((id) => {
      const line = jobBranches('classic')[id].line;
      expect(findSkill(line, jobLines('classic')[line].skill, 'classic')).not.toBeNull();
      [2, 3, 4].forEach((tier) => {
        const auto = autoHuntSkill(id, tier, 'classic')!;
        const entry = findSkill(id, auto, 'classic');
        expect(entry?.type).toBe('attack');
        expect(learnedSkills(id, tier, 'classic')).toContain(entry);
      });
    });
  });

  it('사냥 스킬은 그림이 있는 공격 스킬에서 고르고, 클래식 스킬북에 없는 스킬을 골라 뒀으면 자동이다', () => {
    const choices = huntSkillChoices('hero', 4, 'classic').map(({ id }) => id);
    expect(choices).toEqual(expect.arrayContaining([1001005, 1111008, 1121008, 1121006]));
    expect(choices).not.toContain(1111003);
    expect(huntSkill('hero', 4, 1121006, 'classic')).toBe(1121006);
    // 1단계 때 고른 지금 시대 스킬
    expect(huntSkill('hero', 4, 1121015, 'classic')).toBe(1121008);
  });

  it('클래식 캐릭터는 클래식 자동 스킬로 싸운다', () => {
    const character = { ...createCharacter('a', '옛용사', DEFAULT_APPEARANCE, 'classic'), jobLine: 'warrior' as const, jobBranch: 'darkKnight' as const };
    character.activeSeconds = totalXpForLevel(75);
    expect(characterJob(character, 75)).toMatchObject({ tier: 3, skillId: 1311001, title: '드래곤나이트 · 3차' });
  });

  it('아이콘은 v83 Skill.wz 의 원래 자리에서 받는다', () => {
    const brandish = findSkill('hero', 1121008, 'classic')!;
    expect(skillIconPath(brandish, 'classic')).toBe('Skill/112.img/skill/1121008/icon');
    expect(skillIconPath(findSkill('hero', 1121008)!)).toBe('Skill/_Canvas/112.img/skill/1121008/icon');
    expect(iconPrefetchOrder('hero', 4, 'classic').every((entry) => CLASSIC_SKILL_TIERS.some((tier) => tierSkills('hero', tier, 'classic').includes(entry)))).toBe(true);
  });

  it('미리 받을 스킬 데이터는 그 차수 클래식 스킬이다', () => {
    const order = skillDataPrefetchOrder('hero', 4, null, 5000, 'classic');
    expect(order).toContain(1121008);
    expect(order.every((id) => findSkill('hero', id, 'classic'))).toBe(true);
  });
});

describe('클래식 스킬 데이터', () => {
  it('v83 은 레벨마다 값이 있어 마지막 레벨의 사거리·타수·대상 수를 쓴다', () => {
    const raw = {
      description: { name: 'Brandish' },
      levelProperties: [
        { lt: 'Point [ X=-100, Y=-50 ]', attackCount: '1', mobCount: '1' },
        { lt: 'Point [ X=-150, Y=-110 ]', attackCount: '2', mobCount: '3', damage: '175' },
      ],
      effect: [],
    } as unknown as SkillInfo;
    expect(trimSkillInfo(raw).properties).toEqual({ lt: 'Point [ X=-150, Y=-110 ]', attackCount: '2', mobCount: '3' });
  });

  it('기기에 남길 때 시대마다 칸을 나눈다. 지금 시대 칸 이름은 예전 그대로다', () => {
    expect(skillStoreId(1121008)).toBe('1121008');
    expect(skillStoreId(1121008, 'classic')).toBe('GMS-83:1121008');
  });
});
