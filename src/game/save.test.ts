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
