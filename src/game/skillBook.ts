import { JOB_LINES, type JobLineId } from './jobs';

/**
 * 공격 스킬인지. ready 는 사냥에 고를 수 있는 것, noArt 는 원작에서는 공격이지만 maplestory.io 스킬 데이터에
 * 이펙트 그림이 없거나(프레임 0~1장) 받을 수 없어서 맵에 그릴 수 없는 것이다
 */
export type AttackArt = 'ready' | 'noArt';

export interface SkillEntry {
  id: number;
  name: string;
  attack?: AttackArt;
}

/** 0 은 초보자, 1~6 은 전직 차수 */
export const SKILL_TIERS = [0, 1, 2, 3, 4, 5, 6] as const;

const skill = (id: number, name: string, attack?: AttackArt): SkillEntry => (attack ? { id, name, attack } : { id, name });
const ready = (id: number, name: string) => skill(id, name, 'ready');
const noArt = (id: number, name: string) => skill(id, name, 'noArt');

// 모든 모험가 초보자가 배우는 세 가지. 달팽이 세마리는 /job/skill 이 500 을 내서 이펙트를 못 받는다
const BEGINNER: SkillEntry[] = [noArt(1000, '달팽이 세마리'), skill(1001, '회복'), skill(1002, '민첩한 몸놀림')];

// 1~4차는 KMS 389 /job/{직업}/skillbook 에서 숨김(invisible)·하이퍼를 뺀 것이다. 바이퍼(512)는 스킬북 응답이 서버에서
// 터져서 Skill/512.img 목록과 /job/skill/{ID} 로 같은 기준을 맞췄다. 5차는 Etc/VCore.img CoreData 의 스킬 코어 중
// 이 직업·계열·모험가 공용인 것, 6차는 Etc/HexaCore.img jobCore 의 스킬·마스터리 코어와 공용 솔 야누스다.
// ready·noArt 는 /job/skill/{ID} 의 damage 속성과 effect 프레임 수로 골랐다
const BOOKS: Record<JobLineId, SkillEntry[][]> = {
  warrior: [
    [
      skill(1000003, '아이언 바디'),
      skill(1000009, '워리어 마스터리'),
      ready(1001005, '슬래시 블러스트'),
      skill(1001008, '워리어 리프'),
      ready(1001010, '리프 어택'),
      ready(1001011, '어퍼 차지'),
    ],
    [
      skill(1100000, '웨폰 마스터리'),
      skill(1100002, '파이널 어택'),
      skill(1100009, '피지컬 트레이닝'),
      skill(1100015, '웨폰 액셀레이션'),
      skill(1101006, '스피릿 블레이드'),
      ready(1101011, '브랜디쉬'),
      skill(1101013, '콤보 어택'),
      ready(1101014, '플래시 슬래시'),
    ],
    [
      skill(1110000, '셀프 리커버리'),
      skill(1110009, '찬스 어택'),
      skill(1110011, '인듀어'),
      skill(1110013, '콤보 시너지'),
      skill(1111003, '스카링 소드'),
      ready(1111010, '브레이브 슬래시'),
      ready(1111012, '돌진'),
      ready(1111016, '오라 블레이드'),
    ],
    [
      skill(1120003, '어드밴스드 콤보'),
      skill(1120012, '컴뱃 마스터리'),
      skill(1120013, '어드밴스드 파이널 어택'),
      skill(1120014, '스탠스'),
      skill(1121000, '메이플 용사'),
      ready(1121008, '레이징 블로우'),
      skill(1121010, '인레이지'),
      skill(1121011, '용사의 의지'),
      ready(1121015, '인사이징'),
      skill(1121016, '매직 크래쉬'),
    ],
    [
      noArt(400011001, '소드 오브 버닝 소울'),
      ready(400011027, '콤보 데스폴트'),
      ready(400011073, '콤보 인스팅트'),
      ready(400011124, '소드 일루전'),
      skill(400011000, '오라 웨폰'),
      skill(400011066, '바디 오브 스틸'),
      skill(400001010, '블리츠 실드'),
    ],
    [
      noArt(1141500, '스피릿 칼리버'),
      ready(1141000, '레이징 블로우 VI'),
      ready(1141002, '레이지 업라이징 VI'),
      skill(500001000, '솔 야누스'),
    ],
  ],
  magician: [
    [
      skill(2000006, 'MP 증가'),
      skill(2000010, '매직 아머'),
      skill(2001002, '매직 가드'),
      ready(2001008, '에너지 볼트'),
      skill(2001009, '텔레포트'),
      skill(2001011, '마나 웨이브'),
    ],
    [
      skill(2100000, 'MP 이터'),
      skill(2100006, '스펠 마스터리'),
      skill(2100007, '하이 위즈덤'),
      skill(2100009, '엘리멘탈 드레인'),
      skill(2100011, '매직 액셀레이션'),
      skill(2101001, '메디테이션'),
      ready(2101004, '플레임 오브'),
      ready(2101005, '포이즌 브레스'),
      skill(2101010, '이그나이트'),
    ],
    [
      skill(2110000, '익스트림 매직(불,독)'),
      skill(2110001, '엘리먼트 앰플리피케이션'),
      skill(2110009, '매직 크리티컬'),
      skill(2110015, '엘리멘탈 리셋'),
      ready(2111002, '익스플로젼'),
      ready(2111003, '포이즌 미스트'),
      skill(2111007, '텔레포트 마스터리'),
      skill(2111011, '엘리멘탈 어뎁팅(불,독)'),
      ready(2111013, '포이즌 리젼'),
      skill(2111016, '텔레포트 부스트'),
    ],
    [
      skill(2120010, '아케인 에임'),
      skill(2120012, '마스터 매직'),
      skill(2120014, '퍼번트 드레인'),
      skill(2121000, '메이플 용사'),
      ready(2121003, '미스트 이럽션'),
      skill(2121004, '인피니티'),
      ready(2121005, '이프리트'),
      ready(2121006, '플레임 스윕'),
      ready(2121007, '메테오'),
      skill(2121008, '용사의 의지'),
      ready(2121011, '플레임 헤이즈'),
    ],
    [
      noArt(400021001, '도트 퍼니셔'),
      ready(400021028, '포이즌 노바'),
      ready(400021066, '퓨리 오브 이프리트'),
      ready(400021101, '포이즌 체인'),
      skill(400021000, '오버로드 마나'),
      skill(400021060, '에테리얼 폼'),
      skill(400001021, '언스태이블 메모라이즈'),
    ],
    [
      noArt(2141500, '인페르날 베놈'),
      ready(2141000, '플레임 스윕 VI'),
      ready(2141003, '플레임 헤이즈 VI'),
      ready(2141005, '미스트 이럽션 VI'),
      skill(500001000, '솔 야누스'),
    ],
  ],
  archer: [
    [skill(3000001, '크리티컬 샷'), skill(3000002, '아처 마스터리'), ready(3001004, '애로우 블로우'), skill(3001007, '더블 점프')],
    [
      skill(3100000, '보우 마스터리'),
      skill(3100001, '파이널 어택 : 활'),
      skill(3100002, '보우 액셀레이션'),
      skill(3100006, '피지컬 트레이닝'),
      skill(3100011, '소울 애로우 : 활'),
      ready(3101005, '바람의 시'),
      ready(3101008, '리트리트 샷'),
      skill(3101009, '퀴버 카트리지'),
    ],
    [
      skill(3110001, '모탈 블로우'),
      skill(3110007, '닷지'),
      skill(3110012, '컨센트레이션'),
      skill(3110014, '마크맨쉽'),
      skill(3110019, '익스트림 아쳐리 : 활'),
      noArt(3111005, '피닉스'),
      noArt(3111013, '애로우 플래터'),
      ready(3111015, '플레시 미라주'),
      skill(3111017, '퀴버 플로우'),
    ],
    [
      skill(3120005, '보우 엑스퍼트'),
      skill(3120007, '일루전 스탭'),
      skill(3120008, '어드밴스드 파이널 어택'),
      skill(3120018, '아머 피어싱'),
      skill(3120021, '플레시 미라주 II'),
      skill(3120022, '어드밴스드 퀴버'),
      skill(3121000, '메이플 용사'),
      skill(3121002, '샤프 아이즈'),
      skill(3121009, '용사의 의지'),
      ready(3121015, '언카운터블 애로우'),
      noArt(3121020, '폭풍의 시'),
    ],
    [
      ready(400031020, '잔영의 시'),
      ready(400031028, '퀴버 풀버스트'),
      ready(400031053, '실루엣 미라주'),
      skill(400031002, '애로우 레인'),
      skill(400031000, '가이디드 애로우'),
      skill(400031023, '크리티컬 리인포스'),
      skill(400001012, '이볼브'),
    ],
    [
      noArt(3141500, '어센던트 셰이드'),
      noArt(3141000, '폭풍의 시 VI'),
      ready(3141002, '언카운터블 애로우 VI'),
      noArt(3141004, '애로우 플래터 VI'),
      skill(500001000, '솔 야누스'),
    ],
  ],
  thief: [
    [
      skill(4000000, '님블 바디'),
      skill(4000005, '헤이스트'),
      skill(4000012, '사이드 스텝'),
      skill(4001003, '다크 사이트'),
      skill(4001011, '플래시 점프'),
      ready(4001013, '샤프 슬래시'),
      ready(4001334, '더블 스탭'),
      ready(4001344, '럭키 세븐'),
    ],
    [
      skill(4100000, '자벨린 마스터리'),
      skill(4100001, '크리티컬 스로우'),
      skill(4100007, '피지컬 트레이닝'),
      skill(4100017, '자벨린 액셀레이션'),
      ready(4101010, '윈드 탈리스만'),
      skill(4101011, '마크 오브 어쌔신'),
      ready(4101013, '슈리켄 버스트'),
      skill(4101015, '쉐도우 러쉬'),
      skill(4101016, '쉐도우 리프'),
    ],
    [
      skill(4110008, '래디컬 다크니스'),
      skill(4110011, '베놈'),
      skill(4110012, '숙련된 표창술'),
      skill(4110014, '아드레날린'),
      skill(4110016, '스피릿 자벨린'),
      skill(4111002, '쉐도우 파트너'),
      ready(4111007, '다크 플레어'),
      ready(4111010, '트리플 스로우'),
      ready(4111015, '슈리켄 챌린지'),
    ],
    [
      skill(4120002, '페이크'),
      skill(4120011, '페이탈 베놈'),
      skill(4120012, '자벨린 엑스퍼트'),
      skill(4120014, '다크 세레니티'),
      skill(4120018, '마크 오브 나이트로드'),
      skill(4121000, '메이플 용사'),
      skill(4121009, '용사의 의지'),
      ready(4121013, '쿼드러플 스로우'),
      skill(4121015, '퍼지 에어리어'),
      ready(4121016, '써든레이드'),
      ready(4121017, '쇼다운 챌린지'),
    ],
    [
      ready(400041001, '스프레드 스로우'),
      ready(400041020, '풍마수리검'),
      ready(400041038, '다크로드의 비전서'),
      skill(400041061, '스로우 블래스팅'),
      skill(400041000, '베놈 버스트'),
      skill(400041032, '레디 투 다이'),
      skill(400001023, '얼티밋 다크 사이트'),
    ],
    [
      noArt(4141500, '생사여탈'),
      ready(4141000, '쿼드러플 스로우 VI'),
      ready(4141002, '마크 오브 어쌔신 VI'),
      skill(500001000, '솔 야누스'),
    ],
  ],
  pirate: [
    [
      skill(5000000, '퀵모션'),
      skill(5000007, '크리티컬 로어'),
      ready(5001002, '써머솔트 킥'),
      ready(5001003, '더블 파이어'),
      skill(5001005, '대쉬'),
      skill(5001010, '파이렛 리프'),
    ],
    [
      skill(5100001, '너클 마스터리'),
      skill(5100009, 'HP 증가'),
      skill(5100010, '피지컬 트레이닝'),
      skill(5100011, '멘탈 클리어리티'),
      skill(5100013, '인듀어런스'),
      skill(5100016, '어드밴스드 대쉬'),
      noArt(5100018, '씨 서펜트 버스트'),
      skill(5100020, '너클 액셀레이션'),
      skill(5100021, '볼텍스 점프'),
      ready(5101012, '쇼크 웨이브'),
      skill(5101017, '씨 서펜트'),
    ],
    [
      skill(5110000, '그로기 마스터리'),
      skill(5110010, '윌로우 디펜시브'),
      skill(5110011, '크리티컬 레이지'),
      skill(5110016, '씨 서펜트 강화 I'),
      skill(5110018, '서펜트 어썰트'),
      ready(5111002, '터닝 킥'),
      skill(5111007, '럭키 다이스'),
      ready(5111009, '스크류 펀치'),
      skill(5111017, '서펜트 스톤'),
    ],
    [
      skill(5120011, '디펜스 폼'),
      skill(5120012, '더블 럭키 다이스'),
      skill(5120014, '가드 크러쉬'),
      skill(5120022, '씨 서펜트 강화 II'),
      skill(5120024, '씨 서펜트 인레이지'),
      skill(5120026, '서펜트 어썰트 인레이지'),
      skill(5120028, '오펜스 폼'),
      skill(5120029, '씨 서펜트 버스트 II'),
      skill(5121000, '메이플 용사'),
      ready(5121007, '피스트 인레이지'),
      skill(5121008, '용사의 의지'),
      skill(5121009, '윈드 부스터'),
      skill(5121010, '타임 리프'),
      ready(5121013, '전함 노틸러스'),
      skill(5121015, '바이퍼지션'),
      ready(5121016, '훅 봄버'),
    ],
    [
      ready(400051002, '라이트닝 폼'),
      ready(400051015, '서펜트 스크류'),
      ready(400051042, '퓨리어스 차지'),
      noArt(400051070, '하울링 피스트'),
      skill(400051000, '로디드 다이스'),
      skill(400051033, '오버 드라이브'),
      skill(400001017, '파이렛 플래그'),
    ],
    [
      noArt(5141500, '리버레이트 넵투누스'),
      ready(5141000, '피스트 인레이지 VI'),
      noArt(5140004, '씨 서펜트 VI'),
      ready(5141009, '전함 노틸러스 VI'),
      skill(500001000, '솔 야누스'),
    ],
  ],
};

/** 차수(0~6) 탭에 늘어놓는 스킬. 직업을 아직 안 골랐으면 초보자 탭만 있다 */
export function tierSkills(jobLine: JobLineId | null, tier: number): SkillEntry[] {
  if (tier === 0) return BEGINNER;
  if (!jobLine || tier < 0 || tier > 6) return [];
  return BOOKS[jobLine][tier - 1];
}

/** 지금 차수까지 배운 스킬. 초보자 스킬부터 차수 순서다 */
export function learnedSkills(jobLine: JobLineId | null, tier: number): SkillEntry[] {
  const reached = jobLine ? tier : 0;
  return SKILL_TIERS.filter((each) => each <= reached).flatMap((each) => tierSkills(jobLine, each));
}

/** 사냥에 고를 수 있는 공격 스킬 */
export function huntSkillChoices(jobLine: JobLineId | null, tier: number): SkillEntry[] {
  return learnedSkills(jobLine, tier).filter((entry) => entry.attack === 'ready');
}

/** 「자동」일 때 쓰는 스킬. 직업 장비처럼 차수마다 정해 둔 스킬이고 5·6차는 4차 스킬이다 */
export function autoHuntSkill(jobLine: JobLineId | null, tier: number): number | null {
  if (!jobLine || tier === 0) return null;
  return JOB_LINES[jobLine].skills[Math.min(tier, 4) - 1];
}

/**
 * 사냥에 실제로 쓸 스킬. 고른 스킬이 없거나 아직 못 배운(다른 캐릭터에서 옮겨 왔거나 목록에서 빠진) 스킬이면 자동이다.
 * 고른 스킬은 겉모습만 바꾼다. 보상·사냥 횟수는 스킬과 상관없다
 */
export function huntSkill(jobLine: JobLineId | null, tier: number, chosenId: number | null): number | null {
  if (chosenId !== null && huntSkillChoices(jobLine, tier).some((entry) => entry.id === chosenId)) return chosenId;
  return autoHuntSkill(jobLine, tier);
}

export function findSkill(jobLine: JobLineId | null, id: number): SkillEntry | null {
  return SKILL_TIERS.flatMap((tier) => tierSkills(jobLine, tier)).find((entry) => entry.id === id) ?? null;
}

/** Skill.wz 경로. 초보자 스킬 1000 은 `000.img/skill/0001000` 처럼 일곱 자리로 채운다 */
export function skillWzPath(id: number): { img: string; node: string } {
  const node = String(id).padStart(7, '0');
  return { img: node.slice(0, -4), node };
}

/** 스킬 이펙트가 맵에 그릴 만한지. 이펙트 레이어 프레임 수를 받는다. 한 장짜리는 빈 그림이다 */
export function hasUsableEffect(layerFrameCounts: number[]): boolean {
  return layerFrameCounts.reduce((sum, count) => sum + count, 0) >= 2;
}
