import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from './appearance';
import { characterJob, characterLevel, createCharacter, summarizeCharacter } from './characters';
import { totalXpForLevel } from './progression';
import { normalizeRoster } from './save';

/** 1단계(v0.1.9) 때 저장한 클래식 캐릭터. 그때는 지금 시대 전직·스킬·보스·장비 표를 썼다 */
const phaseOne = (change: Record<string, unknown> = {}) => ({
  ...createCharacter('old', '옛용사', DEFAULT_APPEARANCE, 'classic'),
  jobLine: 'warrior',
  jobBranch: 'darkKnight',
  activeSeconds: totalXpForLevel(105),
  // Lv.105 는 지금 시대 4차(100)라 4차까지 적혀 있다
  advancedAt: { 1: 1000, 2: 2000, 3: 3000, 4: 4000 },
  huntSkillId: 1321012,
  reservedBossId: 8860000,
  equipOwned: [1003112, 1002357],
  equipWorn: { cap: 1003112 },
  ...change,
});

describe('1단계 클래식 캐릭터 옮기기', () => {
  it('같은 이름의 클래식 갈래로 이어지고 차수는 클래식 전직 레벨로 다시 센다', () => {
    const [character] = normalizeRoster({ characters: [phaseOne() as never] }).characters;
    expect(character.jobBranch).toBe('darkKnight');
    const job = characterJob(character, characterLevel(character).level);
    expect(job).toMatchObject({ tier: 3, title: '드래곤나이트 · 3차', skillId: 1311001 });
  });

  it('클래식 차수를 넘는 전직 기록은 지우고, 그 차수가 되면 다시 적는다', () => {
    const [character] = normalizeRoster({ characters: [phaseOne() as never] }).characters;
    expect(character.advancedAt).toEqual({ 1: 1000, 2: 2000, 3: 3000 });
  });

  it('클래식 스킬북에 없는 사냥 스킬은 자동으로 돌리고, 있는 것은 둔다', () => {
    const [changed] = normalizeRoster({ characters: [phaseOne() as never] }).characters;
    expect(changed.huntSkillId).toBeNull();
    const [kept] = normalizeRoster({ characters: [phaseOne({ huntSkillId: 1311006 }) as never] }).characters;
    expect(kept.huntSkillId).toBe(1311006);
  });

  it('지금 시대에만 있는 보스 지정은 지운다', () => {
    const [character] = normalizeRoster({ characters: [phaseOne() as never] }).characters;
    expect(character.reservedBossId).toBeNull();
  });

  it('지금 시대 장비는 가진 채로 두고 클래식 표에 없는 것은 벗는다', () => {
    const [character] = normalizeRoster({ characters: [phaseOne() as never] }).characters;
    expect(character.equipOwned).toEqual([1003112, 1002357]);
    expect(character.equipWorn).toEqual({});
  });

  it('Lv.200 을 넘게 쌓은 경험치는 남기고 레벨만 200 에서 멈춘다', () => {
    const [character] = normalizeRoster({ characters: [phaseOne({ activeSeconds: totalXpForLevel(230) }) as never] }).characters;
    expect(character.activeSeconds).toBe(totalXpForLevel(230));
    expect(summarizeCharacter(character)).toMatchObject({ level: 200, jobTitle: '다크나이트 · 4차' });
    expect(character.advancedAt).toEqual({ 1: 1000, 2: 2000, 3: 3000, 4: 4000 });
  });

  it('지금 시대 캐릭터는 같은 저장이어도 그대로 읽는다', () => {
    const [character] = normalizeRoster({ characters: [phaseOne({ era: 'current' }) as never] }).characters;
    expect(character).toMatchObject({
      huntSkillId: 1321012,
      reservedBossId: 8860000,
      equipWorn: { cap: 1003112 },
      advancedAt: { 1: 1000, 2: 2000, 3: 3000, 4: 4000 },
    });
    expect(characterJob(character, characterLevel(character).level).title).toBe('다크나이트 · 4차');
  });
});
