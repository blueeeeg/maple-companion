export type Gender = 'male' | 'female';

export interface Appearance {
  gender: Gender;
  /** 피부 번호. 몸통 2000+n, 머리 12000+n 이 한 쌍이다 */
  skin: number;
  face: number;
  hair: number;
}

export const GENDERS: Gender[] = ['male', 'female'];

// 캐릭터 생성에서 고를 수 있는 값. maplestory.io 로 하나씩 그려 보고 없는 번호를 그린 것과 다른 것만 넣었다.
// 없는 피부 번호(예: 5)는 오류 없이 기본 피부로 그려져서 응답 코드만으로는 걸러지지 않는다
export const SKINS = [0, 1, 2, 3];
/** 남자 얼굴은 20000번대, 여자 얼굴은 21000번대다 */
export const FACES: Record<Gender, number[]> = {
  male: [20000, 20001, 20002, 20003, 20004, 20005],
  female: [21000, 21001, 21002, 21003, 21004, 21005],
};
/** 남자 헤어는 30000번대, 여자 헤어는 31000번대다 */
export const HAIRS: Record<Gender, number[]> = {
  male: [30000, 30020, 30030, 30010, 30050, 30110],
  female: [31000, 31040, 31050, 31020, 31030, 31110],
};

export function defaultAppearance(gender: Gender): Appearance {
  return { gender, skin: SKINS[0], face: FACES[gender][0], hair: HAIRS[gender][0] };
}

export const DEFAULT_APPEARANCE: Appearance = defaultAppearance('male');

/** 성별을 바꾸면 그 성별에서 고를 수 있는 얼굴·헤어의 첫 번째로 되돌린다. 피부는 그대로 둔다 */
export function withGender(appearance: Appearance, gender: Gender): Appearance {
  if (appearance.gender === gender) return appearance;
  return { ...defaultAppearance(gender), skin: appearance.skin };
}

/** 성별이 생기기 전에 만든 캐릭터는 남자로 본다. 얼굴·헤어는 그때 고른 값을 그대로 둔다 */
export function normalizeAppearance(saved: Partial<Appearance> | undefined): Appearance {
  return { ...DEFAULT_APPEARANCE, ...saved, gender: saved?.gender ?? 'male' };
}

/** 장비 없이 몸·얼굴·헤어만 그리는 아이템 ID 목록 */
export function baseLook(appearance: Appearance): number[] {
  return [2000 + appearance.skin, 12000 + appearance.skin, appearance.face, appearance.hair];
}
