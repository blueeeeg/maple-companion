import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from './appearance';
import { characterJob, createCharacter } from './characters';
import { ADVANCEMENT_LEVELS, JOB_BRANCHES, JOB_LINES, type JobBranchId } from './jobs';
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

const BRANCHES = Object.keys(JOB_BRANCHES) as JobBranchId[];

describe('직업 길마다 배운 스킬', () => {
  it('직업을 안 골랐으면 초보자 스킬만 배웠다', () => {
    expect(learnedSkills(null, 0).map(({ name }) => name)).toEqual(['달팽이 세마리', '회복', '민첩한 몸놀림']);
    // 레벨은 넘었어도 직업이 없으면 1차 스킬은 없다
    expect(learnedSkills(null, 3)).toEqual(learnedSkills(null, 0));
  });

  it('지금 차수까지의 탭을 초보자부터 차례로 모은다', () => {
    const second = learnedSkills('firePoison', 2).map(({ id }) => id);
    expect(second).toEqual([...tierSkills(null, 0), ...tierSkills('magician', 1), ...tierSkills('firePoison', 2)].map(({ id }) => id));
    expect(second).toContain(2101004);
    expect(second).not.toContain(2111002);
  });

  it('4차 아크메이지(불,독)은 4차 스킬까지 배웠고 5차 V 스킬은 아직이다', () => {
    const ids = learnedSkills('firePoison', 4).map(({ id }) => id);
    expect(ids).toContain(2121006);
    expect(ids).not.toContain(400021028);
  });

  it('차수마다 탭이 비어 있지 않고, 한 직업 안에 같은 스킬이 두 번 나오지 않는다', () => {
    BRANCHES.forEach((line) => {
      SKILL_TIERS.forEach((tier) => expect(tierSkills(line, tier).length).toBeGreaterThan(0));
      const ids = learnedSkills(line, 6).map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  it('자동 스킬은 그 차수까지 고를 수 있는 공격 스킬 안에 있다', () => {
    BRANCHES.forEach((line) =>
      [1, 2, 3, 4, 5, 6].forEach((tier) => {
        const auto = autoHuntSkill(line, tier);
        expect(huntSkillChoices(line, tier).map(({ id }) => id)).toContain(auto);
      }),
    );
  });

  it('맵에 못 그리는 공격 스킬은 고를 수 있는 목록에서 빠진다', () => {
    const choices = huntSkillChoices('hero', 6).map(({ id }) => id);
    expect(findSkill('hero', 400011001)).toMatchObject({ type: 'attack', noArt: true });
    expect(choices).not.toContain(400011001);
    expect(choices).toContain(400011027);
    // 초보자 공격(달팽이 세마리)은 스킬 데이터를 못 받아 초보자는 고를 것이 없다
    expect(huntSkillChoices(null, 0)).toEqual([]);
  });
});

describe('고른 사냥 스킬', () => {
  it('고르지 않았으면 자동 스킬(차수마다 정해 둔 스킬)이다', () => {
    expect(huntSkill('firePoison', 4, null)).toBe(JOB_BRANCHES.firePoison.skills[2]);
    expect(huntSkill('bowmaster', 6, null)).toBe(JOB_BRANCHES.bowmaster.skills[2]);
    expect(huntSkill(null, 0, null)).toBeNull();
  });

  it('배운 공격 스킬을 골랐으면 그 스킬이다. 아래 차수 스킬도 고를 수 있다', () => {
    expect(huntSkill('firePoison', 4, 2121007)).toBe(2121007);
    expect(huntSkill('firePoison', 4, 2001008)).toBe(2001008);
  });

  it('아직 못 배웠거나 그림이 없거나 공격이 아니거나 모르는 스킬이면 자동으로 돌아간다', () => {
    const auto = JOB_BRANCHES.firePoison.skills[2];
    expect(huntSkill('firePoison', 4, 400021028)).toBe(auto);
    expect(huntSkill('firePoison', 5, 400021001)).toBe(JOB_BRANCHES.firePoison.skills[2]);
    expect(huntSkill('firePoison', 4, 2121004)).toBe(auto);
    expect(huntSkill('firePoison', 4, 1121008)).toBe(auto);
    expect(huntSkill('firePoison', 4, 123)).toBe(auto);
  });

  it('맵 캐릭터는 고른 스킬로 싸우고, 대신 쓸 자동 스킬도 같이 받는다', () => {
    const character = { ...createCharacter('a', '하나', DEFAULT_APPEARANCE), jobLine: 'magician' as const, jobBranch: 'firePoison' as const, huntSkillId: 2121007 };
    const job = characterJob(character, ADVANCEMENT_LEVELS[3]);
    expect(job.skillId).toBe(2121007);
    expect(job.autoSkillId).toBe(JOB_BRANCHES.firePoison.skills[2]);
    expect(characterJob({ ...character, huntSkillId: null }, ADVANCEMENT_LEVELS[3]).skillId).toBe(JOB_BRANCHES.firePoison.skills[2]);
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
    expect(canCast('firePoison', 4, 2121004)).toBe(true); // 인피니티
    expect(canCast('firePoison', 4, 2101001)).toBe(true); // 메디테이션
    expect(canCast('firePoison', 1, 2121004)).toBe(false); // 아직 못 배움
    expect(canCast('firePoison', 4, 2121006)).toBe(false); // 공격 스킬은 사냥 스킬로 고른다
    expect(canCast('firePoison', 4, 2100007)).toBe(false); // 하이 위즈덤은 패시브
    expect(canCast(null, 0, 1001)).toBe(false); // 초보자 스킬은 데이터를 못 받는다
  });

  it('패시브는 쓸 수 없고 표시만 한다', () => {
    expect(findSkill('firePoison', 2100007)?.type).toBe('passive');
    expect(findSkill('firePoison', 2121004)?.type).toBe('active');
  });

  it('차수마다 공격·액티브·패시브가 섞여 있고 모든 직업에 쓸 수 있는 액티브가 있다', () => {
    BRANCHES.forEach((line) => {
      const learned = learnedSkills(line, 6);
      expect(learned.some((entry) => entry.type === 'active' && !entry.noArt)).toBe(true);
      expect(learned.some((entry) => entry.type === 'passive')).toBe(true);
    });
  });
});

describe('스킬 아이콘', () => {
  it('기본 자리는 _Canvas 의 같은 스킬이고, 다른 그림을 가리키는 것은 미리 읽은 링크다', () => {
    expect(skillIconPath(findSkill('firePoison', 2121006)!)).toBe('Skill/_Canvas/212.img/skill/2121006/icon');
    expect(skillIconPath(findSkill(null, 1000)!)).toBe('Skill/_Canvas/000.img/skill/0001000/icon');
    expect(skillIconPath(findSkill('viper', 5121016)!)).toBe('Skill/_Canvas/40000.img/skill/400004144/icon');
  });

  it('미리 받기는 지금 차수 탭부터 이 직업 길의 모든 탭을 한 번씩 받는다', () => {
    const order = iconPrefetchOrder('firePoison', 4);
    expect(order.slice(0, tierSkills('firePoison', 4).length)).toEqual(tierSkills('firePoison', 4));
    expect(order).toHaveLength(SKILL_TIERS.reduce<number>((sum, tier) => sum + tierSkills('firePoison', tier).length, 0));
    expect(iconPrefetchOrder(null, 0)).toEqual(tierSkills(null, 0));
  });
});

describe('스킬 데이터 미리 받기', () => {
  it('지금 차수 탭의 쓸 수 있는 스킬과 사냥 스킬을 작은 것부터, 제한보다 큰 것은 빼고', () => {
    const order = skillDataPrefetchOrder('firePoison', 4, 2001008, 5000);
    const sizes = order.map((id) => findSkill('firePoison', id)!.kb!);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(sizes.every((kb) => kb <= 5000)).toBe(true);
    expect(order).toContain(2121004); // 인피니티
    expect(order).toContain(2001008); // 고른 사냥 스킬(1차)
    expect(order).not.toContain(2101001); // 2차 메디테이션은 지금 탭이 아니다
    expect(order).not.toContain(2100007); // 패시브
  });

  it('쓸 수 있거나 사냥에 고를 수 있는 스킬은 모두 크기를 안다', () => {
    BRANCHES.forEach((line) =>
      learnedSkills(line, 6)
        .filter((entry) => !entry.noArt && entry.type !== 'passive')
        .forEach((entry) => expect(entry.kb).toBeGreaterThan(0)),
    );
  });
});

describe('갈래마다 스킬북', () => {
  it('1차 탭은 계열이 같이 쓰고, 2~4차는 갈래마다 다르다. 5차는 계열 공용 코어가 겹친다', () => {
    expect(tierSkills('captain', 1)).toBe(tierSkills('viper', 1));
    expect(tierSkills('pirate', 1)).toBe(tierSkills('captain', 1));
    expect(tierSkills('captain', 5).map(({ id }) => id)).toContain(400051000);
    expect(tierSkills('viper', 5).map(({ id }) => id)).toContain(400051000);
    [2, 3, 4].forEach((tier) => {
      const viper = tierSkills('viper', tier).map(({ id }) => id);
      expect(tierSkills('captain', tier).some(({ id }) => viper.includes(id))).toBe(false);
    });
  });

  it('갈래를 안 고른 계열은 1차 탭까지만 있다', () => {
    expect(tierSkills('pirate', 2)).toEqual([]);
    expect(learnedSkills('pirate', 4)).toEqual([...tierSkills(null, 0), ...tierSkills('pirate', 1)]);
    expect(autoHuntSkill('pirate', 4)).toBe(JOB_LINES.pirate.skill);
  });

  it('2~4차 스킬 ID 는 그 갈래의 직업 번호로 시작한다', () => {
    BRANCHES.forEach((id) =>
      JOB_BRANCHES[id].jobIds.forEach((job, index) =>
        tierSkills(id, index + 2).forEach((entry) => expect(Math.floor(entry.id / 10000)).toBe(job)),
      ),
    );
  });

  it('6차는 그 갈래의 HEXA 스킬과 공용 솔 야누스다', () => {
    BRANCHES.forEach((id) => {
      const sixth = tierSkills(id, 6).map((entry) => entry.id);
      expect(sixth).toContain(500001000);
      expect(sixth.filter((skill) => skill !== 500001000).every((skill) => Math.floor(skill / 10000) === JOB_BRANCHES[id].jobIds[2] + 2)).toBe(true);
    });
  });

  it('다른 갈래에서 고른 사냥 스킬은 자동으로 돌아간다', () => {
    const viperSkill = JOB_BRANCHES.viper.skills[2];
    expect(huntSkill('viper', 4, viperSkill)).toBe(viperSkill);
    expect(huntSkill('captain', 4, viperSkill)).toBe(autoHuntSkill('captain', 4));
    // 1차 스킬은 같은 계열이면 어느 갈래든 배운다
    expect(huntSkill('captain', 4, 5001002)).toBe(5001002);
  });

  it('갈래마다 4차 자동 스킬로 총·석궁·지팡이 공격을 쓴다', () => {
    expect(findSkill('captain', autoHuntSkill('captain', 4)!)?.type).toBe('attack');
    expect(findSkill('marksman', autoHuntSkill('marksman', 4)!)?.type).toBe('attack');
    expect(findSkill('bishop', autoHuntSkill('bishop', 4)!)?.type).toBe('attack');
  });
});
