import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from './appearance';
import { characterJob, createCharacter } from './characters';
import { ADVANCEMENT_LEVELS, JOB_LINES, type JobLineId } from './jobs';
import {
  SKILL_TIERS,
  autoHuntSkill,
  findSkill,
  hasUsableEffect,
  huntSkill,
  huntSkillChoices,
  learnedSkills,
  skillWzPath,
  tierSkills,
} from './skillBook';

const LINES = Object.keys(JOB_LINES) as JobLineId[];

describe('직업 길마다 배운 스킬', () => {
  it('직업을 안 골랐으면 초보자 스킬만 배웠다', () => {
    expect(learnedSkills(null, 0).map(({ name }) => name)).toEqual(['달팽이 세마리', '회복', '민첩한 몸놀림']);
    // 레벨은 넘었어도 직업이 없으면 1차 스킬은 없다
    expect(learnedSkills(null, 3)).toEqual(learnedSkills(null, 0));
  });

  it('지금 차수까지의 탭을 초보자부터 차례로 모은다', () => {
    const second = learnedSkills('magician', 2).map(({ id }) => id);
    expect(second).toEqual([...tierSkills(null, 0), ...tierSkills('magician', 1), ...tierSkills('magician', 2)].map(({ id }) => id));
    expect(second).toContain(2101004);
    expect(second).not.toContain(2111002);
  });

  it('4차 아크메이지(불,독)은 4차 스킬까지 배웠고 5차 V 스킬은 아직이다', () => {
    const ids = learnedSkills('magician', 4).map(({ id }) => id);
    expect(ids).toContain(2121006);
    expect(ids).not.toContain(400021028);
  });

  it('차수마다 탭이 비어 있지 않고, 한 직업 안에 같은 스킬이 두 번 나오지 않는다', () => {
    LINES.forEach((line) => {
      SKILL_TIERS.forEach((tier) => expect(tierSkills(line, tier).length).toBeGreaterThan(0));
      const ids = learnedSkills(line, 6).map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  it('자동 스킬은 그 차수까지 고를 수 있는 공격 스킬 안에 있다', () => {
    LINES.forEach((line) =>
      [1, 2, 3, 4, 5, 6].forEach((tier) => {
        const auto = autoHuntSkill(line, tier);
        expect(huntSkillChoices(line, tier).map(({ id }) => id)).toContain(auto);
      }),
    );
  });

  it('맵에 못 그리는 공격 스킬은 고를 수 있는 목록에서 빠진다', () => {
    const choices = huntSkillChoices('warrior', 6).map(({ id }) => id);
    expect(findSkill('warrior', 400011001)?.attack).toBe('noArt');
    expect(choices).not.toContain(400011001);
    expect(choices).toContain(400011027);
    // 초보자 공격(달팽이 세마리)은 스킬 데이터를 못 받아 초보자는 고를 것이 없다
    expect(huntSkillChoices(null, 0)).toEqual([]);
  });
});

describe('고른 사냥 스킬', () => {
  it('고르지 않았으면 자동 스킬(차수마다 정해 둔 스킬)이다', () => {
    expect(huntSkill('magician', 4, null)).toBe(JOB_LINES.magician.skills[3]);
    expect(huntSkill('archer', 6, null)).toBe(JOB_LINES.archer.skills[3]);
    expect(huntSkill(null, 0, null)).toBeNull();
  });

  it('배운 공격 스킬을 골랐으면 그 스킬이다. 아래 차수 스킬도 고를 수 있다', () => {
    expect(huntSkill('magician', 4, 2121007)).toBe(2121007);
    expect(huntSkill('magician', 4, 2001008)).toBe(2001008);
  });

  it('아직 못 배웠거나 그림이 없거나 공격이 아니거나 모르는 스킬이면 자동으로 돌아간다', () => {
    const auto = JOB_LINES.magician.skills[3];
    expect(huntSkill('magician', 4, 400021028)).toBe(auto);
    expect(huntSkill('magician', 5, 400021001)).toBe(JOB_LINES.magician.skills[3]);
    expect(huntSkill('magician', 4, 2121004)).toBe(auto);
    expect(huntSkill('magician', 4, 1121008)).toBe(auto);
    expect(huntSkill('magician', 4, 123)).toBe(auto);
  });

  it('맵 캐릭터는 고른 스킬로 싸우고, 대신 쓸 자동 스킬도 같이 받는다', () => {
    const character = { ...createCharacter('a', '하나', DEFAULT_APPEARANCE), jobLine: 'magician' as const, huntSkillId: 2121007 };
    const job = characterJob(character, ADVANCEMENT_LEVELS[3]);
    expect(job.skillId).toBe(2121007);
    expect(job.autoSkillId).toBe(JOB_LINES.magician.skills[3]);
    expect(characterJob({ ...character, huntSkillId: null }, ADVANCEMENT_LEVELS[3]).skillId).toBe(JOB_LINES.magician.skills[3]);
  });

  it('이펙트가 한 장 이하면 못 그린다', () => {
    expect(hasUsableEffect([])).toBe(false);
    expect(hasUsableEffect([1])).toBe(false);
    expect(hasUsableEffect([1, 1])).toBe(true);
    expect(hasUsableEffect([16])).toBe(true);
  });
});

describe('스킬 WZ 경로', () => {
  it('직업 번호가 img 이름이고 초보자 스킬은 일곱 자리로 채운다', () => {
    expect(skillWzPath(2121006)).toEqual({ img: '212', node: '2121006' });
    expect(skillWzPath(400021028)).toEqual({ img: '40002', node: '400021028' });
    expect(skillWzPath(500001000)).toEqual({ img: '50000', node: '500001000' });
    expect(skillWzPath(1000)).toEqual({ img: '000', node: '0001000' });
  });
});
