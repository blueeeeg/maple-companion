import { describe, expect, it } from 'vitest';
import { type Appearance, DEFAULT_APPEARANCE, FACES, HAIRS, baseLook, withGender } from './appearance';
import {
  type Character,
  JOB_CHANGE_MESO,
  LEGACY_CHARACTER_NAME,
  activityDelta,
  changeJobBranch,
  characterJob,
  characterXp,
  createCharacter,
  creditActivity,
  emptyRoster,
  jobChangeCheck,
  nameError,
  reachedTier,
  selectedCharacter,
} from './characters';
import { encountersDue } from './encounters';
import { ADVANCEMENT_LEVELS } from './jobs';
import { totalXpForLevel } from './progression';
import { JOB_LINES, describeJob } from './jobs';
import { parseRoster } from './save';

const look: Appearance = { gender: 'male', skin: 2, face: 21001, hair: 31040 };

describe('활동 시간 나누기', () => {
  it('앱을 켠 뒤 첫 값은 기준만 잡는다', () => {
    expect(activityDelta(null, 5000)).toBe(0);
    expect(activityDelta(5000, 5012)).toBe(12);
  });

  it('전역 값이 줄면(활동 기록 초기화) 더하지 않는다', () => {
    expect(activityDelta(5000, 30)).toBe(0);
  });

  it('플레이 중인 캐릭터에만 더한다', () => {
    const roster = emptyRoster();
    roster.characters.push(createCharacter('a', '하나', look), createCharacter('b', '둘둘', look));
    roster.selectedId = 'b';

    let previous: number | null = null;
    [1000, 1010, 1025].forEach((global) => {
      creditActivity(roster, activityDelta(previous, global));
      previous = global;
    });

    expect(roster.characters.map((character) => character.activeSeconds)).toEqual([0, 25]);
  });

  it('고른 캐릭터가 없으면 아무에게도 안 쌓인다', () => {
    const roster = emptyRoster();
    roster.characters.push(createCharacter('a', '하나', look));
    expect(creditActivity(roster, 10)).toBe(false);
    expect(roster.characters[0].activeSeconds).toBe(0);
  });

  it('레벨과 사냥 수는 캐릭터 자신의 활동 시간으로 센다', () => {
    const character = { ...createCharacter('a', '하나', look), activeSeconds: 400, killXp: 60, encountersResolved: 1, huntSeconds: 180 };
    expect(characterXp(character)).toBe(460);
    expect(encountersDue(character, 180)).toBe(1);
  });
});

describe('예전 저장 옮기기', () => {
  const legacy = JSON.stringify({
    version: 1,
    jobLine: 'thief',
    killXp: 600,
    meso: 1234,
    monsterBook: { 달팽이: 3 },
    encountersResolved: 10,
    muted: true,
  });

  it('첫 캐릭터가 진행과 그때까지의 전역 활동 시간을 이어받는다', () => {
    const roster = parseRoster(null, legacy, 7200, 'legacy');
    expect(roster.selectedId).toBe('legacy');
    expect(roster.muted).toBe(true);
    expect(roster.characters).toHaveLength(1);
    expect(roster.characters[0]).toMatchObject({
      id: 'legacy',
      name: LEGACY_CHARACTER_NAME,
      appearance: DEFAULT_APPEARANCE,
      activeSeconds: 7200,
      jobLine: 'thief',
      killXp: 600,
      meso: 1234,
      monsterBook: { 달팽이: 3 },
      encountersResolved: 10,
      // 예전 사냥 10번은 3분 주기였으니 활동 30분을 사냥으로 바꾼 것이고, 보스(20번째)까지 10번 몫이 모였다
      huntSeconds: 1800,
      bossChargeSeconds: 1800,
    });
  });

  it('사냥 진행이 마리 수로만 있는 저장은 3분 주기로 환산한다', () => {
    const old = { ...createCharacter('a', '하나', look), activeSeconds: 1000, encountersResolved: 24 } as Partial<Character>;
    delete old.huntSeconds;
    delete old.huntBonusSeconds;
    delete old.bossChargeSeconds;
    const [character] = parseRoster(JSON.stringify({ version: 2, characters: [old], selectedId: 'a', muted: false }), null, 0).characters;
    expect(character.huntSeconds).toBe(24 * 180);
    expect(character.huntBonusSeconds).toBe(0);
    expect(character.bossChargeSeconds).toBe(4 * 180);
    expect(encountersDue({ ...character, activeSeconds: 25 * 180 + 10 }, 180)).toBe(1);
  });

  it('이미 옮긴 뒤에는 예전 저장을 다시 보지 않는다', () => {
    const migrated = parseRoster(null, legacy, 7200, 'legacy');
    const reloaded = parseRoster(JSON.stringify(migrated), legacy, 99999);
    expect(reloaded).toEqual(migrated);
  });

  it('성별이 생기기 전에 저장한 캐릭터는 고른 외형 그대로 남자가 된다', () => {
    const saved = JSON.stringify({
      version: 2,
      characters: [{ ...createCharacter('old', '예전캐릭', look), appearance: { skin: 2, face: 21001, hair: 31040 } }],
      selectedId: 'old',
      muted: false,
    });
    expect(parseRoster(saved, null, 0).characters[0].appearance).toEqual({ gender: 'male', skin: 2, face: 21001, hair: 31040 });
  });

  it('저장이 아무것도 없으면 빈 목록으로 시작한다', () => {
    const roster = parseRoster(null, null, 500);
    expect(roster.characters).toEqual([]);
    expect(selectedCharacter(roster)).toBeNull();
  });
});

describe('이름', () => {
  it('2~12자만 받는다', () => {
    expect(nameError('가', [])).not.toBeNull();
    expect(nameError('가나', [])).toBeNull();
    expect(nameError('가'.repeat(12), [])).toBeNull();
    expect(nameError('가'.repeat(13), [])).not.toBeNull();
  });

  it('앞뒤 공백은 빼고 세고, 공백·기호는 못 쓴다', () => {
    expect(nameError('  가  ', [])).not.toBeNull();
    expect(nameError('메이플 용사', [])).not.toBeNull();
    expect(nameError('<b>hi</b>', [])).not.toBeNull();
  });

  it('이미 있는 이름은 대소문자만 달라도 못 쓴다', () => {
    expect(nameError('Maple', ['maple'])).not.toBeNull();
    expect(nameError('모험가', ['모험가'])).not.toBeNull();
    expect(nameError('모험가2', ['모험가'])).toBeNull();
  });
});

describe('외형', () => {
  it('직업 장비 아래에 캐릭터의 피부·얼굴·헤어를 깐다', () => {
    const job = describeJob(65, 'hero', look);
    expect(job.look.slice(0, 4)).toEqual([2002, 12002, 21001, 31040]);
    expect(job.look).toEqual(expect.arrayContaining(JOB_LINES.warrior.outfits[2]));
    expect(describeJob(1, null, look).look.slice(0, 4)).toEqual(baseLook(look));
  });

  it('성별을 바꾸면 그 성별의 첫 얼굴·헤어로 돌아가고 피부는 그대로다', () => {
    const female = withGender(look, 'female');
    expect(female).toEqual({ gender: 'female', skin: 2, face: FACES.female[0], hair: HAIRS.female[0] });
    expect(withGender(female, 'female')).toBe(female);
  });

  it('여자 캐릭터는 남자 전용 옷 대신 여자 옷을 입고 무기와 공용 장비는 같다', () => {
    const female = withGender(look, 'female');
    const male = describeJob(65, 'hero', look).look.slice(4);
    const dressed = describeJob(65, 'hero', female).look.slice(4);
    expect(dressed).not.toContain(1050081);
    expect(dressed).toContain(1051078);
    expect(dressed.filter((itemId) => itemId !== 1051078)).toEqual(male.filter((itemId) => itemId !== 1050081));
    expect(describeJob(1, null, female).look).not.toContain(1040002);
  });
});

describe('2차 갈래 바꾸기', () => {
  // Lv.105(4차) 바이퍼. 활동 시간만으로 레벨을 맞춘다
  const viper = (change: Partial<Character> = {}): Character => ({
    ...createCharacter('a', '바다', look),
    activeSeconds: totalXpForLevel(105),
    jobLine: 'pirate',
    jobBranch: 'viper',
    meso: 80_000,
    huntSkillId: 5121016,
    monsterBook: { 달팽이: 3 },
    wardrobe: [1702000],
    advancedAt: { 1: 1, 2: 2, 3: 3, 4: 4 },
    ...change,
  });

  it('메소를 내고 같은 계열의 다른 갈래로 바꾼다. 레벨·기록·옷장은 그대로이고 사냥 스킬은 자동으로 돌아간다', () => {
    const character = viper();
    const before = { ...character };
    expect(changeJobBranch(character, 'captain', 1_000)).toBe('ok');
    expect(character.jobBranch).toBe('captain');
    expect(character.meso).toBe(80_000 - JOB_CHANGE_MESO);
    expect(character.huntSkillId).toBeNull();
    expect(character.jobHistory).toEqual([{ at: 1_000, from: 'viper', to: 'captain' }]);
    expect(character).toMatchObject({
      activeSeconds: before.activeSeconds,
      killXp: before.killXp,
      monsterBook: before.monsterBook,
      wardrobe: before.wardrobe,
      advancedAt: before.advancedAt,
    });
    expect(characterJob(character, 105).title).toBe('캡틴 · 4차');
    // 한 번 더 바꾸면 기록이 쌓인다
    character.meso = JOB_CHANGE_MESO;
    expect(changeJobBranch(character, 'viper', 2_000)).toBe('ok');
    expect(character.jobHistory.map((entry) => entry.to)).toEqual(['captain', 'viper']);
    expect(character.meso).toBe(0);
  });

  it('메소가 모자라면 바꾸지 않는다', () => {
    const character = viper({ meso: JOB_CHANGE_MESO - 1 });
    expect(changeJobBranch(character, 'captain', 1)).toBe('meso');
    expect(character).toMatchObject({ jobBranch: 'viper', meso: JOB_CHANGE_MESO - 1, huntSkillId: 5121016, jobHistory: [] });
  });

  it('계열은 못 바꾸고, 같은 갈래나 2차 전에는 바꿀 것이 없다', () => {
    expect(jobChangeCheck(viper(), 'hero', false)).toBe('otherLine');
    expect(jobChangeCheck(viper(), 'viper', false)).toBe('same');
    expect(jobChangeCheck(viper({ jobBranch: null }), 'captain', false)).toBe('notYet');
    expect(jobChangeCheck({ ...createCharacter('b', '초보', look) }, 'captain', false)).toBe('notYet');
  });

  it('갈래 칸이 없던 캐릭터의 한 번은 무료이고, 한 번 쓰면 다음부터 값을 받는다', () => {
    const character = viper({ meso: 0, freeJobChange: true });
    expect(changeJobBranch(character, 'captain', 5, true)).toBe('ok');
    expect(character).toMatchObject({ meso: 0, jobBranch: 'captain', freeJobChange: false });
    expect(changeJobBranch(character, 'viper', 6, true)).toBe('meso');
  });

  it('갈래를 고르기 전에는 1차에 머문다', () => {
    const character = viper({ jobBranch: null });
    expect(reachedTier(character)).toBe(1);
    expect(characterJob(character, ADVANCEMENT_LEVELS[3]).branchChoice).toBe('pirate');
  });
});
