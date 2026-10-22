import { type Appearance, baseLook } from './appearance';

export type JobLineId = 'warrior' | 'magician' | 'archer' | 'thief' | 'pirate';

type PerTier<T> = [first: T, second: T, third: T, fourth: T, fifth: T, sixth: T];

export interface JobLine {
  id: JobLineId;
  className: string;
  /** 1차부터 4차까지. 5차·6차는 4차 이름을 그대로 쓴다 */
  names: [string, string, string, string];
  /** 직업 선택 창에서 구분용으로만 쓰는 색 */
  color: number;
  /** 차수별 장비 아이템 ID (무기 제외). 남자 기준이고 여자는 FEMALE_EQUIVALENTS 로 바꿔 입는다 */
  outfits: PerTier<number[]>;
  /** [1·2차 무기, 3차부터 무기] */
  weapons: [number, number];
  /**
   * 차수별 공격 스킬 ID. 5·6차는 4차 스킬을 쓴다.
   * 스킬 전용 캐릭터 동작은 API 가 그려 주지 않아서 캐릭터는 무기 기본 공격 동작(attackAction)으로 휘두른다
   */
  skills: [number, number, number, number];
  attackAction: string;
  /** 스킬 데이터에 사거리가 없을 때 쓰는 값 */
  fallbackRange: number;
}

/** 1차부터 6차까지 전직 레벨 */
export const ADVANCEMENT_LEVELS = [10, 30, 60, 100, 200, 260] as const;

// 하얀 반팔 면티·파란 청 반바지·빨간색 고무 장화
const STARTER_CLOTHES = [1040002, 1060002, 1072001];

/**
 * 남자 전용(requiredGender 0) 옷을 여자 캐릭터에게 입힐 때 바꿔 입히는 여자 옷(requiredGender 1).
 * 같은 부위·같은 요구 직업에서 요구 레벨이 같거나 가깝고 색·이름이 비슷한 것을 KMS 389 아이템 목록에서 골랐다.
 * 나머지 장비는 남녀 공용이라 그대로 입는다
 */
const FEMALE_EQUIVALENTS: Record<number, number> = {
  1040002: 1041002, // 하얀 반팔 면티 → 하얀 탱크탑
  1060002: 1061160, // 파란 청 반바지 → 평범한 청치마
  1050011: 1051010, // 흑룡포 → 다크 잉그리트
  1050081: 1051078, // 레드 배틀로드 → 레드 배틀엠프리스
  1050002: 1051024, // 블러드 데빌즈 로브 → 레드 문라이트
  1050053: 1051044, // 블루 아나카문 → 블루 아나카룬
  1050103: 1051102, // 블루 바루나 → 블루 바즈라
  1050165: 1051204, // 모험가의 레골라스 슈트 → 모험가의 루이마리
  1050059: 1051042, // 청자로 → 청초로
  1050107: 1051106, // 블루 아르주나 → 블루 아르미스
  1050166: 1051205, // 모험가의 너클 베스트 슈트 → 모험가의 퍼플 후르츠
  1050099: 1051093, // 다크 카티나스 → 다크 카테
};

function dress(items: number[], appearance: Appearance): number[] {
  if (appearance.gender !== 'female') return items;
  return items.map((itemId) => FEMALE_EQUIVALENTS[itemId] ?? itemId);
}

// 장비 ID 는 KMS 389 아이템 목록에서 요구 직업·요구 레벨로 골랐다. 5차는 아케인셰이드, 6차는 에테르넬
export const JOB_LINES: Record<JobLineId, JobLine> = {
  warrior: {
    id: 'warrior',
    className: '전사',
    names: ['검사', '파이터', '크루세이더', '히어로'],
    color: 0xd64541,
    outfits: [
      [1040002, 1060002, 1002043, 1072039],
      [1050011, 1002023, 1072039],
      [1050081, 1002029, 1072149],
      [1052075, 1002377, 1072220],
      [1053063, 1004808, 1073158],
      [1042433, 1062285, 1005980, 1073158],
    ],
    weapons: [1302000, 1302020],
    skills: [1001005, 1101011, 1111010, 1121008],
    attackAction: 'swingOF',
    fallbackRange: 120,
  },
  magician: {
    id: 'magician',
    className: '마법사',
    names: ['매지션', '위자드(불,독)', '메이지(불,독)', '아크메이지(불,독)'],
    color: 0x4a6fdc,
    outfits: [
      [1040002, 1060002, 1002017, 1072006],
      [1050002, 1002034, 1072076],
      [1050053, 1002243, 1072139],
      [1050103, 1002399, 1072224],
      [1053064, 1004809, 1073159],
      [1042434, 1062286, 1005981, 1073159],
    ],
    weapons: [1382000, 1382009],
    skills: [2001008, 2101004, 2111002, 2121006],
    attackAction: 'swingO1',
    fallbackRange: 350,
  },
  archer: {
    id: 'archer',
    className: '궁수',
    names: ['아처', '헌터', '레인저', '보우마스터'],
    color: 0x3fa34d,
    outfits: [
      [1040002, 1060002, 1002010, 1072015],
      [1050165, 1002162, 1072080],
      [1050059, 1002268, 1072145],
      [1050107, 1002407, 1072228],
      [1053065, 1004810, 1073160],
      [1042435, 1062287, 1005982, 1073160],
    ],
    weapons: [1452002, 1452016],
    skills: [3001004, 3101005, 3101005, 3121015],
    attackAction: 'shoot1',
    fallbackRange: 400,
  },
  thief: {
    id: 'thief',
    className: '도적',
    names: ['로그', '어쌔신', '허밋', '나이트로드'],
    color: 0x6b3fa0,
    outfits: [
      [1040002, 1060002, 1002125, 1072071],
      [1050166, 1002174, 1072035],
      [1052524, 1002249, 1072152],
      [1050099, 1002383, 1072216],
      [1053066, 1004811, 1073161],
      [1042436, 1062288, 1005983, 1073161],
    ],
    weapons: [1472000, 1472030],
    skills: [4001344, 4101013, 4111015, 4121017],
    attackAction: 'swingO1',
    fallbackRange: 350,
  },
  pirate: {
    id: 'pirate',
    className: '해적',
    names: ['해적', '인파이터', '버커니어', '바이퍼'],
    color: 0x8a6a4a,
    outfits: [
      [1052095, 1002610, 1072001],
      [1052107, 1002622, 1072294],
      [1052119, 1002634, 1072306],
      [1052131, 1002646, 1072318],
      [1053067, 1004812, 1073162],
      [1042437, 1062289, 1005984, 1073162],
    ],
    weapons: [1482000, 1482020],
    skills: [5001002, 5101012, 5111002, 5121007],
    attackAction: 'swingOF',
    fallbackRange: 120,
  },
};

/** 0이면 초보자, 1~6은 전직 차수 */
export function advancementTier(level: number): number {
  return ADVANCEMENT_LEVELS.filter((required) => level >= required).length;
}

export interface JobView {
  tier: number;
  /** 「파이터 · 2차」 처럼 차수까지 붙인 이름 */
  title: string;
  /** 캐릭터 렌더에 넘기는 아이템 ID 목록 */
  look: number[];
  attackAction: string;
  skillId: number | null;
  fallbackRange: number;
  /** 1차 전직 레벨이 됐는데 아직 직업을 안 고른 상태 */
  canChooseJob: boolean;
}

export function describeJob(level: number, jobLine: JobLineId | null, appearance: Appearance): JobView {
  const body = baseLook(appearance);
  const tier = advancementTier(level);
  if (!jobLine || tier === 0) {
    return {
      tier: 0,
      title: '초보자',
      look: [...body, ...dress(STARTER_CLOTHES, appearance)],
      attackAction: 'swingO1',
      skillId: null,
      fallbackRange: 60,
      canChooseJob: tier > 0,
    };
  }
  const line = JOB_LINES[jobLine];
  return {
    tier,
    title: `${line.names[Math.min(tier, 4) - 1]} · ${tier}차`,
    look: [...body, ...dress(line.outfits[tier - 1], appearance), line.weapons[tier >= 3 ? 1 : 0]],
    attackAction: line.attackAction,
    skillId: line.skills[Math.min(tier, 4) - 1],
    fallbackRange: line.fallbackRange,
    canChooseJob: false,
  };
}
