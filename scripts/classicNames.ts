// 클래식(GMS 83) 맵·몹의 한글 이름. 같은 ID 의 KMS 389 이름을 쓰고, 그 ID 의 뜻이 바뀌었으면 손으로 쓴 표나 영문 이름을 쓴다.
// 그 시대 한국어 데이터는 maplestory.io 에 없다
import { apiBase, getJson, wzBase } from './mapleio.ts';

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
const LATEST_GMS_WZ = 'https://maplestory.io/api/wz/GMS/270';

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

/**
 * 스킬 이름. ID 가 같아도 빅뱅 때 다른 스킬로 바뀐 것(1121008 브랜디쉬 → 지금 레이징 블로우)과 KMS 389 에서 지워진 것은
 * 빅뱅 전 KMS 이름을 손으로 적는다. 최근 GMS 와 영문 이름만 다르고 뜻이 같은 것(Iron Will → Iron Wall)은 KMS 이름을 그대로 적는다
 */
export const CLASSIC_SKILL_NAME_OVERRIDES: Record<number, string> = {
  // 전사
  1000000: '향상된 HP 회복',
  1000001: '향상된 최대 HP 증가',
  1000002: '인듀어',
  1001003: '아이언 바디',
  1100000: '소드 마스터리',
  1100001: '액스 마스터리',
  1100002: '파이널 어택 : 검',
  1100003: '파이널 어택 : 도끼',
  1101004: '소드 부스터',
  1101005: '액스 부스터',
  1101006: '분노',
  1101007: '파워 가드',
  1110000: '향상된 MP 회복',
  1110001: '실드 마스터리',
  1111003: '패닉 : 검',
  1111004: '패닉 : 도끼',
  1111005: '코마 : 검',
  1111006: '코마 : 도끼',
  1111007: '아머 크래쉬',
  1120003: '어드밴스드 콤보 어택',
  1120004: '아킬레스',
  1120005: '가디언',
  1121008: '브랜디쉬',
  1121010: '인레이지',
  1200000: '소드 마스터리',
  1200001: '둔기 마스터리',
  1200002: '파이널 어택 : 검',
  1200003: '파이널 어택 : 둔기',
  1201004: '소드 부스터',
  1201005: '둔기 부스터',
  1210000: '향상된 MP 회복',
  1211003: '파이어 차지 : 검',
  1211004: '플레임 차지 : 둔기',
  1211005: '아이스 차지 : 검',
  1211006: '블리자드 차지 : 둔기',
  1211007: '썬더 차지 : 검',
  1211008: '라이트닝 차지 : 둔기',
  1220006: '가디언',
  1220010: '어드밴스드 차지',
  1221003: '홀리 차지 : 검',
  1221004: '디바인 차지 : 둔기',
  1300000: '스피어 마스터리',
  1300001: '폴암 마스터리',
  1300002: '파이널 어택 : 창',
  1300003: '파이널 어택 : 폴암',
  1301004: '스피어 부스터',
  1301005: '폴암 부스터',
  1301006: '아이언 월',
  1311001: '스피어 크러셔',
  1311002: '폴암 크러셔',
  1311003: '드래곤 퓨리 : 창',
  1311004: '드래곤 퓨리 : 폴암',
  1311007: '파워 크래쉬',
  1311008: '드래곤 블러드',
  1320005: '아킬레스',
  1320006: '버서크',
  1320008: '비홀더스 힐링',
  1320009: '비홀더스 버프',
  1321007: '비홀더',
  // 마법사
  2000000: '향상된 MP 회복',
  2000001: '향상된 최대 MP 증가',
  2001002: '매직 가드',
  2100000: 'MP 이터',
  2101003: '슬로우',
  2101004: '파이어 애로우',
  2110000: '파셜 레지스턴스',
  2111004: '씰',
  2111005: '매직 부스터',
  2111006: '엘리멘트 컴포지션',
  2121002: '마나 리플렉션',
  2121003: '파이어 데몬',
  2121005: '이프리트',
  2121006: '패럴라이즈',
  2200000: 'MP 이터',
  2201003: '슬로우',
  2210000: '파셜 레지스턴스',
  2211004: '씰',
  2211005: '매직 부스터',
  2211006: '엘리멘트 컴포지션',
  2221002: '마나 리플렉션',
  2221003: '아이스 데몬',
  2221005: '엘퀴네스',
  2300000: 'MP 이터',
  2301003: '인빈서블',
  2310000: '엘리먼트 레지스턴스',
  2311006: '서먼 드래곤',
  2321005: '홀리 실드',
  // 궁수
  3000000: '아마존의 축복',
  3000002: '아마존의 눈',
  3001003: '포커스',
  3101002: '보우 부스터',
  3101003: '파워 넉백',
  3101004: '소울 애로우 : 활',
  3101005: '애로우 봄 : 활',
  3110000: '쓰러스트',
  3111003: '인페르노',
  3111004: '애로우 레인',
  3111005: '실버 호크',
  3121003: '드래곤스 브레스',
  3121006: '피닉스',
  3121007: '햄스트링',
  3121008: '컨센트레이트',
  3201003: '파워 넉백',
  3201004: '소울 애로우 : 석궁',
  3201005: '아이언 애로우',
  3210000: '쓰러스트',
  3211003: '블리자드',
  3211005: '골든 이글',
  3220004: '크로스보우 엑스퍼트',
  3221003: '드래곤스 브레스',
  3221005: '프리저',
  3221006: '블라인드',
  // 도적
  4100002: '인듀어',
  4111006: '플래시 점프',
  4121006: '쉐도우 스타',
  4200001: '인듀어',
  4201002: '대거 부스터',
  4211002: '어썰터',
  4211003: '픽 파킷',
  4221007: '부메랑 스탭',
  // 해적
  5100000: '최대 HP 증가',
  5100001: '너클 마스터리',
  5101006: '너클 부스터',
  5110000: '그로기 마스터리',
  5111002: '에너지 블라스트',
  5111004: '에너지 드레인',
  5111006: '쇼크웨이브',
  5121002: '에너지 오브',
  5121003: '슈퍼 트랜스폼',
  5121004: '데몰리션',
  5121005: '스내치',
  5121007: '피스트 인레이지',
  5121008: '용사의 의지',
  5201001: '인비저블 샷',
  5221003: '에어 스트라이크',
  5221010: '용사의 의지',
};

interface WzText {
  value?: string;
}

const skillNode = (base: string, id: number) => `${base}/String/Skill.img/${String(id).padStart(7, '0')}/name`;

/** 스킬 이름. 맵·몹과 같은 순서(손으로 쓴 표 → 뜻이 같은 KMS 389 → v83 영문)다 */
export async function classicSkillName(id: number): Promise<ClassicName> {
  const override = CLASSIC_SKILL_NAME_OVERRIDES[id];
  const english = (await getJson<WzText>(skillNode(wzBase('classic'), id)))?.value?.trim() ?? '';
  let result: ClassicName;
  if (override) result = { name: override, source: 'override', note: null };
  else {
    const korean = (await getJson<WzText>(skillNode(wzBase('current'), id)))?.value?.trim() ?? '';
    const latest = (await getJson<WzText>(skillNode(LATEST_GMS_WZ, id)))?.value?.trim() ?? '';
    if (!korean) result = { name: english, source: 'english', note: 'KMS 389 에 없음' };
    else if (!latest) result = { name: korean, source: 'kms', note: `최근 GMS 에 없어 뜻을 확인하지 못함 (v83: ${english})` };
    else if (latest.toLowerCase() !== english.toLowerCase())
      result = { name: english, source: 'english', note: `뜻이 바뀌었을 수 있음: v83 ${english} / 최근 GMS ${latest} / KMS ${korean}` };
    else result = { name: korean, source: 'kms', note: null };
  }
  if (result.note) nameNotes.push(`skill ${id} → ${result.name}: ${result.note}`);
  return result;
}
