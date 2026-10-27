// 클래식(GMS 83) 맵·몹의 한글 이름. 같은 ID 의 KMS 389 이름을 쓰고, 그 ID 의 뜻이 바뀌었으면 손으로 쓴 표나 영문 이름을 쓴다.
// 그 시대 한국어 데이터는 maplestory.io 에 없다
import { apiBase, getJson } from './mapleio.ts';

type Kind = 'map' | 'mob';

/**
 * ID 는 같은데 뜻이 바뀐 것, KMS 389 에 없는 것을 손으로 적는다. 스크립트가 뜻이 바뀐 것 같다고 알린 ID 를 사람이 보고 채운다
 * (v83 영문 이름과 최근 GMS 영문 이름이 다른 것)
 */
export const CLASSIC_NAME_OVERRIDES: Record<Kind, Record<number, string>> = {
  map: {
    // KMS 389 는 카오스 자쿰의 제단이다
    280030000: '자쿰의 제단',
    // 이 아래 맵은 뒤에 다른 맵(빛나는 숲의 통로·골렘의 사원 등)으로 바뀌었다. v83 영문 이름을 옮겼다
    100010000: '헤네시스 동쪽 언덕',
    101010000: '엘리니아 북쪽 들판',
    100040100: '지혜의 숲',
    // 이름만 띄어쓰기가 바뀌었다
    270010100: '추억의 길1',
  },
  mob: {
    // 영문 이름만 바뀌고 같은 몹이다
    120100: '스포아',
    2100100: '흰 모래토끼',
    2100101: '갈색 모래토끼',
    7130600: '호브',
    7130601: '핀호브',
    // v83 은 맞으면 변신하는 주니어 예티다. 뒤에 그냥 주니어 예티가 됐다
    5100001: '변신하는 주니어 예티',
  },
};

/** 뜻이 바뀐 것을 가려내는 기준. maplestory.io 가 준비해 둔 최근 GMS 판이다 */
const LATEST_GMS = 'https://maplestory.io/api/GMS/270';

export interface ClassicName {
  name: string;
  source: 'override' | 'kms' | 'english';
  /** 사람이 한 번 볼 만한 까닭. 없으면 null */
  note: string | null;
}

interface NameJson {
  name?: string;
}

const named = new Map<string, ClassicName>();
/** 이번 실행에서 영문으로 남았거나 뜻을 확인하지 못한 이름 */
export const nameNotes: string[] = [];

export async function classicName(kind: Kind, id: number): Promise<ClassicName> {
  const key = `${kind}:${id}`;
  const known = named.get(key);
  if (known) return known;
  const override = CLASSIC_NAME_OVERRIDES[kind][id];
  const english = (await getJson<NameJson>(`${apiBase('classic')}/${kind}/${id}/name`))?.name?.trim() ?? '';
  let result: ClassicName;
  if (override) result = { name: override, source: 'override', note: null };
  else {
    const korean = (await getJson<NameJson>(`${apiBase('current')}/${kind}/${id}/name`))?.name?.trim() ?? '';
    const latest = (await getJson<NameJson>(`${LATEST_GMS}/${kind}/${id}/name`))?.name?.trim() ?? '';
    if (!korean) result = { name: english, source: 'english', note: 'KMS 389 에 없음' };
    else if (!latest) result = { name: korean, source: 'kms', note: `최근 GMS 에 없어 뜻을 확인하지 못함 (v83: ${english})` };
    else if (latest.toLowerCase() !== english.toLowerCase())
      result = { name: english, source: 'english', note: `뜻이 바뀌었을 수 있음: v83 ${english} / 최근 GMS ${latest} / KMS ${korean}` };
    else result = { name: korean, source: 'kms', note: null };
  }
  if (result.note) nameNotes.push(`${kind} ${id} → ${result.name}: ${result.note}`);
  named.set(key, result);
  return result;
}
