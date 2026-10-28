import type { Era } from '../maple/api';
import { type Appearance, baseLook } from './appearance';
import { CLASSIC_JOB_BRANCHES, CLASSIC_JOB_LINES } from './jobs.classic';

export type JobLineId = 'warrior' | 'magician' | 'archer' | 'thief' | 'pirate';

/** 2차 전직 때 고르는 갈래. 계열마다 원작 모험가 갈래이고, 갈래마다 3·4차가 정해져 있다 */
export type JobBranchId =
  | 'hero'
  | 'paladin'
  | 'darkKnight'
  | 'firePoison'
  | 'iceLightning'
  | 'bishop'
  | 'bowmaster'
  | 'marksman'
  | 'nightLord'
  | 'shadower'
  | 'viper'
  | 'captain';

/** 2차 갈래를 고르기 전에는 계열, 고른 뒤에는 갈래. 이름·장비·스킬을 정한다 */
export type JobPath = JobLineId | JobBranchId;

export interface JobLine {
  id: JobLineId;
  className: string;
  /** 1차 이름 */
  firstName: string;
  /** 직업 선택 창에서 구분용으로만 쓰는 색 */
  color: number;
  /** 차수별 장비 아이템 ID (무기 제외). 시대의 차수만큼 있다. 남자 기준이고 여자는 FEMALE_EQUIVALENTS 로 바꿔 입는다. 원작 방어구는 계열 단위라 갈래가 같이 쓴다 */
  outfits: number[][];
  /** 1차 무기 */
  weapon: number;
  /** 1차 공격 스킬 */
  skill: number;
  attackAction: string;
  /** 스킬 데이터에 사거리가 없을 때 쓰는 값 */
  fallbackRange: number;
  /** 2차 갈래. 첫 번째가 갈래를 고르기 전 하나뿐이던 길이라, 갈래 칸이 없던 저장은 이 갈래로 읽는다 */
  branches: JobBranchId[];
}

export interface JobBranch {
  id: JobBranchId;
  line: JobLineId;
  /** 2차부터 4차까지. 5차·6차는 4차 이름을 그대로 쓴다 */
  names: [second: string, third: string, fourth: string];
  /** 2·3·4차 직업 번호. 스킬북 번호이자 스킬 ID 앞자리다 */
  jobIds: [second: number, third: number, fourth: number];
  /** 2차부터 차수마다 드는 무기. 마지막 무기를 그 뒤 차수가 그대로 든다(지금 시대는 [2차, 3차부터]) */
  weapons: number[];
  /**
   * 2·3·4차 공격 스킬 ID. 5·6차는 4차 스킬을 쓴다.
   * 스킬 전용 캐릭터 동작은 API 가 그려 주지 않아서 캐릭터는 무기 기본 공격 동작(attackAction)으로 휘두른다
   */
  skills: [number, number, number];
  attackAction: string;
  /** 무기 그림이 이 동작에만 있다. 창·폴암은 stand2, 석궁·두손 둔기는 walk2 뿐이라 stand1·walk1 로 그리면 무기가 빠진다 */
  standAction?: 'stand2';
  walkAction?: 'walk2';
  /** 스킬 데이터에 사거리가 없을 때 쓰는 값. 원거리 갈래일수록 멀리 서서 싸운다 */
  fallbackRange: number;
}

/** 1차부터 6차까지 전직 레벨 */
export const ADVANCEMENT_LEVELS = [10, 30, 60, 100, 200, 260] as const;
/** 클래식은 빅뱅 전처럼 4차까지다 */
export const CLASSIC_ADVANCEMENT_LEVELS = [10, 30, 70, 120] as const;

/** 그 시대의 전직 레벨. 길이가 곧 마지막 차수다 */
export const advancementLevels = (era: Era = 'current'): readonly number[] =>
  era === 'classic' ? CLASSIC_ADVANCEMENT_LEVELS : ADVANCEMENT_LEVELS;

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
  1040068: 1041055, // 다크 헌터 아머 → 블랙 헌트리스 아머
  1060057: 1061051, // 다크 헌터 팬츠 → 블랙 헌트리스 팬츠
  1040058: 1041048, // 다크 실버 스틸러 → 블랙 스틸
  1060044: 1061044, // 다크 실버 스틸러 바지 → 블랙 스틸 바지
  1040100: 1041096, // 다크 스콜피오 → 엄버 맨티스
  1060089: 1061095, // 다크 스콜피오 바지 → 엄버 맨티스 바지
};

// 평범한 청치마는 v83 에 없어서 클래식은 v83 에 있는 남색 미니스커트를 입는다
const CLASSIC_FEMALE_EQUIVALENTS: Record<number, number> = { 1060002: 1061008 };

function dress(items: number[], appearance: Appearance, era: Era): number[] {
  if (appearance.gender !== 'female') return items;
  return items.map(
    (itemId) => (era === 'classic' ? CLASSIC_FEMALE_EQUIVALENTS[itemId] : undefined) ?? FEMALE_EQUIVALENTS[itemId] ?? itemId,
  );
}

// 장비 ID 는 KMS 389 아이템 목록에서 요구 직업·요구 레벨로 골랐다. 5차는 아케인셰이드, 6차는 에테르넬
export const JOB_LINES: Record<JobLineId, JobLine> = {
  warrior: {
    id: 'warrior',
    className: '전사',
    firstName: '검사',
    color: 0xd64541,
    outfits: [
      [1040002, 1060002, 1002043, 1072039],
      [1050011, 1002023, 1072039],
      [1050081, 1002029, 1072149],
      [1052075, 1002377, 1072220],
      [1053063, 1004808, 1073158],
      [1042433, 1062285, 1005980, 1073158],
    ],
    weapon: 1302000,
    skill: 1001005,
    attackAction: 'swingOF',
    fallbackRange: 120,
    branches: ['hero', 'paladin', 'darkKnight'],
  },
  magician: {
    id: 'magician',
    className: '마법사',
    firstName: '매지션',
    color: 0x4a6fdc,
    outfits: [
      [1040002, 1060002, 1002017, 1072006],
      [1050002, 1002034, 1072076],
      [1050053, 1002243, 1072139],
      [1050103, 1002399, 1072224],
      [1053064, 1004809, 1073159],
      [1042434, 1062286, 1005981, 1073159],
    ],
    weapon: 1382000,
    skill: 2001008,
    attackAction: 'swingO1',
    fallbackRange: 350,
    branches: ['firePoison', 'iceLightning', 'bishop'],
  },
  archer: {
    id: 'archer',
    className: '궁수',
    firstName: '아처',
    color: 0x3fa34d,
    outfits: [
      [1040002, 1060002, 1002010, 1072015],
      [1050165, 1002162, 1072080],
      [1050059, 1002268, 1072145],
      [1050107, 1002407, 1072228],
      [1053065, 1004810, 1073160],
      [1042435, 1062287, 1005982, 1073160],
    ],
    weapon: 1452002,
    skill: 3001004,
    attackAction: 'shoot1',
    fallbackRange: 400,
    branches: ['bowmaster', 'marksman'],
  },
  thief: {
    id: 'thief',
    className: '도적',
    firstName: '로그',
    color: 0x6b3fa0,
    outfits: [
      [1040002, 1060002, 1002125, 1072071],
      [1050166, 1002174, 1072035],
      [1052524, 1002249, 1072152],
      [1050099, 1002383, 1072216],
      [1053066, 1004811, 1073161],
      [1042436, 1062288, 1005983, 1073161],
    ],
    weapon: 1472000,
    skill: 4001344,
    attackAction: 'swingO1',
    fallbackRange: 350,
    branches: ['nightLord', 'shadower'],
  },
  pirate: {
    id: 'pirate',
    className: '해적',
    firstName: '해적',
    color: 0x8a6a4a,
    outfits: [
      [1052095, 1002610, 1072001],
      [1052107, 1002622, 1072294],
      [1052119, 1002634, 1072306],
      [1052131, 1002646, 1072318],
      [1053067, 1004812, 1073162],
      [1042437, 1062289, 1005984, 1073162],
    ],
    weapon: 1482000,
    skill: 5001002,
    attackAction: 'swingOF',
    fallbackRange: 120,
    branches: ['viper', 'captain'],
  },
};

// 이름은 KMS 389 의 전직 퀘스트(1411~1446·32220~32231)와 String/Skill.img 의 스킬북 이름(bookName)으로 맞췄다.
// 드래곤나이트는 지금 KMS 에서 버서커다. 무기는 아이템 목록의 요구 직업·레벨로 골랐다(2차 Lv.10~30, 3차부터 메이플 무기).
// 갈래마다 첫 번째 갈래는 갈래가 생기기 전의 하나뿐이던 길과 이름·무기·스킬이 같다
export const JOB_BRANCHES: Record<JobBranchId, JobBranch> = {
  hero: {
    id: 'hero',
    line: 'warrior',
    names: ['파이터', '크루세이더', '히어로'],
    jobIds: [110, 111, 112],
    weapons: [1302000, 1302020],
    skills: [1101011, 1111010, 1121008],
    attackAction: 'swingOF',
    fallbackRange: 120,
  },
  paladin: {
    id: 'paladin',
    line: 'warrior',
    names: ['페이지', '나이트', '팔라딘'],
    jobIds: [120, 121, 122],
    // 미스릴 모울 → 메이플 빅 모울(두손 둔기)
    weapons: [1422001, 1422014],
    skills: [1201015, 1211018, 1221019],
    attackAction: 'swingT1',
    walkAction: 'walk2',
    fallbackRange: 120,
  },
  darkKnight: {
    id: 'darkKnight',
    line: 'warrior',
    names: ['스피어맨', '버서커', '다크나이트'],
    jobIds: [130, 131, 132],
    // 삼지창 → 메이플 스피어
    weapons: [1432002, 1432012],
    skills: [1301012, 1311011, 1321012],
    attackAction: 'stabT1',
    standAction: 'stand2',
    walkAction: 'walk2',
    fallbackRange: 140,
  },
  firePoison: {
    id: 'firePoison',
    line: 'magician',
    names: ['위자드(불,독)', '메이지(불,독)', '아크메이지(불,독)'],
    jobIds: [210, 211, 212],
    weapons: [1382000, 1382009],
    skills: [2101004, 2111002, 2121006],
    attackAction: 'swingO1',
    fallbackRange: 350,
  },
  iceLightning: {
    id: 'iceLightning',
    line: 'magician',
    names: ['위자드(썬,콜)', '메이지(썬,콜)', '아크메이지(썬,콜)'],
    jobIds: [220, 221, 222],
    // 아이스 완드 → 메이플 샤이니 완드
    weapons: [1372004, 1372034],
    skills: [2201005, 2211002, 2221006],
    attackAction: 'swingO1',
    fallbackRange: 350,
  },
  bishop: {
    id: 'bishop',
    line: 'magician',
    names: ['클레릭', '프리스트', '비숍'],
    jobIds: [230, 231, 232],
    // 써클윈드 스태프 → 메이플 라마 스태프
    weapons: [1382017, 1382012],
    skills: [2301005, 2311004, 2321007],
    attackAction: 'swingO1',
    fallbackRange: 350,
  },
  bowmaster: {
    id: 'bowmaster',
    line: 'archer',
    names: ['헌터', '레인저', '보우마스터'],
    jobIds: [310, 311, 312],
    weapons: [1452002, 1452016],
    skills: [3101005, 3101005, 3121015],
    attackAction: 'shoot1',
    fallbackRange: 400,
  },
  marksman: {
    id: 'marksman',
    line: 'archer',
    names: ['사수', '저격수', '신궁'],
    jobIds: [320, 321, 322],
    // 석궁 → 메이플 크로우
    weapons: [1462001, 1462014],
    skills: [3201011, 3211018, 3221007],
    attackAction: 'shoot2',
    walkAction: 'walk2',
    fallbackRange: 450,
  },
  nightLord: {
    id: 'nightLord',
    line: 'thief',
    names: ['어쌔신', '허밋', '나이트로드'],
    jobIds: [410, 411, 412],
    weapons: [1472000, 1472030],
    skills: [4101013, 4111015, 4121017],
    attackAction: 'swingO1',
    fallbackRange: 350,
  },
  shadower: {
    id: 'shadower',
    line: 'thief',
    names: ['시프', '시프마스터', '섀도어'],
    jobIds: [420, 421, 422],
    // 리프 크로 → 메이플 바그나(단검)
    weapons: [1332012, 1332025],
    skills: [4201012, 4211002, 4221014],
    attackAction: 'stabO1',
    fallbackRange: 120,
  },
  viper: {
    id: 'viper',
    line: 'pirate',
    names: ['인파이터', '버커니어', '바이퍼'],
    jobIds: [510, 511, 512],
    weapons: [1482000, 1482020],
    skills: [5101012, 5111002, 5121007],
    attackAction: 'swingOF',
    fallbackRange: 120,
  },
  captain: {
    id: 'captain',
    line: 'pirate',
    names: ['건슬링어', '발키리', '캡틴'],
    jobIds: [520, 521, 522],
    // 피스톨 → 메이플 건
    weapons: [1492000, 1492020],
    skills: [5201001, 5211008, 5221017],
    attackAction: 'shoot2',
    fallbackRange: 400,
  },
};

const isBranch = (path: JobPath): path is JobBranchId => path in JOB_BRANCHES;

/** 그 시대의 계열 표. 갈래 ID·계열 ID 는 시대마다 같고 이름·장비·스킬만 다르다 */
export const jobLines = (era: Era = 'current'): Record<JobLineId, JobLine> => (era === 'classic' ? CLASSIC_JOB_LINES : JOB_LINES);
export const jobBranches = (era: Era = 'current'): Record<JobBranchId, JobBranch> =>
  era === 'classic' ? CLASSIC_JOB_BRANCHES : JOB_BRANCHES;

export const lineOf = (path: JobPath): JobLineId => (isBranch(path) ? JOB_BRANCHES[path].line : path);

/** 계열의 첫 갈래. 갈래 칸이 없던 저장은 2차를 이미 했으면 이 갈래로 읽는다 */
export const defaultBranch = (line: JobLineId): JobBranchId => JOB_LINES[line].branches[0];

/** 캐릭터의 직업 길. 직업이 없으면 null, 갈래를 아직 안 골랐거나 다른 계열 갈래면 계열 */
export function jobPath(jobLine: JobLineId | null, jobBranch: JobBranchId | null): JobPath | null {
  if (!jobLine) return null;
  return jobBranch && JOB_BRANCHES[jobBranch]?.line === jobLine ? jobBranch : jobLine;
}

/** 1차부터 마지막 차수까지 그 차수의 이름. 4차 뒤(지금 시대 5·6차)는 4차 이름이다. 갈래 없이 2차 이상은 없다 */
export function tierName(path: JobPath | null, tier: number, era: Era = 'current'): string {
  if (!path || tier <= 0) return '초보자';
  if (tier === 1 || !isBranch(path)) return jobLines(era)[lineOf(path)].firstName;
  return jobBranches(era)[path].names[Math.min(tier, 4) - 2];
}

/** 0이면 초보자, 1부터는 전직 차수(지금 시대 6차, 클래식 4차까지) */
export function advancementTier(level: number, era: Era = 'current'): number {
  return advancementLevels(era).filter((required) => level >= required).length;
}

/** 길까지 따진 차수. 직업이 없으면 0, 2차 갈래를 아직 안 골랐으면 레벨이 넘어도 1 이다 */
export function pathTier(level: number, path: JobPath | null, era: Era = 'current'): number {
  if (!path) return 0;
  const tier = advancementTier(level, era);
  return isBranch(path) ? tier : Math.min(tier, 1);
}

export interface JobView {
  tier: number;
  /** 「파이터 · 2차」 처럼 차수까지 붙인 이름 */
  title: string;
  /** 캐릭터 렌더에 넘기는 아이템 ID 목록 */
  look: number[];
  /** 서 있을 때·걸을 때 동작. 무기에 그림이 있는 동작이다 */
  standAction: string;
  walkAction: string;
  attackAction: string;
  skillId: number | null;
  /** 스킬창에서 고른 skillId 를 맵에 못 그릴 때 대신 쓰는 자동 스킬. 없으면 skillId 가 곧 자동 스킬이다 */
  autoSkillId?: number | null;
  fallbackRange: number;
  /** 1차 전직 레벨이 됐는데 아직 직업을 안 고른 상태 */
  canChooseJob: boolean;
  /** 2차 전직 레벨이 됐는데 아직 갈래를 안 고른 계열. 그동안은 1차에 머문다 */
  branchChoice: JobLineId | null;
}

export function describeJob(level: number, path: JobPath | null, appearance: Appearance, era: Era = 'current'): JobView {
  const body = baseLook(appearance);
  const tier = pathTier(level, path, era);
  if (!path || tier === 0) {
    return {
      tier: 0,
      title: '초보자',
      look: [...body, ...dress(STARTER_CLOTHES, appearance, era)],
      standAction: 'stand1',
      walkAction: 'walk1',
      attackAction: 'swingO1',
      skillId: null,
      fallbackRange: 60,
      canChooseJob: advancementTier(level, era) > 0,
      branchChoice: null,
    };
  }
  const line = jobLines(era)[lineOf(path)];
  const branch = isBranch(path) && tier >= 2 ? jobBranches(era)[path] : null;
  const outfit = dress(line.outfits[tier - 1], appearance, era);
  const title = `${tierName(path, tier, era)} · ${tier}차`;
  if (!branch) {
    return {
      tier,
      title,
      look: [...body, ...outfit, line.weapon],
      standAction: 'stand1',
      walkAction: 'walk1',
      attackAction: line.attackAction,
      skillId: line.skill,
      fallbackRange: line.fallbackRange,
      canChooseJob: false,
      branchChoice: advancementTier(level, era) >= 2 ? line.id : null,
    };
  }
  return {
    tier,
    title,
    look: [...body, ...outfit, branchWeapon(branch, tier)],
    standAction: branch.standAction ?? 'stand1',
    walkAction: branch.walkAction ?? 'walk1',
    attackAction: branch.attackAction,
    skillId: branchSkill(branch, tier),
    fallbackRange: branch.fallbackRange,
    canChooseJob: false,
    branchChoice: null,
  };
}

/** 2차부터 그 차수에 드는 무기. 표가 끝나면 마지막 무기다 */
export const branchWeapon = (branch: JobBranch, tier: number): number =>
  branch.weapons[Math.min(tier - 2, branch.weapons.length - 1)];

/** 2차부터 그 차수의 자동 공격 스킬. 4차 뒤는 4차 스킬이다 */
export const branchSkill = (branch: JobBranch, tier: number): number =>
  branch.skills[Math.min(tier - 2, branch.skills.length - 1)];
