import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from './appearance';
import {
  ADVANCEMENT_LEVELS,
  JOB_BRANCHES,
  JOB_LINES,
  type JobBranchId,
  type JobLineId,
  defaultBranch,
  describeJob,
  jobPath,
  lineOf,
  pathTier,
  tierName,
} from './jobs';

const BRANCH_IDS = Object.keys(JOB_BRANCHES) as JobBranchId[];
const at = (tier: number) => ADVANCEMENT_LEVELS[tier - 1];
const weaponOf = (look: number[]) => look[look.length - 1];

describe('2차 갈래', () => {
  it('계열마다 원작 모험가 갈래가 있다', () => {
    const names = (line: JobLineId) => JOB_LINES[line].branches.map((id) => JOB_BRANCHES[id].names.join('→'));
    expect(names('warrior')).toEqual(['파이터→크루세이더→히어로', '페이지→나이트→팔라딘', '스피어맨→버서커→다크나이트']);
    expect(names('magician')).toEqual([
      '위자드(불,독)→메이지(불,독)→아크메이지(불,독)',
      '위자드(썬,콜)→메이지(썬,콜)→아크메이지(썬,콜)',
      '클레릭→프리스트→비숍',
    ]);
    expect(names('archer')).toEqual(['헌터→레인저→보우마스터', '사수→저격수→신궁']);
    expect(names('thief')).toEqual(['어쌔신→허밋→나이트로드', '시프→시프마스터→섀도어']);
    expect(names('pirate')).toEqual(['인파이터→버커니어→바이퍼', '건슬링어→발키리→캡틴']);
  });

  it('갈래는 제 계열에 있고, 직업 번호는 계열 번호 아래 2·3·4차 순서다', () => {
    BRANCH_IDS.forEach((id) => {
      const branch = JOB_BRANCHES[id];
      expect(JOB_LINES[branch.line].branches).toContain(id);
      const [second, third, fourth] = branch.jobIds;
      expect([third - second, fourth - second]).toEqual([1, 2]);
      expect(Math.floor(second / 100)).toBe(Object.keys(JOB_LINES).indexOf(branch.line) + 1);
    });
  });

  it('첫 갈래는 갈래가 생기기 전 하나뿐이던 길이다', () => {
    expect((Object.keys(JOB_LINES) as JobLineId[]).map(defaultBranch)).toEqual(['hero', 'firePoison', 'bowmaster', 'nightLord', 'viper']);
  });

  it('갈래가 다른 계열이면 길로 치지 않는다', () => {
    expect(jobPath(null, 'captain')).toBeNull();
    expect(jobPath('pirate', null)).toBe('pirate');
    expect(jobPath('pirate', 'captain')).toBe('captain');
    expect(jobPath('pirate', 'hero')).toBe('pirate');
    expect(lineOf('captain')).toBe('pirate');
  });
});

describe('갈래마다 차수별 모습', () => {
  it('2차 전직 레벨이어도 갈래를 안 골랐으면 1차에 머물고 갈래를 묻는다', () => {
    const job = describeJob(at(2), 'pirate', DEFAULT_APPEARANCE);
    expect(job).toMatchObject({ tier: 1, title: '해적 · 1차', branchChoice: 'pirate', canChooseJob: false });
    expect(weaponOf(job.look)).toBe(JOB_LINES.pirate.weapon);
    expect(describeJob(at(4), 'pirate', DEFAULT_APPEARANCE).tier).toBe(1);
    expect(describeJob(at(2) - 1, 'pirate', DEFAULT_APPEARANCE).branchChoice).toBeNull();
    expect(pathTier(at(4), 'pirate')).toBe(1);
    expect(pathTier(at(4), 'captain')).toBe(4);
  });

  it('1차는 갈래와 상관없이 계열 것이다', () => {
    const viper = describeJob(at(1), 'viper', DEFAULT_APPEARANCE);
    const captain = describeJob(at(1), 'captain', DEFAULT_APPEARANCE);
    expect(captain).toEqual(viper);
    expect(captain.title).toBe('해적 · 1차');
  });

  it('건슬링어는 2차부터 총을 쥐고 쏘며, 5·6차는 4차 이름이다', () => {
    expect(describeJob(at(2), 'captain', DEFAULT_APPEARANCE).title).toBe('건슬링어 · 2차');
    expect(describeJob(at(3), 'captain', DEFAULT_APPEARANCE).title).toBe('발키리 · 3차');
    expect(describeJob(at(6), 'captain', DEFAULT_APPEARANCE).title).toBe('캡틴 · 6차');
    [2, 3, 4, 5, 6].forEach((tier) => {
      const job = describeJob(at(tier), 'captain', DEFAULT_APPEARANCE);
      // 총은 149xxxx
      expect(Math.floor(weaponOf(job.look) / 10000)).toBe(149);
      expect(job.attackAction).toBe('shoot2');
    });
  });

  it('갈래마다 제 무기 종류를 쥔다', () => {
    const weaponType = (id: JobBranchId) => Math.floor(weaponOf(describeJob(at(4), id, DEFAULT_APPEARANCE).look) / 10000);
    expect(Object.fromEntries(BRANCH_IDS.map((id) => [id, weaponType(id)]))).toEqual({
      hero: 130, // 한손검
      paladin: 142, // 두손 둔기
      darkKnight: 143, // 창
      firePoison: 138, // 스태프
      iceLightning: 137, // 완드
      bishop: 138,
      bowmaster: 145, // 활
      marksman: 146, // 석궁
      nightLord: 147, // 아대
      shadower: 133, // 단검
      viper: 148, // 너클
      captain: 149, // 총
    });
  });

  it('창은 stand2·walk2, 석궁은 walk2 로 서고 걷는다. 그 동작에만 무기 그림이 있다', () => {
    const stance = (id: JobBranchId, tier = 4) => {
      const { standAction, walkAction } = describeJob(at(tier), id, DEFAULT_APPEARANCE);
      return `${standAction}/${walkAction}`;
    };
    expect(stance('darkKnight')).toBe('stand2/walk2');
    expect(stance('marksman')).toBe('stand1/walk2');
    expect(stance('hero')).toBe('stand1/walk1');
    expect(stance('darkKnight', 1)).toBe('stand1/walk1');
  });

  it('원거리 갈래는 근접 갈래보다 멀리 선다', () => {
    const range = (id: JobBranchId) => describeJob(at(3), id, DEFAULT_APPEARANCE).fallbackRange;
    expect(range('captain')).toBeGreaterThan(range('viper'));
    expect(range('marksman')).toBeGreaterThan(range('shadower'));
    expect(range('nightLord')).toBeGreaterThan(range('shadower'));
  });

  it('차수 이름. 갈래가 없으면 1차 이름까지다', () => {
    expect(tierName('bishop', 2)).toBe('클레릭');
    expect(tierName('bishop', 5)).toBe('비숍');
    expect(tierName('magician', 4)).toBe('매지션');
    expect(tierName(null, 3)).toBe('초보자');
  });
});
