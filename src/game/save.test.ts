import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from './appearance';
import { type Character, type Roster, createCharacter, emptyRoster } from './characters';
import { totalXpForLevel } from './progression';
import { mergeRosters, normalizeRoster, parseRoster } from './save';

const character = (id: string, change: Partial<Character> = {}): Character => ({
  ...createCharacter(id, `캐릭${id}`, DEFAULT_APPEARANCE),
  ...change,
});
const roster = (characters: Character[], change: Partial<Roster> = {}): Roster => ({
  ...emptyRoster(),
  characters,
  ...change,
});

describe('파일 저장과 localStorage 저장 합치기', () => {
  it('파일이 비어 있으면 localStorage 그대로다', () => {
    const local = roster([character('a', { activeSeconds: 100 })], { selectedId: 'a', muted: true });
    expect(mergeRosters(null, local)).toEqual(local);
  });

  it('양쪽에 따로 만든 캐릭터를 모두 남긴다. 파일 쪽이 앞이다', () => {
    const file = roster([character('release')], { selectedId: 'release' });
    const local = roster([character('dev1'), character('dev2')], { selectedId: 'dev1' });
    const merged = mergeRosters(file, local);
    expect(merged.characters.map(({ id }) => id)).toEqual(['release', 'dev1', 'dev2']);
  });

  it('같은 캐릭터는 활동 시간 + 사냥 경험치가 큰 쪽을 쓰고 옷장은 합친다', () => {
    const file = roster([character('a', { activeSeconds: 100, killXp: 0, meso: 1, wardrobe: [1, 2] })]);
    const local = roster([character('a', { activeSeconds: 50, killXp: 100, meso: 2, wardrobe: [2, 3] })]);
    const [merged] = mergeRosters(file, local).characters;
    expect(merged.meso).toBe(2);
    expect(merged.wardrobe).toEqual([1, 2, 3]);
  });

  it('진행이 같으면 파일 쪽을 쓴다', () => {
    const file = roster([character('a', { activeSeconds: 10, meso: 1 })]);
    const local = roster([character('a', { activeSeconds: 10, meso: 2 })]);
    expect(mergeRosters(file, local).characters[0].meso).toBe(1);
  });

  it('고른 캐릭터는 파일 쪽이 있으면 파일, 없으면 localStorage 다', () => {
    const local = roster([character('dev')], { selectedId: 'dev' });
    expect(mergeRosters(roster([character('rel')], { selectedId: 'rel' }), local).selectedId).toBe('rel');
    expect(mergeRosters(roster([character('rel')], { selectedId: null }), local).selectedId).toBe('dev');
    expect(mergeRosters(roster([character('rel')], { selectedId: 'gone' }), local).selectedId).toBe('dev');
    expect(mergeRosters(roster([]), roster([character('x')], { selectedId: 'gone' })).selectedId).toBeNull();
  });

  it('소리 끄기는 파일이 있으면 파일 값이다', () => {
    expect(mergeRosters(roster([], { muted: false }), roster([], { muted: true })).muted).toBe(false);
    expect(mergeRosters(null, roster([], { muted: true })).muted).toBe(true);
  });

  it('두 번 합쳐도 같다', () => {
    const file = roster([character('a', { activeSeconds: 5, wardrobe: [1] })], { selectedId: 'a' });
    const local = roster([character('a', { activeSeconds: 9, wardrobe: [2] }), character('b')], { selectedId: 'b' });
    const once = mergeRosters(file, local);
    expect(mergeRosters(once, local)).toEqual(once);
  });

  it('localStorage 에 예전 한 명 저장만 있어도 옮긴다', () => {
    const legacy = JSON.stringify({ jobLine: 'magician', killXp: 10, meso: 5, monsterBook: {}, encountersResolved: 0, muted: false });
    const merged = mergeRosters(null, parseRoster(null, legacy, 3600, 'legacy'));
    expect(merged.characters).toHaveLength(1);
    expect(merged.characters[0]).toMatchObject({ id: 'legacy', activeSeconds: 3600, killXp: 10 });
    expect(merged.selectedId).toBe('legacy');
  });

  it('파일에서 읽은 예전 판 캐릭터도 빠진 값을 채운다', () => {
    const { characters } = normalizeRoster({ characters: [{ id: 'a', name: '모험가', activeSeconds: 1 } as Character] });
    expect(characters[0].wardrobe).toEqual([]);
    expect(characters[0].cashEquipped).toEqual({});
  });
});

describe('사냥 스킬·전직 기록 저장', () => {
  // Lv.156 언저리(4차). 활동 시간만으로 레벨을 맞춘다
  const fourthJobSeconds = totalXpForLevel(156);

  it('칸이 없던 예전 저장은 자동 스킬이고, 이미 한 전직은 날짜 모름이다', () => {
    const old = { id: 'a', name: '불독', activeSeconds: fourthJobSeconds, killXp: 0, jobLine: 'magician' } as Character;
    const [character] = normalizeRoster({ characters: [old] }).characters;
    expect(character.huntSkillId).toBeNull();
    expect(character.advancedAt).toEqual({ 1: null, 2: null, 3: null, 4: null });
  });

  it('직업을 안 고른 예전 저장은 아직 전직 기록이 없다', () => {
    const old = { id: 'a', name: '초보', activeSeconds: fourthJobSeconds, jobLine: null } as Character;
    expect(normalizeRoster({ characters: [old] }).characters[0].advancedAt).toEqual({});
  });

  it('저장한 사냥 스킬·전직 날짜는 그대로 읽고, 숫자가 아닌 스킬은 자동으로 읽는다', () => {
    const saved = character('a', { huntSkillId: 2121007, advancedAt: { 1: null, 2: 1700000000000 } });
    const [read] = normalizeRoster(JSON.parse(JSON.stringify({ characters: [saved] }))).characters;
    expect(read.huntSkillId).toBe(2121007);
    expect(read.advancedAt).toEqual({ 1: null, 2: 1700000000000 });
    const broken = { ...saved, huntSkillId: '2121007' } as unknown as Character;
    expect(normalizeRoster({ characters: [broken] }).characters[0].huntSkillId).toBeNull();
  });

  it('예전 한 명 저장을 옮겨도 이미 한 전직은 날짜 모름이다', () => {
    const legacy = JSON.stringify({ jobLine: 'warrior', killXp: 0, meso: 0, monsterBook: {}, encountersResolved: 0, muted: false });
    const [moved] = parseRoster(null, legacy, totalXpForLevel(35), 'legacy').characters;
    expect(moved.advancedAt).toEqual({ 1: null, 2: null });
  });

  it('합칠 때 사냥 스킬은 더 자란 쪽, 전직 날짜는 양쪽을 합친다', () => {
    const file = roster([character('a', { activeSeconds: 100, huntSkillId: 2121007, advancedAt: { 1: null, 2: 900 } })]);
    const local = roster([character('a', { activeSeconds: 50, huntSkillId: null, advancedAt: { 1: 300, 2: 800 } })]);
    const [merged] = mergeRosters(file, local).characters;
    expect(merged.huntSkillId).toBe(2121007);
    expect(merged.advancedAt).toEqual({ 1: 300, 2: 800 });
    expect(mergeRosters(mergeRosters(file, local), local)).toEqual(mergeRosters(file, local));
  });
});

describe('셔플 백 저장', () => {
  it('bossBag 이 없는 예전 저장은 빈 배열로 읽는다', () => {
    const old = { ...character('a') } as Partial<Character>;
    delete old.bossBag;
    delete old.lastBossId;
    const [read] = normalizeRoster(JSON.parse(JSON.stringify({ characters: [old] }))).characters;
    expect(read.bossBag).toEqual([]);
    expect(read.lastBossId).toBeNull();
  });

  it('저장된 bossBag 과 lastBossId 는 그대로 읽는다', () => {
    const saved = character('a', { bossBag: [2220000, 6130101], lastBossId: 8820001 });
    const [read] = normalizeRoster(JSON.parse(JSON.stringify({ characters: [saved] }))).characters;
    expect(read.bossBag).toEqual([2220000, 6130101]);
    expect(read.lastBossId).toBe(8820001);
  });

  it('bossBag 에 숫자가 아닌 값이 섞이면 걸러낸다', () => {
    const corrupted = { ...character('a'), bossBag: [2220000, 'bad', null, 6130101] } as unknown as Character;
    const [read] = normalizeRoster({ characters: [corrupted] }).characters;
    expect(read.bossBag).toEqual([2220000, 6130101]);
  });

  it('합칠 때 더 자란 쪽 bossBag 과 lastBossId 를 쓰고 다시 합쳐도 같다', () => {
    const file = roster([character('a', { activeSeconds: 100, bossBag: [2220000], lastBossId: 6130101 })]);
    const local = roster([character('a', { activeSeconds: 50, bossBag: [], lastBossId: null })]);
    const [merged] = mergeRosters(file, local).characters;
    expect(merged.bossBag).toEqual([2220000]);
    expect(merged.lastBossId).toBe(6130101);
    expect(mergeRosters(mergeRosters(file, local), local)).toEqual(mergeRosters(file, local));
  });
});

describe('마을 셔플 백 저장', () => {
  it('townBag 이 없는 예전 저장은 빈 배열로 읽는다', () => {
    const old = { ...character('a') } as Partial<Character>;
    delete old.townBag;
    delete old.lastTownId;
    const [read] = normalizeRoster(JSON.parse(JSON.stringify({ characters: [old] }))).characters;
    expect(read.townBag).toEqual([]);
    expect(read.lastTownId).toBeNull();
  });

  it('저장된 townBag 과 lastTownId 는 그대로 읽는다', () => {
    const saved = character('a', { townBag: ['henesys', 'leafre'], lastTownId: 'orbis' });
    const [read] = normalizeRoster(JSON.parse(JSON.stringify({ characters: [saved] }))).characters;
    expect(read.townBag).toEqual(['henesys', 'leafre']);
    expect(read.lastTownId).toBe('orbis');
  });

  it('townBag 에 문자열이 아닌 값이 섞이면 걸러낸다', () => {
    const corrupted = { ...character('a'), townBag: ['henesys', 42, null, 'leafre'] } as unknown as Character;
    const [read] = normalizeRoster({ characters: [corrupted] }).characters;
    expect(read.townBag).toEqual(['henesys', 'leafre']);
  });

  it('합칠 때 더 자란 쪽 townBag 과 lastTownId 를 쓴다', () => {
    const file = roster([character('a', { activeSeconds: 100, townBag: ['orbis'], lastTownId: 'henesys' })]);
    const local = roster([character('a', { activeSeconds: 50, townBag: [], lastTownId: null })]);
    const [merged] = mergeRosters(file, local).characters;
    expect(merged.townBag).toEqual(['orbis']);
    expect(merged.lastTownId).toBe('henesys');
    expect(mergeRosters(mergeRosters(file, local), local)).toEqual(mergeRosters(file, local));
  });
});

describe('보스 지정 저장', () => {
  const PINK_BEAN = 8820001;

  it('보스 지정이 생기기 전 저장은 지정 없음으로 읽는다', () => {
    const old = { ...character('a') } as Partial<Character>;
    delete old.reservedBossId;
    const [read] = normalizeRoster(JSON.parse(JSON.stringify({ characters: [old] }))).characters;
    expect(read.reservedBossId).toBeNull();
  });

  it('지정한 보스는 그대로 읽고 목록에 없는 보스·숫자가 아닌 값은 지정 없음이다', () => {
    const read = (value: unknown) =>
      normalizeRoster({ characters: [{ ...character('a'), reservedBossId: value } as Character] }).characters[0].reservedBossId;
    expect(read(PINK_BEAN)).toBe(PINK_BEAN);
    expect(read(9999999)).toBeNull();
    expect(read(String(PINK_BEAN))).toBeNull();
    expect(read(null)).toBeNull();
  });

  it('합칠 때 더 자란 쪽 지정을 쓰고 다시 합쳐도 같다', () => {
    const file = roster([character('a', { activeSeconds: 100, reservedBossId: null })]);
    const local = roster([character('a', { activeSeconds: 50, reservedBossId: PINK_BEAN })]);
    expect(mergeRosters(file, local).characters[0].reservedBossId).toBeNull();
    const grown = roster([character('a', { activeSeconds: 200, reservedBossId: PINK_BEAN })]);
    expect(mergeRosters(file, grown).characters[0].reservedBossId).toBe(PINK_BEAN);
    expect(mergeRosters(mergeRosters(file, grown), grown)).toEqual(mergeRosters(file, grown));
  });
});

describe('2차 갈래 저장', () => {
  const fourthJobSeconds = totalXpForLevel(105);

  it('갈래 칸이 없던 저장은 2차를 했으면 하나뿐이던 길로 읽고 한 번 무료로 다시 고르게 한다', () => {
    const old = { id: 'a', name: '바다', activeSeconds: fourthJobSeconds, killXp: 0, jobLine: 'pirate' } as Character;
    const [read] = normalizeRoster({ characters: [old] }).characters;
    expect(read).toMatchObject({ jobBranch: 'viper', freeJobChange: true, jobHistory: [] });
    expect(read.advancedAt).toEqual({ 1: null, 2: null, 3: null, 4: null });
  });

  it('2차 전이던 예전 저장은 아직 갈래가 없고 Lv.30 에 고른다', () => {
    const old = { id: 'a', name: '바다', activeSeconds: totalXpForLevel(20), killXp: 0, jobLine: 'pirate' } as Character;
    expect(normalizeRoster({ characters: [old] }).characters[0]).toMatchObject({ jobBranch: null, freeJobChange: false });
  });

  it('예전 한 명 저장을 옮겨도 2차를 했으면 첫 갈래다', () => {
    const legacy = JSON.stringify({ jobLine: 'warrior', killXp: 0, meso: 0, monsterBook: {}, encountersResolved: 0, muted: false });
    const [moved] = parseRoster(null, legacy, totalXpForLevel(35), 'legacy').characters;
    expect(moved).toMatchObject({ jobBranch: 'hero', freeJobChange: true });
  });

  it('고른 갈래·다시 고르기 답·바꾼 기록은 그대로 읽는다', () => {
    const saved = character('a', {
      activeSeconds: fourthJobSeconds,
      jobLine: 'pirate',
      jobBranch: 'captain',
      freeJobChange: false,
      jobHistory: [{ at: 10, from: 'viper', to: 'captain' }],
    });
    const [read] = normalizeRoster(JSON.parse(JSON.stringify({ characters: [saved] }))).characters;
    expect(read).toMatchObject({ jobBranch: 'captain', freeJobChange: false, jobHistory: [{ at: 10, from: 'viper', to: 'captain' }] });
  });

  it('갈래 칸이 있는데 아직 안 골랐으면(null) 다시 고르기를 주지 않는다', () => {
    const saved = character('a', { activeSeconds: fourthJobSeconds, jobLine: 'pirate', jobBranch: null });
    expect(normalizeRoster(JSON.parse(JSON.stringify({ characters: [saved] }))).characters[0]).toMatchObject({
      jobBranch: null,
      freeJobChange: false,
    });
  });

  it('다른 계열 갈래나 모르는 값은 안 고른 것으로, 깨진 기록은 빼고 읽는다', () => {
    const broken = {
      ...character('a', { activeSeconds: fourthJobSeconds, jobLine: 'pirate' }),
      jobBranch: 'hero',
      freeJobChange: true,
      jobHistory: [{ at: 1, from: 'viper', to: 'captain' }, { at: 'x', from: 'viper', to: 'captain' }, { at: 2, from: 'nope', to: 'captain' }, null],
    } as unknown as Character;
    const [read] = normalizeRoster({ characters: [broken] }).characters;
    expect(read).toMatchObject({ jobBranch: null, freeJobChange: false, jobHistory: [{ at: 1, from: 'viper', to: 'captain' }] });
  });

  it('합칠 때 갈래는 마지막으로 바꾼 쪽, 바꾼 기록은 양쪽을 합친다', () => {
    const base = { activeSeconds: fourthJobSeconds, jobLine: 'pirate' as const };
    // 파일 쪽에서 캡틴으로 바꿨고, localStorage 쪽은 바이퍼로 사냥을 더 했다
    const file = roster([character('a', { ...base, jobBranch: 'captain', jobHistory: [{ at: 50, from: 'viper', to: 'captain' }] })]);
    const local = roster([character('a', { ...base, activeSeconds: fourthJobSeconds + 500, jobBranch: 'viper', huntSkillId: 5121016 })]);
    const [merged] = mergeRosters(file, local).characters;
    expect(merged.activeSeconds).toBe(fourthJobSeconds + 500);
    expect(merged.jobBranch).toBe('captain');
    // 다른 쪽 갈래를 가져왔으니 바이퍼 사냥 스킬은 자동으로 돌린다
    expect(merged.huntSkillId).toBeNull();
    expect(merged.jobHistory).toEqual([{ at: 50, from: 'viper', to: 'captain' }]);
    expect(mergeRosters(mergeRosters(file, local), local)).toEqual(mergeRosters(file, local));
  });

  it('같은 기록은 한 번만, 시간 순서로 합친다', () => {
    const base = { activeSeconds: fourthJobSeconds, jobLine: 'pirate' as const, jobBranch: 'viper' as const };
    const a = { at: 10, from: 'viper' as const, to: 'captain' as const };
    const b = { at: 20, from: 'captain' as const, to: 'viper' as const };
    const file = roster([character('a', { ...base, jobHistory: [b] })]);
    const local = roster([character('a', { ...base, jobHistory: [a, b] })]);
    expect(mergeRosters(file, local).characters[0].jobHistory).toEqual([a, b]);
  });

  it('한쪽에서 다시 고르기에 답했으면 다른 쪽이 더 자랐어도 또 묻지 않는다', () => {
    const base = { activeSeconds: fourthJobSeconds, jobLine: 'pirate' as const };
    const answered = roster([character('a', { ...base, jobBranch: 'viper', freeJobChange: false })]);
    const pending = roster([character('a', { ...base, activeSeconds: fourthJobSeconds + 9, jobBranch: 'viper', freeJobChange: true, huntSkillId: 5121016 })]);
    const [merged] = mergeRosters(answered, pending).characters;
    expect(merged).toMatchObject({ jobBranch: 'viper', freeJobChange: false, huntSkillId: 5121016 });
  });

  it('한쪽에서만 갈래를 골랐으면 그 갈래를 쓴다', () => {
    const base = { activeSeconds: fourthJobSeconds, jobLine: 'pirate' as const };
    const chose = roster([character('a', { ...base, jobBranch: 'captain' })]);
    const notYet = roster([character('a', { ...base, activeSeconds: fourthJobSeconds + 9, jobBranch: null })]);
    expect(mergeRosters(notYet, chose).characters[0].jobBranch).toBe('captain');
  });
});

describe('갈래 바꾸기 안내 저장', () => {
  const fourthJobSeconds = totalXpForLevel(105);

  it('칸이 없던 저장이나 깨진 값은 아직 안 알린 것으로 읽는다', () => {
    const old = { id: 'a', name: '바다', activeSeconds: fourthJobSeconds, killXp: 0, jobLine: 'pirate', jobBranch: 'viper' } as Character;
    expect(normalizeRoster({ characters: [old] }).characters[0].jobChangeHintShown).toBe(false);
    const broken = { ...old, jobChangeHintShown: 'yes' } as unknown as Character;
    expect(normalizeRoster({ characters: [broken] }).characters[0].jobChangeHintShown).toBe(false);
  });

  it('알린 것은 그대로 읽는다', () => {
    const saved = character('a', { jobChangeHintShown: true });
    expect(normalizeRoster(JSON.parse(JSON.stringify({ characters: [saved] }))).characters[0].jobChangeHintShown).toBe(true);
  });

  it('합칠 때 한쪽에서라도 알렸으면 알린 것이다. 덜 자란 쪽에서 알렸어도 같다', () => {
    const base = { activeSeconds: fourthJobSeconds, jobLine: 'pirate' as const, jobBranch: 'viper' as const };
    const shown = roster([character('a', { ...base, jobChangeHintShown: true })]);
    const notYet = roster([character('a', { ...base, activeSeconds: fourthJobSeconds + 9 })]);
    expect(mergeRosters(shown, notYet).characters[0].jobChangeHintShown).toBe(true);
    expect(mergeRosters(notYet, shown).characters[0].jobChangeHintShown).toBe(true);
    expect(mergeRosters(notYet, notYet).characters[0].jobChangeHintShown).toBe(false);
  });
});

describe('장비 컬렉션 저장', () => {
  const ZAKUM_HELMET = 1002357;
  const WORK_GLOVES = 1082002;
  const GENESIS_SABER = 1302355;

  it('컬렉션이 생기기 전 저장은 빈 컬렉션으로 읽는다', () => {
    const { characters } = normalizeRoster({ characters: [{ id: 'a', name: '모험가', activeSeconds: 1 } as Character] });
    expect(characters[0]).toMatchObject({ equipOwned: [], equipWorn: {}, equipPity: {}, equipGifts: [] });
  });

  it('모르는 아이템·깨진 값·가진 적 없는 착용·자리가 안 맞는 착용은 버린다', () => {
    const saved = {
      ...character('a'),
      equipOwned: [ZAKUM_HELMET, WORK_GLOVES, 123, 'x', ZAKUM_HELMET],
      equipWorn: { cap: ZAKUM_HELMET, glove: GENESIS_SABER, weapon: WORK_GLOVES, shoes: 1072375 },
      equipPity: { 8820001: { rare: 7, veryRare: -1 }, 999: { rare: 3 }, 8800000: 'x' },
      equipGifts: [1102166, 5],
    } as unknown as Character;
    const [read] = normalizeRoster({ characters: [saved] }).characters;
    expect(read.equipOwned).toEqual([ZAKUM_HELMET, WORK_GLOVES]);
    expect(read.equipWorn).toEqual({ cap: ZAKUM_HELMET });
    expect(read.equipPity).toEqual({ 8820001: { rare: 7 } });
    expect(read.equipGifts).toEqual([1102166]);
  });

  it('같은 캐릭터면 컬렉션·받은 선물은 합치고 입은 것은 더 자란 쪽, 천장은 더 센 쪽이다', () => {
    const file = roster([
      character('a', {
        activeSeconds: 100,
        equipOwned: [ZAKUM_HELMET],
        equipWorn: { cap: ZAKUM_HELMET },
        equipPity: { 8820001: { rare: 3 } },
        equipGifts: [1102166],
      }),
    ]);
    const local = roster([
      character('a', {
        activeSeconds: 50,
        equipOwned: [WORK_GLOVES],
        equipWorn: { glove: WORK_GLOVES },
        equipPity: { 8820001: { rare: 5, veryRare: 2 } },
        equipGifts: [1102031],
      }),
    ]);
    const [merged] = mergeRosters(file, local).characters;
    expect(merged.equipOwned).toEqual([ZAKUM_HELMET, WORK_GLOVES]);
    expect(merged.equipWorn).toEqual({ cap: ZAKUM_HELMET });
    expect(merged.equipGifts).toEqual([1102166, 1102031]);
    expect(merged.equipPity).toEqual({ 8820001: { rare: 5, veryRare: 2 } });
    expect(mergeRosters(mergeRosters(file, local), local)).toEqual(mergeRosters(file, local));
  });

  it('파일로 쓰고 다시 읽어도 같다', () => {
    const saved = roster([character('a', { equipOwned: [ZAKUM_HELMET], equipWorn: { cap: ZAKUM_HELMET }, equipGifts: [ZAKUM_HELMET] })]);
    expect(parseRoster(JSON.stringify(saved), null, 0).characters[0]).toMatchObject({
      equipOwned: [ZAKUM_HELMET],
      equipWorn: { cap: ZAKUM_HELMET },
    });
  });
});

describe('의자 저장', () => {
  const PINK_BEAN_CHAIR = 3010225;
  const ZAKUM_CHAIR = 3010455;

  it('의자가 생기기 전 저장은 빈 목록에 고른 의자 없음으로 읽는다', () => {
    const { characters } = normalizeRoster({ characters: [{ id: 'a', name: '모험가', activeSeconds: 1 } as Character] });
    expect(characters[0]).toMatchObject({ chairOwned: [], chairSelected: null });
  });

  it('모르는 의자·깨진 값은 버리고, 가진 적 없는 의자를 골라 뒀으면 고르지 않은 것으로 친다', () => {
    const saved = { ...character('a'), chairOwned: [PINK_BEAN_CHAIR, 3019999, 'x', PINK_BEAN_CHAIR, 1002357], chairSelected: ZAKUM_CHAIR };
    const [read] = normalizeRoster({ characters: [saved as unknown as Character] }).characters;
    expect(read.chairOwned).toEqual([PINK_BEAN_CHAIR]);
    expect(read.chairSelected).toBeNull();
    const kept = { ...character('a'), chairOwned: [PINK_BEAN_CHAIR], chairSelected: PINK_BEAN_CHAIR };
    expect(normalizeRoster({ characters: [kept] }).characters[0].chairSelected).toBe(PINK_BEAN_CHAIR);
    const broken = { ...character('a'), chairOwned: 'x', chairSelected: '3010225' };
    expect(normalizeRoster({ characters: [broken as unknown as Character] }).characters[0]).toMatchObject({ chairOwned: [], chairSelected: null });
  });

  it('같은 캐릭터면 모은 의자는 합치고 고른 의자는 더 자란 쪽 것이다', () => {
    const file = roster([character('a', { activeSeconds: 100, chairOwned: [PINK_BEAN_CHAIR], chairSelected: PINK_BEAN_CHAIR })]);
    const local = roster([character('a', { activeSeconds: 50, chairOwned: [ZAKUM_CHAIR], chairSelected: ZAKUM_CHAIR })]);
    const [merged] = mergeRosters(file, local).characters;
    expect(merged.chairOwned).toEqual([PINK_BEAN_CHAIR, ZAKUM_CHAIR]);
    expect(merged.chairSelected).toBe(PINK_BEAN_CHAIR);
    const [other] = mergeRosters(local, file).characters;
    expect(other.chairSelected).toBe(PINK_BEAN_CHAIR);
    expect(mergeRosters(mergeRosters(file, local), local)).toEqual(mergeRosters(file, local));
  });

  it('파일로 쓰고 다시 읽어도 같다', () => {
    const saved = roster([character('a', { chairOwned: [ZAKUM_CHAIR], chairSelected: ZAKUM_CHAIR })]);
    expect(parseRoster(JSON.stringify(saved), null, 0).characters[0]).toMatchObject({ chairOwned: [ZAKUM_CHAIR], chairSelected: ZAKUM_CHAIR });
  });
});

describe('탈것 저장', () => {
  const HOG = 1902000;
  const BALROG = 1932010;

  it('탈것이 생기기 전 저장은 빈 목록에 고른 탈것 없음으로 읽는다', () => {
    const { characters } = normalizeRoster({ characters: [{ id: 'a', name: '모험가', activeSeconds: 1 } as Character] });
    expect(characters[0]).toMatchObject({ mountOwned: [], mountSelected: null });
  });

  it('모르는 탈것·깨진 값은 버리고, 가진 적 없는 탈것을 골라 뒀으면 고르지 않은 것으로 친다', () => {
    const saved = { ...character('a'), mountOwned: [HOG, 1932881, 'x', HOG, 3010225], mountSelected: BALROG };
    const [read] = normalizeRoster({ characters: [saved as unknown as Character] }).characters;
    expect(read.mountOwned).toEqual([HOG]);
    expect(read.mountSelected).toBeNull();
    const kept = { ...character('a'), mountOwned: [HOG], mountSelected: HOG };
    expect(normalizeRoster({ characters: [kept] }).characters[0].mountSelected).toBe(HOG);
    const broken = { ...character('a'), mountOwned: 'x', mountSelected: '1902000' };
    expect(normalizeRoster({ characters: [broken as unknown as Character] }).characters[0]).toMatchObject({ mountOwned: [], mountSelected: null });
  });

  it('같은 캐릭터면 모은 탈것은 합치고 고른 탈것은 더 자란 쪽 것이다', () => {
    const file = roster([character('a', { activeSeconds: 100, mountOwned: [HOG], mountSelected: HOG })]);
    const local = roster([character('a', { activeSeconds: 50, mountOwned: [BALROG], mountSelected: BALROG })]);
    const [merged] = mergeRosters(file, local).characters;
    expect(merged.mountOwned).toEqual([HOG, BALROG]);
    expect(merged.mountSelected).toBe(HOG);
    const [other] = mergeRosters(local, file).characters;
    expect(other.mountSelected).toBe(HOG);
    expect(mergeRosters(mergeRosters(file, local), local)).toEqual(mergeRosters(file, local));
  });

  it('파일로 쓰고 다시 읽어도 같다', () => {
    const saved = roster([character('a', { mountOwned: [BALROG], mountSelected: BALROG })]);
    expect(parseRoster(JSON.stringify(saved), null, 0).characters[0]).toMatchObject({ mountOwned: [BALROG], mountSelected: BALROG });
  });
});

describe('시대 저장', () => {
  const raw = (change: Record<string, unknown>) => ({ ...character('a'), ...change }) as unknown as Character;

  it('시대 칸이 없던 저장은 지금 시대로 읽는다', () => {
    const { era: _, ...old } = character('a');
    const [loaded] = normalizeRoster({ characters: [old as Character] }).characters;
    expect(loaded.era).toBe('current');
  });

  it('클래식은 그대로 읽고 모르는 값은 지금 시대로 읽는다', () => {
    const loaded = normalizeRoster({ characters: [raw({ era: 'classic' }), raw({ id: 'b', era: 'retro' }), raw({ id: 'c', era: 3 })] });
    expect(loaded.characters.map((each) => each.era)).toEqual(['classic', 'current', 'current']);
  });

  it('새 캐릭터는 고른 시대로 만들고 고르지 않으면 지금 시대다', () => {
    expect(createCharacter('a', '클래식', DEFAULT_APPEARANCE, 'classic').era).toBe('classic');
    expect(createCharacter('b', '지금', DEFAULT_APPEARANCE).era).toBe('current');
  });

  it('합칠 때 어느 쪽이든 클래식이면 클래식이다. 덜 자란 쪽이 클래식이어도 같고 다시 합쳐도 같다', () => {
    const file = roster([character('a', { era: 'classic', activeSeconds: 10 })]);
    const local = roster([character('a', { era: 'current', activeSeconds: 100 })]);
    const merged = mergeRosters(file, local);
    expect(merged.characters[0].era).toBe('classic');
    expect(mergeRosters(merged, local)).toEqual(merged);
    expect(mergeRosters(local, file).characters[0].era).toBe('classic');
  });

  it('파일로 쓰고 다시 읽어도 시대가 남는다', () => {
    const saved = roster([character('a', { era: 'classic' }), character('b')]);
    const loaded = parseRoster(JSON.stringify(saved), null, 0);
    expect(loaded.characters.map((each) => each.era)).toEqual(['classic', 'current']);
  });
});
