import { JOB_BRANCHES, JOB_LINES, type JobBranchId, type JobLineId, type JobPath, lineOf } from './jobs';

/**
 * attack 은 사냥에 쓰는 공격 스킬, active 는 스킬창에서 한 번씩 쓰는 버프·이동 같은 스킬, passive 는 쓰는 스킬이 아니다.
 * noArt 는 maplestory.io 스킬 데이터에 이펙트 그림이 없거나(프레임 0~1장) 데이터를 못 받아 맵에 그릴 수 없는 것이다
 */
export type SkillType = 'attack' | 'active' | 'passive';

export interface SkillEntry {
  id: number;
  name: string;
  type: SkillType;
  noArt?: true;
  /** 아이콘 노드의 `_outlink` 가 다른 스킬 그림을 가리킬 때 그 WZ 경로. 없으면 skillIconPath 의 기본 자리다 */
  icon?: string;
  /** /job/skill/{ID} 응답 크기(KB). 쓰거나 사냥에 고를 수 있는 스킬만 적었고, 미리 받을 순서·크기 제한에 쓴다 */
  kb?: number;
}

/** 0 은 초보자, 1~6 은 전직 차수 */
export const SKILL_TIERS = [0, 1, 2, 3, 4, 5, 6] as const;

const entry =
  (type: SkillType, noArt: boolean) =>
  (id: number, name: string, extra: Pick<SkillEntry, 'kb' | 'icon'> = {}): SkillEntry => ({
    id,
    name,
    type,
    ...(noArt ? { noArt: true as const } : {}),
    ...extra,
  });
const atk = entry('attack', false);
const atkX = entry('attack', true);
const act = entry('active', false);
const actX = entry('active', true);
const pas = entry('passive', false);

// 모든 모험가 초보자가 배우는 세 가지. 초보자 스킬은 /job/skill 이 500 을 내서 이펙트를 못 받는다
const BEGINNER: SkillEntry[] = [atkX(1000, '달팽이 세마리'), actX(1001, '회복'), actX(1002, '민첩한 몸놀림')];

// 1~4차는 KMS 389 /job/{직업}/skillbook 에서 숨김(invisible)·하이퍼를 뺀 것이다. 바이퍼(512)는 스킬북 응답이 서버에서
// 터져서 Skill/512.img 목록과 /job/skill/{ID} 로 같은 기준을 맞췄다. 5차는 Etc/VCore.img CoreData 의 스킬 코어 중
// 이 직업·계열·모험가 공용인 것, 6차는 Etc/HexaCore.img jobCore 의 스킬·마스터리 코어와 공용 솔 야누스다.
// 공격은 /job/skill/{ID} 의 damage 속성으로, 액티브·패시브는 WZ 노드에 action·affected 가 있는지, psd(패시브 표시)·
// info/type(50~53 은 패시브)과 effect 프레임 수로 골랐다. icon 은 `Skill/{img}/skill/{ID}/icon/_outlink` 를 미리 읽어
// 기본 자리와 다른 것만 적었다(실행 중에 링크를 다시 받지 않는다). kb 는 1~4차는 스킬북 응답의 스킬 크기에 8% 를 더한 값
// (/job/skill 응답이 그만큼 더 크다), 나머지는 /job/skill/{ID} 를 받아 잰 값이다
// 1차는 계열이 같이 배우고(FIRST), 2~6차는 2차 갈래마다 따로다(BRANCH_BOOKS). 갈래의 5차는 그 갈래 4차 직업 번호의 코어다
const FIRST: Record<JobLineId, SkillEntry[]> = {
  warrior: [
    pas(1000003, '아이언 바디'),
    pas(1000009, '워리어 마스터리'),
    atk(1001005, '슬래시 블러스트', { kb: 647 }),
    act(1001008, '워리어 리프', { kb: 2108 }),
    atk(1001010, '리프 어택', { kb: 407 }),
    atk(1001011, '어퍼 차지', { kb: 7106 }),
  ],
  magician: [
    pas(2000006, 'MP 증가'),
    pas(2000010, '매직 아머'),
    act(2001002, '매직 가드', { kb: 434 }),
    atk(2001008, '에너지 볼트', { kb: 1178 }),
    act(2001009, '텔레포트', { kb: 541 }),
    act(2001011, '마나 웨이브', { kb: 225 }),
  ],
  archer: [pas(3000001, '크리티컬 샷'), pas(3000002, '아처 마스터리'), atk(3001004, '애로우 블로우', { kb: 829 }), actX(3001007, '더블 점프')],
  thief: [
    pas(4000000, '님블 바디'),
    pas(4000005, '헤이스트'),
    pas(4000012, '사이드 스텝'),
    act(4001003, '다크 사이트', { kb: 118 }),
    act(4001011, '플래시 점프', { kb: 383, icon: 'Skill/_Canvas/400.img/skill/4001014/icon' }),
    atk(4001013, '샤프 슬래시', { kb: 521 }),
    atk(4001334, '더블 스탭', { kb: 994 }),
    atk(4001344, '럭키 세븐', { kb: 1089 }),
  ],
  pirate: [
    pas(5000000, '퀵모션'),
    pas(5000007, '크리티컬 로어'),
    atk(5001002, '써머솔트 킥', { kb: 718 }),
    atk(5001003, '더블 파이어', { kb: 357 }),
    act(5001005, '대쉬', { kb: 440 }),
    act(5001010, '파이렛 리프', { kb: 1331 }),
  ],
};

const BRANCH_BOOKS: Record<JobBranchId, SkillEntry[][]> = {
  hero: [
    [
      pas(1100000, '웨폰 마스터리'),
      pas(1100002, '파이널 어택'),
      pas(1100009, '피지컬 트레이닝'),
      pas(1100015, '웨폰 액셀레이션'),
      act(1101006, '스피릿 블레이드', { kb: 2513 }),
      atk(1101011, '브랜디쉬', { kb: 1285 }),
      pas(1101013, '콤보 어택'),
      atk(1101014, '플래시 슬래시', { kb: 935 }),
    ],
    [
      pas(1110000, '셀프 리커버리'),
      pas(1110009, '찬스 어택'),
      pas(1110011, '인듀어'),
      actX(1110013, '콤보 시너지'),
      act(1111003, '스카링 소드', { kb: 2889 }),
      atk(1111010, '브레이브 슬래시', { kb: 2692 }),
      atk(1111012, '돌진', { kb: 2544 }),
      atk(1111016, '오라 블레이드', { kb: 2300 }),
    ],
    [
      pas(1120003, '어드밴스드 콤보'),
      pas(1120012, '컴뱃 마스터리'),
      pas(1120013, '어드밴스드 파이널 어택'),
      pas(1120014, '스탠스'),
      act(1121000, '메이플 용사', { kb: 2129 }),
      atk(1121008, '레이징 블로우', { kb: 3863 }),
      act(1121010, '인레이지', { kb: 2934 }),
      act(1121011, '용사의 의지', { kb: 634 }),
      atk(1121015, '인사이징', { kb: 863 }),
      act(1121016, '매직 크래쉬', { kb: 1409 }),
    ],
    [
      atkX(400011001, '소드 오브 버닝 소울'),
      atk(400011027, '콤보 데스폴트', { kb: 3251 }),
      atk(400011073, '콤보 인스팅트', { kb: 1060 }),
      atk(400011124, '소드 일루전', { kb: 4286 }),
      act(400011000, '오라 웨폰', { kb: 1784 }),
      act(400011066, '바디 오브 스틸', { kb: 4070 }),
      act(400001010, '블리츠 실드', { kb: 494 }),
    ],
    [
      atkX(1141500, '스피릿 칼리버'),
      atk(1141000, '레이징 블로우 VI', { kb: 5224 }),
      atk(1141002, '레이지 업라이징 VI', { kb: 1246 }),
      act(500001000, '솔 야누스', { kb: 9968 }),
    ],
  ],
  firePoison: [
    [
      pas(2100000, 'MP 이터'),
      pas(2100006, '스펠 마스터리'),
      pas(2100007, '하이 위즈덤'),
      pas(2100009, '엘리멘탈 드레인'),
      pas(2100011, '매직 액셀레이션'),
      act(2101001, '메디테이션', { kb: 3172 }),
      atk(2101004, '플레임 오브', { kb: 2535 }),
      atk(2101005, '포이즌 브레스', { kb: 3219 }),
      pas(2101010, '이그나이트'),
    ],
    [
      pas(2110000, '익스트림 매직(불,독)'),
      pas(2110001, '엘리먼트 앰플리피케이션'),
      pas(2110009, '매직 크리티컬'),
      pas(2110015, '엘리멘탈 리셋'),
      atk(2111002, '익스플로젼', { kb: 5653 }),
      atk(2111003, '포이즌 미스트', { kb: 3936 }),
      act(2111007, '텔레포트 마스터리', { kb: 340 }),
      act(2111011, '엘리멘탈 어뎁팅(불,독)', { kb: 1771 }),
      atk(2111013, '포이즌 리젼', { kb: 727 }),
      pas(2111016, '텔레포트 부스트'),
    ],
    [
      pas(2120010, '아케인 에임'),
      pas(2120012, '마스터 매직'),
      pas(2120014, '퍼번트 드레인'),
      act(2121000, '메이플 용사', { kb: 2129, icon: 'Skill/_Canvas/112.img/skill/1121000/icon' }),
      atk(2121003, '미스트 이럽션', { kb: 5047 }),
      act(2121004, '인피니티', { kb: 570 }),
      atk(2121005, '이프리트', { kb: 588 }),
      atk(2121006, '플레임 스윕', { kb: 3641 }),
      atk(2121007, '메테오', { kb: 702 }),
      act(2121008, '용사의 의지', { kb: 633, icon: 'Skill/_Canvas/112.img/skill/1121011/icon' }),
      atk(2121011, '플레임 헤이즈', { kb: 10007 }),
    ],
    [
      atkX(400021001, '도트 퍼니셔'),
      atk(400021028, '포이즌 노바', { kb: 2274 }),
      atk(400021066, '퓨리 오브 이프리트', { kb: 994 }),
      atk(400021101, '포이즌 체인', { kb: 4050 }),
      act(400021000, '오버로드 마나', { kb: 1844 }),
      act(400021060, '에테리얼 폼', { kb: 4028 }),
      act(400001021, '언스태이블 메모라이즈', { kb: 8771 }),
    ],
    [
      atkX(2141500, '인페르날 베놈'),
      atk(2141000, '플레임 스윕 VI', { kb: 7630 }),
      atk(2141003, '플레임 헤이즈 VI', { kb: 20437 }),
      atk(2141005, '미스트 이럽션 VI', { kb: 8592 }),
      act(500001000, '솔 야누스', { kb: 9968 }),
    ],
  ],
  bowmaster: [
    [
      pas(3100000, '보우 마스터리'),
      pas(3100001, '파이널 어택 : 활'),
      pas(3100002, '보우 액셀레이션'),
      pas(3100006, '피지컬 트레이닝'),
      pas(3100011, '소울 애로우 : 활'),
      atk(3101005, '바람의 시', { kb: 2244 }),
      atk(3101008, '리트리트 샷', { kb: 489 }),
      pas(3101009, '퀴버 카트리지'),
    ],
    [
      pas(3110001, '모탈 블로우'),
      pas(3110007, '닷지'),
      pas(3110012, '컨센트레이션'),
      pas(3110014, '마크맨쉽'),
      pas(3110019, '익스트림 아쳐리 : 활'),
      atkX(3111005, '피닉스'),
      atkX(3111013, '애로우 플래터'),
      atk(3111015, '플레시 미라주', { kb: 1283 }),
      act(3111017, '퀴버 플로우', { kb: 1387 }),
    ],
    [
      pas(3120005, '보우 엑스퍼트'),
      pas(3120007, '일루전 스탭'),
      pas(3120008, '어드밴스드 파이널 어택'),
      pas(3120018, '아머 피어싱'),
      pas(3120021, '플레시 미라주 II'),
      pas(3120022, '어드밴스드 퀴버'),
      act(3121000, '메이플 용사', { kb: 2129, icon: 'Skill/_Canvas/112.img/skill/1121000/icon' }),
      act(3121002, '샤프 아이즈', { kb: 1695 }),
      act(3121009, '용사의 의지', { kb: 633, icon: 'Skill/_Canvas/112.img/skill/1121011/icon' }),
      atk(3121015, '언카운터블 애로우', { kb: 4231 }),
      atkX(3121020, '폭풍의 시'),
    ],
    [
      atk(400031020, '잔영의 시', { kb: 5079 }),
      atk(400031028, '퀴버 풀버스트', { kb: 3446 }),
      atk(400031053, '실루엣 미라주', { kb: 2709 }),
      act(400031002, '애로우 레인', { kb: 3697 }),
      act(400031000, '가이디드 애로우', { kb: 328 }),
      act(400031023, '크리티컬 리인포스', { kb: 2673 }),
      act(400001012, '이볼브', { kb: 1589 }),
    ],
    [
      atkX(3141500, '어센던트 셰이드'),
      atkX(3141000, '폭풍의 시 VI'),
      atk(3141002, '언카운터블 애로우 VI', { kb: 6862 }),
      atkX(3141004, '애로우 플래터 VI'),
      act(500001000, '솔 야누스', { kb: 9968 }),
    ],
  ],
  nightLord: [
    [
      pas(4100000, '자벨린 마스터리'),
      pas(4100001, '크리티컬 스로우'),
      pas(4100007, '피지컬 트레이닝'),
      pas(4100017, '자벨린 액셀레이션'),
      atk(4101010, '윈드 탈리스만', { kb: 1686, icon: 'Skill/_Canvas/40000.img/skill/400004096/icon' }),
      pas(4101011, '마크 오브 어쌔신', { icon: 'Skill/_Canvas/40000.img/skill/400004097/icon' }),
      atk(4101013, '슈리켄 버스트', { kb: 306, icon: 'Skill/_Canvas/40000.img/skill/400004095/icon' }),
      act(4101015, '쉐도우 러쉬', { kb: 501 }),
      act(4101016, '쉐도우 리프', { kb: 320 }),
    ],
    [
      pas(4110008, '래디컬 다크니스'),
      pas(4110011, '베놈', { icon: 'Skill/_Canvas/40000.img/skill/400004098/icon' }),
      pas(4110012, '숙련된 표창술'),
      pas(4110014, '아드레날린'),
      pas(4110016, '스피릿 자벨린'),
      act(4111002, '쉐도우 파트너', { kb: 583 }),
      atk(4111007, '다크 플레어', { kb: 3197, icon: 'Skill/_Canvas/40000.img/skill/400004099/icon' }),
      atk(4111010, '트리플 스로우', { kb: 8, icon: 'Skill/_Canvas/40000.img/skill/400004100/icon' }),
      atk(4111015, '슈리켄 챌린지', { kb: 2676, icon: 'Skill/_Canvas/40000.img/skill/400004102/icon' }),
    ],
    [
      pas(4120002, '페이크'),
      pas(4120011, '페이탈 베놈'),
      pas(4120012, '자벨린 엑스퍼트'),
      pas(4120014, '다크 세레니티'),
      pas(4120018, '마크 오브 나이트로드'),
      act(4121000, '메이플 용사', { kb: 2129, icon: 'Skill/_Canvas/112.img/skill/1121000/icon' }),
      act(4121009, '용사의 의지', { kb: 633, icon: 'Skill/_Canvas/112.img/skill/1121011/icon' }),
      atk(4121013, '쿼드러플 스로우', { kb: 893, icon: 'Skill/_Canvas/40000.img/skill/400004103/icon' }),
      pas(4121015, '퍼지 에어리어'),
      atk(4121016, '써든레이드', { kb: 6064, icon: 'Skill/_Canvas/40000.img/skill/400004104/icon' }),
      atk(4121017, '쇼다운 챌린지', { kb: 7947, icon: 'Skill/_Canvas/40000.img/skill/400004105/icon' }),
    ],
    [
      atk(400041001, '스프레드 스로우', { kb: 1172 }),
      atk(400041020, '풍마수리검', { kb: 949 }),
      atk(400041038, '다크로드의 비전서', { kb: 835 }),
      act(400041061, '스로우 블래스팅', { kb: 4165 }),
      act(400041000, '베놈 버스트', { kb: 3812 }),
      act(400041032, '레디 투 다이', { kb: 2381 }),
      act(400001023, '얼티밋 다크 사이트', { kb: 1321 }),
    ],
    [
      atkX(4141500, '생사여탈'),
      atk(4141000, '쿼드러플 스로우 VI', { kb: 2624 }),
      atk(4141002, '마크 오브 어쌔신 VI', { kb: 4508 }),
      act(500001000, '솔 야누스', { kb: 9968 }),
    ],
  ],
  viper: [
    [
      pas(5100001, '너클 마스터리', { icon: 'Skill/_Canvas/1510.img/skill/15100023/icon' }),
      pas(5100009, 'HP 증가', { icon: 'Skill/_Canvas/3100.img/skill/31000003/icon' }),
      pas(5100010, '피지컬 트레이닝', { icon: 'Skill/_Canvas/1110.img/skill/11100026/icon' }),
      pas(5100011, '멘탈 클리어리티'),
      pas(5100013, '인듀어런스'),
      act(5100016, '어드밴스드 대쉬', { kb: 441 }),
      atkX(5100018, '씨 서펜트 버스트', { icon: 'Skill/_Canvas/40000.img/skill/400004136/icon' }),
      pas(5100020, '너클 액셀레이션', { icon: 'Skill/_Canvas/1510.img/skill/15100029/icon' }),
      pas(5100021, '볼텍스 점프'),
      atk(5101012, '쇼크 웨이브', { kb: 1975, icon: 'Skill/_Canvas/40000.img/skill/400004137/icon' }),
      act(5101017, '씨 서펜트', { kb: 1480 }),
    ],
    [
      pas(5110000, '그로기 마스터리'),
      pas(5110010, '윌로우 디펜시브'),
      pas(5110011, '크리티컬 레이지'),
      pas(5110016, '씨 서펜트 강화 I'),
      pas(5110018, '서펜트 어썰트'),
      atk(5111002, '터닝 킥', { kb: 3214, icon: 'Skill/_Canvas/40000.img/skill/400004138/icon' }),
      act(5111007, '럭키 다이스', { kb: 3526, icon: 'Skill/_Canvas/3511.img/skill/35111013/icon' }),
      atk(5111009, '스크류 펀치', { kb: 1139, icon: 'Skill/_Canvas/40000.img/skill/400004139/icon' }),
      act(5111017, '서펜트 스톤', { kb: 308 }),
    ],
    [
      pas(5120011, '디펜스 폼'),
      actX(5120012, '더블 럭키 다이스', { icon: 'Skill/_Canvas/3512.img/skill/35120014/icon' }),
      pas(5120014, '가드 크러쉬'),
      pas(5120022, '씨 서펜트 강화 II'),
      pas(5120024, '씨 서펜트 인레이지', { icon: 'Skill/_Canvas/40000.img/skill/400004141/icon' }),
      pas(5120026, '서펜트 어썰트 인레이지'),
      pas(5120028, '오펜스 폼'),
      pas(5120029, '씨 서펜트 버스트 II'),
      act(5121000, '메이플 용사', { kb: 2131, icon: 'Skill/_Canvas/112.img/skill/1121000/icon' }),
      atk(5121007, '피스트 인레이지', { kb: 3968, icon: 'Skill/_Canvas/40000.img/skill/400004142/icon' }),
      act(5121008, '용사의 의지', { kb: 634, icon: 'Skill/_Canvas/112.img/skill/1121011/icon' }),
      act(5121009, '윈드 부스터', { kb: 927, icon: 'Skill/_Canvas/000.img/skill/0008006/icon' }),
      act(5121010, '타임 리프', { kb: 1694 }),
      atk(5121013, '전함 노틸러스', { kb: 2915, icon: 'Skill/_Canvas/40000.img/skill/400004143/icon' }),
      act(5121015, '바이퍼지션', { kb: 3875 }),
      atk(5121016, '훅 봄버', { kb: 3223, icon: 'Skill/_Canvas/40000.img/skill/400004144/icon' }),
    ],
    [
      atk(400051002, '라이트닝 폼', { kb: 1150 }),
      atk(400051015, '서펜트 스크류', { kb: 3009 }),
      atk(400051042, '퓨리어스 차지', { kb: 5537 }),
      atkX(400051070, '하울링 피스트'),
      act(400051000, '로디드 다이스', { kb: 578 }),
      act(400051033, '오버 드라이브', { kb: 3238 }),
      act(400001017, '파이렛 플래그', { kb: 1840 }),
    ],
    [
      atkX(5141500, '리버레이트 넵투누스'),
      atk(5141000, '피스트 인레이지 VI', { kb: 4446 }),
      atkX(5140004, '씨 서펜트 VI'),
      atk(5141009, '전함 노틸러스 VI', { kb: 4844 }),
      act(500001000, '솔 야누스', { kb: 9968 }),
    ],
  ],
  // 2차 갈래를 넣으며 같은 기준으로 뽑은 갈래. 다른 갈래와 같은 스킬(공용 V 코어)은 그 갈래의 분류·크기를 따른다
  paladin: [
    [
      pas(1200000, '웨폰 마스터리'),
      pas(1200002, '파이널 어택', { icon: 'Skill/_Canvas/110.img/skill/1100002/icon' }),
      pas(1200004, '웨폰 액셀레이션', { icon: 'Skill/_Canvas/110.img/skill/1100015/icon' }),
      pas(1200009, '피지컬 트레이닝', { icon: 'Skill/_Canvas/110.img/skill/1100009/icon' }),
      pas(1200014, '홀리 차지'),
      pas(1200016, '스탠스'),
      atk(1201013, '페이지 오더', { kb: 4622 }),
      atk(1201015, '디바인 스윙', { kb: 1512 }),
    ],
    [
      pas(1210001, '실드 마스터리'),
      pas(1210015, '아킬레스'),
      pas(1210016, '블레싱 아머'),
      act(1211010, '리스토네이션', { kb: 2075 }),
      act(1211011, '컴뱃 오더스', { kb: 3510, icon: 'Skill/_Canvas/000.img/skill/0008004/icon' }),
      atk(1211012, '돌진', { kb: 3491 }),
      act(1211013, '노블 디맨드', { kb: 2684 }),
      act(1211014, '파라쇼크 가드', { kb: 3221 }),
      atk(1211018, '디바인 차지', { kb: 1684 }),
    ],
    [
      pas(1220010, '어드밴스드 홀리 차지'),
      pas(1220018, '팔라딘 엑스퍼트'),
      pas(1220022, '디바인 저지먼트'),
      act(1221000, '메이플 용사', { kb: 2129 }),
      atk(1221009, '블래스트', { kb: 10362 }),
      atk(1221011, '생츄어리', { kb: 9738 }),
      act(1221012, '용사의 의지', { kb: 634 }),
      act(1221014, '매직 크래쉬', { kb: 1410 }),
      act(1221015, '디바인 블레싱', { kb: 2521 }),
      act(1221016, '가디언 스피릿', { kb: 4628 }),
      atk(1221019, '디바인 스티그마', { kb: 6517 }),
    ],
    [
      atkX(400011072, '그랜드 크로스'),
      atk(400011131, '마이티 묠니르', { kb: 3163 }),
      act(400011000, '오라 웨폰', { kb: 1784 }),
      act(400011003, '홀리 유니티', { kb: 807 }),
      act(400011066, '바디 오브 스틸', { kb: 4070 }),
      act(400001010, '블리츠 실드', { kb: 494 }),
      pas(400011052, '블래스드 해머'),
    ],
    [
      atkX(1241500, '세이크리드 바스티온'),
      pas(1240001, '디바인 저지먼트 VI'),
      atk(1241000, '블래스트 VI', { kb: 16545 }),
      atk(1241003, '디바인 차지 VI', { kb: 5829 }),
      pas(1241005, '폴링 저스티스'),
      act(500001000, '솔 야누스', { kb: 9968 }),
    ],
  ],
  darkKnight: [
    [
      pas(1300000, '웨폰 마스터리'),
      pas(1300002, '파이널 어택'),
      pas(1300009, '피지컬 트레이닝'),
      pas(1300015, '웨폰 액셀레이션'),
      pas(1300016, '아이언 월'),
      act(1301007, '하이퍼 바디', { kb: 1776 }),
      atk(1301012, '스피어 풀링', { kb: 1450 }),
      atkX(1301013, '비홀더'),
      atk(1301014, '비홀더 쇼크', { kb: 704 }),
    ],
    [
      pas(1310009, '로드 오브 다크니스'),
      pas(1310010, '인듀어'),
      pas(1310013, '비홀더 도미넌트'),
      actX(1310016, '비홀더스 버프'),
      pas(1310018, '비홀더 쇼크 ll'),
      atk(1311011, '라만차 스피어', { kb: 2064 }),
      atk(1311012, '돌진', { kb: 2640 }),
      act(1311015, '크로스 오버 체인', { kb: 1971 }),
    ],
    [
      pas(1320011, '비홀더스 리벤지'),
      pas(1320016, '리인카네이션'),
      pas(1320017, '스탠스'),
      pas(1320018, '어드밴스드 웨폰 마스터리'),
      act(1321000, '메이플 용사', { kb: 2128, icon: 'Skill/_Canvas/112.img/skill/1121000/icon' }),
      act(1321010, '용사의 의지', { kb: 633, icon: 'Skill/_Canvas/112.img/skill/1121011/icon' }),
      atk(1321012, '다크 임페일', { kb: 3131 }),
      atk(1321013, '궁니르 디센트', { kb: 2344 }),
      act(1321014, '매직 크래쉬', { kb: 1409, icon: 'Skill/_Canvas/112.img/skill/1121016/icon' }),
      act(1321015, '다크 레조넌스', { kb: 2394 }),
      act(1321020, '리인카네이션 액셉트', { kb: 639 }),
    ],
    [
      atk(400011004, '다크 스피어', { kb: 2664 }),
      atk(400011047, '다크니스 오라', { kb: 2308 }),
      atk(400011054, '비홀더 임팩트', { kb: 401 }),
      atkX(400011068, '피어스 사이클론'),
      act(400011000, '오라 웨폰', { kb: 1784 }),
      act(400011066, '바디 오브 스틸', { kb: 4070 }),
      act(400001010, '블리츠 실드', { kb: 494 }),
    ],
    [
      atkX(1341500, '데드 스페이스'),
      atk(1341000, '궁니르 디센트 VI', { kb: 2887 }),
      atk(1341001, '다크 임페일 VI', { kb: 4566 }),
      atk(1341003, '다크 신서시스 VI', { kb: 16213 }),
      act(500001000, '솔 야누스', { kb: 9968 }),
    ],
  ],
  iceLightning: [
    [
      pas(2200000, 'MP 이터'),
      pas(2200006, '스펠 마스터리'),
      pas(2200007, '하이 위즈덤'),
      pas(2200011, '프리징 이펙트'),
      pas(2200012, '매직 액셀레이션', { icon: 'Skill/_Canvas/210.img/skill/2100011/icon' }),
      act(2201001, '메디테이션', { kb: 3185, icon: 'Skill/_Canvas/210.img/skill/2101001/icon' }),
      atk(2201005, '썬더 볼트', { kb: 1378 }),
      atk(2201008, '콜드 빔', { kb: 616 }),
      pas(2201009, '칠링 스텝'),
    ],
    [
      pas(2210000, '익스트림 매직(썬,콜)'),
      pas(2210001, '엘리먼트 앰플리피케이션', { icon: 'Skill/_Canvas/211.img/skill/2110001/icon' }),
      pas(2210009, '매직 크리티컬'),
      pas(2210013, '프로즌 브레이크'),
      pas(2210016, '엘리멘탈 리셋', { icon: 'Skill/_Canvas/211.img/skill/2110015/icon' }),
      atk(2211002, '아이스 스트라이크', { kb: 8453 }),
      act(2211007, '텔레포트 마스터리', { kb: 307 }),
      atk(2211011, '썬더 스피어', { kb: 6443 }),
      act(2211012, '엘리멘탈 어뎁팅(썬,콜)', { kb: 1680 }),
      atk(2211014, '글레이셜 월', { kb: 803 }),
      pas(2211017, '텔레포트 부스트'),
    ],
    [
      pas(2220010, '아케인 에임'),
      pas(2220013, '마스터 매직'),
      pas(2220015, '프로스트 이펙트'),
      act(2221000, '메이플 용사', { kb: 2128, icon: 'Skill/_Canvas/112.img/skill/1121000/icon' }),
      act(2221004, '인피니티', { kb: 565 }),
      atk(2221005, '엘퀴네스', { kb: 3931 }),
      atk(2221006, '체인 라이트닝', { kb: 2954 }),
      atk(2221007, '블리자드', { kb: 640 }),
      act(2221008, '용사의 의지', { kb: 633, icon: 'Skill/_Canvas/112.img/skill/1121011/icon' }),
      atkX(2221011, '프리징 브레스'),
      atk(2221012, '프로즌 오브', { kb: 10921 }),
    ],
    [
      atk(400021002, '아이스 에이지', { kb: 1788 }),
      atk(400021067, '스피릿 오브 스노우', { kb: 4580 }),
      atk(400021094, '주피터 썬더', { kb: 31585 }),
      act(400021000, '오버로드 마나', { kb: 1844 }),
      act(400021030, '썬더 브레이크', { kb: 2082 }),
      act(400021060, '에테리얼 폼', { kb: 4028 }),
      act(400001021, '언스태이블 메모라이즈', { kb: 8771 }),
    ],
    [
      atkX(2241500, '프로즌 라이트닝'),
      atk(2241000, '체인 라이트닝 VI', { kb: 3021 }),
      atk(2241002, '프로즌 오브 VI', { kb: 4931 }),
      atk(2241003, '블리자드 VI', { kb: 16287 }),
      act(500001000, '솔 야누스', { kb: 9968 }),
    ],
  ],
  bishop: [
    [
      pas(2300000, 'MP 이터'),
      pas(2300003, '인빈서블'),
      pas(2300006, '스펠 마스터리'),
      pas(2300007, '하이 위즈덤'),
      pas(2300009, '블레싱 앙상블'),
      pas(2300011, '매직 액셀레이션', { icon: 'Skill/_Canvas/210.img/skill/2100011/icon' }),
      atk(2301002, '힐', { kb: 1154 }),
      act(2301004, '블레스', { kb: 384 }),
      atk(2301005, '홀리 애로우', { kb: 2786 }),
    ],
    [
      pas(2310008, '홀리 포커스'),
      pas(2310010, '매직 크리티컬', { icon: 'Skill/_Canvas/211.img/skill/2110009/icon' }),
      act(2311001, '디스펠', { kb: 7238 }),
      act(2311002, '미스틱 도어', { kb: 394 }),
      act(2311003, '홀리 심볼', { kb: 4090 }),
      atk(2311004, '샤이닝 레이', { kb: 1116 }),
      act(2311007, '텔레포트 마스터리', { kb: 360 }),
      act(2311009, '홀리 매직쉘', { kb: 4433 }),
      act(2311011, '홀리 파운틴', { kb: 1225 }),
      act(2311012, '디바인 프로텍션', { kb: 154 }),
      pas(2311016, '텔레포트 부스트'),
    ],
    [
      pas(2320011, '아케인 에임', { icon: 'Skill/_Canvas/212.img/skill/2120010/icon' }),
      pas(2320012, '마스터 매직'),
      pas(2320013, '블레싱 하모니', { icon: 'Skill/_Canvas/230.img/skill/2300009/icon' }),
      act(2321000, '메이플 용사', { kb: 2128, icon: 'Skill/_Canvas/112.img/skill/1121000/icon' }),
      atk(2321001, '빅뱅', { kb: 1306 }),
      atk(2321003, '바하뮤트', { kb: 3548 }),
      act(2321004, '인피니티', { kb: 565, icon: 'Skill/_Canvas/212.img/skill/2121004/icon' }),
      act(2321005, '어드밴스드 블레스', { kb: 2558 }),
      act(2321006, '리저렉션', { kb: 6352 }),
      atk(2321007, '엔젤레이', { kb: 3741 }),
      atk(2321008, '제네시스', { kb: 690 }),
      act(2321009, '용사의 의지', { kb: 633, icon: 'Skill/_Canvas/112.img/skill/1121011/icon' }),
      act(2321015, '홀리 워터', { kb: 635 }),
    ],
    [
      atk(400021032, '엔젤 오브 리브라', { kb: 2830 }),
      atk(400021070, '피스메이커', { kb: 3735 }),
      atkX(400021086, '디바인 퍼니시먼트'),
      act(400021000, '오버로드 마나', { kb: 1844 }),
      actX(400021003, '프레이'),
      act(400021060, '에테리얼 폼', { kb: 4028 }),
      act(400001021, '언스태이블 메모라이즈', { kb: 8771 }),
    ],
    [
      atkX(2341500, '홀리 어드밴트', { icon: 'Skill/_Canvas/1314.img/skill/13141505/icon' }),
      atk(2341000, '엔젤레이 VI', { kb: 3397 }),
      atk(2341002, '빅뱅 VI', { kb: 1388 }),
      act(500001000, '솔 야누스', { kb: 9968 }),
    ],
  ],
  marksman: [
    [
      pas(3200000, '크로스보우 마스터리'),
      pas(3200001, '파이널 어택 : 석궁'),
      pas(3200006, '피지컬 트레이닝'),
      pas(3200013, '크로스보우 액셀레이션'),
      pas(3200014, '소울 애로우 : 석궁'),
      atk(3201011, '피어싱', { kb: 2826 }),
      atk(3201012, '리트리트 샷', { kb: 482 }),
    ],
    [
      pas(3210001, '모탈 블로우'),
      pas(3210007, '닷지', { icon: 'Skill/_Canvas/311.img/skill/3110007/icon' }),
      pas(3210013, '데미지 리버싱'),
      pas(3210015, '마크맨쉽', { icon: 'Skill/_Canvas/311.img/skill/3110014/icon' }),
      pas(3210016, '인핸스 애로우'),
      pas(3210021, '익스트림 아쳐리 : 석궁'),
      atkX(3211005, '프리져'),
      act(3211011, '페인 킬러', { kb: 1539 }),
      atk(3211018, '볼트 스위프트', { kb: 5034 }),
      act(3211019, '볼트 플로우', { kb: 1266 }),
    ],
    [
      pas(3220004, '크로스보우 엑스퍼트'),
      pas(3220006, '일루전 스탭', { icon: 'Skill/_Canvas/312.img/skill/3120007/icon' }),
      pas(3220015, '어디셔널 볼트'),
      pas(3220016, '라스트맨 스탠딩'),
      pas(3220020, '피어싱 ll'),
      pas(3220021, '어드밴스드 인핸스 애로우'),
      act(3221000, '메이플 용사', { kb: 2128, icon: 'Skill/_Canvas/112.img/skill/1121000/icon' }),
      act(3221002, '샤프 아이즈', { kb: 1695, icon: 'Skill/_Canvas/000.img/skill/0008002/icon' }),
      atk(3221007, '스나이핑', { kb: 3432 }),
      act(3221008, '용사의 의지', { kb: 633, icon: 'Skill/_Canvas/112.img/skill/1121011/icon' }),
      atk(3221014, '애로우 일루전', { kb: 1558 }),
    ],
    [
      act(400031000, '가이디드 애로우', { kb: 328 }),
      atkX(400031006, '트루 스나이핑'),
      atk(400031015, '스플릿 애로우', { kb: 2474 }),
      act(400031023, '크리티컬 리인포스', { kb: 2673 }),
      act(400031055, '리피팅 크로스보우 카트리지', { kb: 350 }),
      pas(400031025, '차지드 애로우'),
    ],
    [
      atkX(3241500, '파이널 에임'),
      atk(3241000, '스나이핑 VI', { kb: 7346 }),
      atk(3241005, '피어싱 VI', { kb: 4930 }),
      act(500001000, '솔 야누스', { kb: 9968 }),
    ],
  ],
  shadower: [
    [
      pas(4200000, '대거 마스터리'),
      pas(4200002, '대거 액셀레이션'),
      pas(4200007, '피지컬 트레이닝'),
      pas(4200009, '카르마'),
      pas(4200010, '실드 마스터리'),
      pas(4200014, '크리티컬 엣지'),
      pas(4200015, '시프 어질리티'),
      atk(4201012, '새비지 블로우', { kb: 1426, icon: 'Skill/_Canvas/40000.img/skill/400004108/icon' }),
      pas(4201017, '스틸'),
    ],
    [
      pas(4210010, '베놈', { icon: 'Skill/_Canvas/40000.img/skill/400004107/icon' }),
      pas(4210012, '그리드'),
      pas(4210013, '래디컬 다크니스'),
      pas(4210015, '어드밴스드 다크 사이트'),
      atk(4211002, '무스펠 하임', { kb: 1452, icon: 'Skill/_Canvas/40000.img/skill/400004109/icon' }),
      pas(4211003, '픽 파킷'),
      atk(4211006, '메소 익스플로젼', { kb: 12711, icon: 'Skill/_Canvas/40000.img/skill/400004110/icon' }),
      atk(4211007, '다크 플레어', { kb: 3182, icon: 'Skill/_Canvas/40000.img/skill/400004113/icon' }),
      act(4211008, '쉐도우 파트너', { kb: 582 }),
      atk(4211011, '엣지 카니발', { kb: 2074, icon: 'Skill/_Canvas/40000.img/skill/400004112/icon' }),
      act(4211016, '인투 다크니스', { kb: 1364 }),
    ],
    [
      pas(4220002, '페이크'),
      pas(4220011, '페이탈 베놈'),
      pas(4220012, '대거 엑스퍼트'),
      pas(4220013, '섀도어 인스팅트'),
      act(4221000, '메이플 용사', { kb: 2128, icon: 'Skill/_Canvas/112.img/skill/1121000/icon' }),
      act(4221006, '연막탄', { kb: 5547 }),
      act(4221008, '용사의 의지', { kb: 633, icon: 'Skill/_Canvas/112.img/skill/1121011/icon' }),
      atk(4221010, '써든레이드', { kb: 6064, icon: 'Skill/_Canvas/40000.img/skill/400004116/icon' }),
      atk(4221014, '암살', { kb: 1380, icon: 'Skill/_Canvas/40000.img/skill/400004114/icon' }),
      atk(4221017, '크루얼 스탭', { kb: 921, icon: 'Skill/_Canvas/40000.img/skill/400004115/icon' }),
      pas(4221018, '블러디 파킷'),
    ],
    [
      act(400041000, '베놈 버스트', { kb: 3812 }),
      atk(400041002, '쉐도우 어썰트', { kb: 616 }),
      atkX(400041039, '소닉 블로우'),
      atk(400041069, '멸귀참영진', { kb: 2020 }),
      act(400041025, '절개', { kb: 1345 }),
      act(400041032, '레디 투 다이', { kb: 2381 }),
    ],
    [
      atkX(4241500, '일도양단'),
      atk(4241000, '암살 VI', { kb: 2288 }),
      atk(4241006, '메소 익스플로젼 VI', { kb: 2094 }),
      act(500001000, '솔 야누스', { kb: 9968 }),
    ],
  ],
  captain: [
    [
      pas(5200000, '건 마스터리'),
      pas(5200009, '피지컬 트레이닝', { icon: 'Skill/_Canvas/110.img/skill/1100009/icon' }),
      pas(5200015, '건 액셀레이션'),
      pas(5200016, '인피닛 불릿'),
      atk(5201001, '매그넘 샷', { kb: 1378, icon: 'Skill/_Canvas/40000.img/skill/400004146/icon' }),
      atk(5201006, '백스텝샷', { kb: 523, icon: 'Skill/_Canvas/40000.img/skill/400004147/icon' }),
      act(5201011, '윙즈', { kb: 256 }),
      act(5201012, '서먼 크루', { kb: 425, icon: 'Skill/_Canvas/40000.img/skill/400004149/icon' }),
      atk(5201018, '스위프트 파이어', { kb: 786 }),
    ],
    [
      pas(5210009, '할로포인트 불릿'),
      pas(5210012, '발키리 페이션트'),
      pas(5210013, '풀메탈 자켓'),
      act(5210015, '어셈블 크루', { kb: 447 }),
      act(5211007, '럭키 다이스', { kb: 3525, icon: 'Skill/_Canvas/3511.img/skill/35111013/icon' }),
      atk(5211008, '더블 배럴 샷', { kb: 1898, icon: 'Skill/_Canvas/40000.img/skill/400004150/icon' }),
      atk(5211010, '불릿 스매시', { kb: 2551, icon: 'Skill/_Canvas/40000.img/skill/400004151/icon' }),
      atkX(5211014, '시즈 봄버', { icon: 'Skill/_Canvas/40000.img/skill/400004152/icon' }),
    ],
    [
      actX(5220012, '오펜스 폼'),
      actX(5220014, '더블 럭키 다이스', { icon: 'Skill/_Canvas/3512.img/skill/35120014/icon' }),
      pas(5220019, '크루 커맨더십'),
      pas(5220020, '캡틴 디그니티', { icon: 'Skill/_Canvas/40000.img/skill/400004157/icon' }),
      pas(5220055, '퀵 드로우'),
      act(5221000, '메이플 용사', { kb: 2128, icon: 'Skill/_Canvas/112.img/skill/1121000/icon' }),
      atkX(5221004, '래피드 파이어', { icon: 'Skill/_Canvas/40000.img/skill/400004153/icon' }),
      act(5221010, '용사의 의지', { kb: 633, icon: 'Skill/_Canvas/112.img/skill/1121011/icon' }),
      atk(5221013, '전함 노틸러스', { kb: 2913, icon: 'Skill/_Canvas/40000.img/skill/400004154/icon' }),
      atk(5221015, '컨티뉴얼 에이밍', { kb: 1497, icon: 'Skill/_Canvas/40000.img/skill/400004159/icon' }),
      atk(5221016, '헤드 샷', { kb: 5701, icon: 'Skill/_Canvas/40000.img/skill/400004155/icon' }),
      atk(5221017, '퍼실레이드', { kb: 4139, icon: 'Skill/_Canvas/40000.img/skill/400004156/icon' }),
      act(5221018, '파이렛 스타일', { kb: 2012 }),
      atk(5221022, '배틀쉽 봄버', { kb: 1559, icon: 'Skill/_Canvas/40000.img/skill/400004158/icon' }),
      act(5221029, '사인 오브 봄바드', { kb: 237 }),
    ],
    [
      atkX(400051006, '불릿 파티'),
      atk(400051021, '데드아이', { kb: 21941 }),
      atk(400051040, '노틸러스 어썰트', { kb: 445 }),
      atkX(400051073, '데스 트리거'),
      act(400051000, '로디드 다이스', { kb: 578 }),
      act(400051033, '오버 드라이브', { kb: 3238 }),
    ],
    [
      atkX(5241500, '드레드노트'),
      atkX(5241000, '래피드 파이어 VI'),
      atk(5241002, '배틀쉽 봄버 VI', { kb: 1796 }),
      act(500001000, '솔 야누스', { kb: 9968 }),
    ],
  ],
};

const isBranch = (path: JobPath): path is JobBranchId => path in BRANCH_BOOKS;

/** 차수(0~6) 탭에 늘어놓는 스킬. 직업을 아직 안 골랐으면 초보자 탭만, 2차 갈래를 안 골랐으면 1차 탭까지만 있다 */
export function tierSkills(path: JobPath | null, tier: number): SkillEntry[] {
  if (tier === 0) return BEGINNER;
  if (!path || tier < 0 || tier > 6) return [];
  if (tier === 1) return FIRST[lineOf(path)];
  return isBranch(path) ? BRANCH_BOOKS[path][tier - 2] : [];
}

/** 지금 차수까지 배운 스킬. 초보자 스킬부터 차수 순서다 */
export function learnedSkills(path: JobPath | null, tier: number): SkillEntry[] {
  const reached = path ? tier : 0;
  return SKILL_TIERS.filter((each) => each <= reached).flatMap((each) => tierSkills(path, each));
}

/** 사냥에 고를 수 있는 공격 스킬 */
export function huntSkillChoices(path: JobPath | null, tier: number): SkillEntry[] {
  return learnedSkills(path, tier).filter(isHuntable);
}

export const isHuntable = (entry: SkillEntry): boolean => entry.type === 'attack' && !entry.noArt;
/** 스킬창에서 한 번 써 볼 수 있는(맵에 그릴 수 있는 버프·이동) 스킬 */
export const isCastable = (entry: SkillEntry): boolean => entry.type === 'active' && !entry.noArt;

/** 스킬창에서 쓸 수 있는 스킬인지. 지금 차수까지 배운 액티브 스킬만 쓴다 */
export function canCast(path: JobPath | null, tier: number, id: number): boolean {
  return learnedSkills(path, tier).some((entry) => entry.id === id && isCastable(entry));
}

/** 「자동」일 때 쓰는 스킬. 직업 장비처럼 차수마다 정해 둔 스킬이고 5·6차는 4차 스킬이다 */
export function autoHuntSkill(path: JobPath | null, tier: number): number | null {
  if (!path || tier === 0) return null;
  if (tier === 1 || !isBranch(path)) return JOB_LINES[lineOf(path)].skill;
  return JOB_BRANCHES[path].skills[Math.min(tier, 4) - 2];
}

/**
 * 사냥에 실제로 쓸 스킬. 고른 스킬이 없거나 아직 못 배운(다른 캐릭터·갈래에서 옮겨 왔거나 목록에서 빠진) 스킬이면 자동이다.
 * 고른 스킬은 겉모습만 바꾼다. 보상·사냥 횟수는 스킬과 상관없다
 */
export function huntSkill(path: JobPath | null, tier: number, chosenId: number | null): number | null {
  if (chosenId !== null && huntSkillChoices(path, tier).some((entry) => entry.id === chosenId)) return chosenId;
  return autoHuntSkill(path, tier);
}

export function findSkill(path: JobPath | null, id: number): SkillEntry | null {
  return SKILL_TIERS.flatMap((tier) => tierSkills(path, tier)).find((entry) => entry.id === id) ?? null;
}

/** Skill.wz 경로. 초보자 스킬 1000 은 `000.img/skill/0001000` 처럼 일곱 자리로 채운다 */
export function skillWzPath(id: number): { img: string; node: string } {
  const node = String(id).padStart(7, '0');
  return { img: node.slice(0, -4), node };
}

/** 아이콘 그림의 WZ 경로(`_Canvas` 아래). 다른 스킬 그림을 가리키는 것은 미리 읽어 둔 링크(icon)를 쓴다 */
export function skillIconPath(entry: SkillEntry): string {
  if (entry.icon) return entry.icon;
  const { img, node } = skillWzPath(entry.id);
  return `Skill/_Canvas/${img}.img/skill/${node}/icon`;
}

/** 스킬창을 열기 전에 받아 둘 아이콘. 이 직업 길의 모든 탭이고 지금 차수 탭부터다 */
export function iconPrefetchOrder(path: JobPath | null, tier: number): SkillEntry[] {
  const reached = path ? tier : 0;
  const tabs = [...SKILL_TIERS].sort((a, b) => Math.abs(a - reached) - Math.abs(b - reached) || b - a);
  return tabs.flatMap((each) => tierSkills(path, each));
}

/** 스킬 이펙트가 맵에 그릴 만한지. 이펙트 레이어 프레임 수를 받는다. 한 장짜리는 빈 그림이다 */
export function hasUsableEffect(layerFrameCounts: number[]): boolean {
  return layerFrameCounts.reduce((sum, count) => sum + count, 0) >= 2;
}

/**
 * 스킬창에서 쓰거나 맵에서 사냥에 쓸 스킬 데이터를 미리 받을 순서. 지금 차수 탭의 쓸 수 있는 스킬과 사냥 스킬이고,
 * 작은 것부터다. capKb 보다 큰 것은 뺀다(눌렀을 때 받는다)
 */
export function skillDataPrefetchOrder(path: JobPath | null, tier: number, huntSkillId: number | null, capKb: number): number[] {
  const reached = path ? tier : 0;
  const wanted = tierSkills(path, reached).filter((entry) => isCastable(entry) || isHuntable(entry));
  const hunting = huntSkillId === null ? null : findSkill(path, huntSkillId);
  if (hunting && !wanted.includes(hunting)) wanted.push(hunting);
  return wanted
    .filter((entry) => entry.kb !== undefined && entry.kb <= capKb)
    .sort((a, b) => a.kb! - b.kb!)
    .map((entry) => entry.id);
}
