import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from './appearance';
import { characterJob, createCharacter } from './characters';
import { ADVANCEMENT_LEVELS, JOB_LINES, type JobLineId } from './jobs';
import {
  SKILL_TIERS,
  autoHuntSkill,
  canCast,
  iconPrefetchOrder,
  skillDataPrefetchOrder,
  skillIconPath,
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
    expect(findSkill('warrior', 400011001)).toMatchObject({ type: 'attack', noArt: true });
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

describe('스킬창에서 한 번 쓰는 스킬', () => {
  it('배운 액티브 스킬 중 그릴 수 있는 것만 쓴다', () => {
    expect(canCast('magician', 4, 2121004)).toBe(true); // 인피니티
    expect(canCast('magician', 4, 2101001)).toBe(true); // 메디테이션
    expect(canCast('magician', 1, 2121004)).toBe(false); // 아직 못 배움
    expect(canCast('magician', 4, 2121006)).toBe(false); // 공격 스킬은 사냥 스킬로 고른다
    expect(canCast('magician', 4, 2100007)).toBe(false); // 하이 위즈덤은 패시브
    expect(canCast(null, 0, 1001)).toBe(false); // 초보자 스킬은 데이터를 못 받는다
  });

  it('패시브는 쓸 수 없고 표시만 한다', () => {
    expect(findSkill('magician', 2100007)?.type).toBe('passive');
    expect(findSkill('magician', 2121004)?.type).toBe('active');
  });

  it('차수마다 공격·액티브·패시브가 섞여 있고 모든 직업에 쓸 수 있는 액티브가 있다', () => {
    LINES.forEach((line) => {
      const learned = learnedSkills(line, 6);
      expect(learned.some((entry) => entry.type === 'active' && !entry.noArt)).toBe(true);
      expect(learned.some((entry) => entry.type === 'passive')).toBe(true);
    });
  });
});

describe('스킬 아이콘', () => {
  it('기본 자리는 _Canvas 의 같은 스킬이고, 다른 그림을 가리키는 것은 미리 읽은 링크다', () => {
    expect(skillIconPath(findSkill('magician', 2121006)!)).toBe('Skill/_Canvas/212.img/skill/2121006/icon');
    expect(skillIconPath(findSkill(null, 1000)!)).toBe('Skill/_Canvas/000.img/skill/0001000/icon');
    expect(skillIconPath(findSkill('pirate', 5121016)!)).toBe('Skill/_Canvas/40000.img/skill/400004144/icon');
  });

  it('미리 받기는 지금 차수 탭부터 이 직업 길의 모든 탭을 한 번씩 받는다', () => {
    const order = iconPrefetchOrder('magician', 4);
    expect(order.slice(0, tierSkills('magician', 4).length)).toEqual(tierSkills('magician', 4));
    expect(order).toHaveLength(SKILL_TIERS.reduce<number>((sum, tier) => sum + tierSkills('magician', tier).length, 0));
    expect(iconPrefetchOrder(null, 0)).toEqual(tierSkills(null, 0));
  });
});

describe('스킬 데이터 미리 받기', () => {
  it('지금 차수 탭의 쓸 수 있는 스킬과 사냥 스킬을 작은 것부터, 제한보다 큰 것은 빼고', () => {
    const order = skillDataPrefetchOrder('magician', 4, 2001008, 5000);
    const sizes = order.map((id) => findSkill('magician', id)!.kb!);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(sizes.every((kb) => kb <= 5000)).toBe(true);
    expect(order).toContain(2121004); // 인피니티
    expect(order).toContain(2001008); // 고른 사냥 스킬(1차)
    expect(order).not.toContain(2101001); // 2차 메디테이션은 지금 탭이 아니다
    expect(order).not.toContain(2100007); // 패시브
  });

  it('쓸 수 있거나 사냥에 고를 수 있는 스킬은 모두 크기를 안다', () => {
    LINES.forEach((line) =>
      learnedSkills(line, 6)
        .filter((entry) => !entry.noArt && entry.type !== 'passive')
        .forEach((entry) => expect(entry.kb).toBeGreaterThan(0)),
    );
  });
});
