import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from './appearance';
import { type Character, type Roster, createCharacter, emptyRoster } from './characters';
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
