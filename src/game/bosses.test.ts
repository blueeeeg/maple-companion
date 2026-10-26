import { describe, expect, it } from 'vitest';
import {
  BOSSES,
  BOSS_HITS_MAX,
  BOSS_HITS_MIN,
  BOSS_MESO_MULTIPLIER,
  BOSS_XP,
  DEFAULT_PACE,
  type HuntProgress,
  ZAKUM_ID,
  bossDue,
  bossHits,
  bossMeso,
  bossXp,
  drawFromBag,
  pickBoss,
  reservedBoss,
  resolveHunts,
  scheduledBoss,
} from './bosses';
import { KILL_XP, mesoDrop } from './encounters';
import { TOWNS } from './towns';

const henesys = TOWNS[0];
const fixed = (value: number) => () => value;

const progress = (encountersResolved: number, pendingHunts = 0): HuntProgress => ({
  activeSeconds: (encountersResolved + pendingHunts) * 180,
  huntSeconds: encountersResolved * 180,
  huntBonusSeconds: 0,
  encountersResolved,
  bossChargeSeconds: (encountersResolved % 20) * 180,
});

const progressWithBag = (encountersResolved: number, pendingHunts = 0): HuntProgress => ({
  ...progress(encountersResolved, pendingHunts),
  bossBag: [],
  lastBossId: null,
});

describe('보스 차례', () => {
  it('기본 설정이면 20번째 사냥마다 보스가 나온다', () => {
    expect(bossDue(progress(19), DEFAULT_PACE)).toBe(true);
    expect(bossDue(progress(39), DEFAULT_PACE)).toBe(true);
    expect(bossDue(progress(18), DEFAULT_PACE)).toBe(false);
    expect(bossDue(progress(20), DEFAULT_PACE)).toBe(false);
    expect(bossDue(progress(0), DEFAULT_PACE)).toBe(false);
  });

  it('보스를 끄면 나오지 않는다', () => {
    expect(bossDue(progress(19), { ...DEFAULT_PACE, bossEvery: null })).toBe(false);
  });

  it('밀린 사냥 중 보스 차례는 보스로 친다', () => {
    // 지금까지 18번 잡았고 5번 밀렸으면 19~23번 중 20번 하나가 보스다
    const result = resolveHunts(progress(18, 5), DEFAULT_PACE, 30, henesys, 5, fixed(0));
    expect(result.bosses).toEqual({ 마노: 1 });
    expect(Object.values(result.kills).reduce((sum, count) => sum + count, 0)).toBe(5);
    expect(result.xp).toBe(KILL_XP * 4 + BOSS_XP);
  });

  it('레벨에 맞는 보스가 없으면 보통 몬스터로 치고 보스 몫은 다음 차례로 넘긴다', () => {
    const character = progress(18, 5);
    const result = resolveHunts(character, DEFAULT_PACE, 5, henesys, 5, fixed(0));
    expect(result.bosses).toEqual({});
    expect(result.xp).toBe(KILL_XP * 5);
    expect(character.bossChargeSeconds).toBe(23 * 180 - 0);
    expect(character.encountersResolved).toBe(23);
  });
});

describe('보스 고르기', () => {
  it('레벨에 맞는 보스가 없으면 null', () => {
    expect(pickBoss(9)).toBeNull();
  });

  it('맞는 보스가 하나면 그 보스', () => {
    expect(pickBoss(12, fixed(0.99))?.name).toBe('마노');
  });

  it('레벨에 맞는 보스 전부에서 고른다', () => {
    const picked = new Set([0, 0.4, 0.99].map((value) => pickBoss(30, fixed(value))?.name));
    expect(picked).toEqual(new Set(['마노', '머쉬맘', '스텀피']));
  });

  it('레벨보다 높은 보스는 안 나온다', () => {
    for (let level = 10; level <= 300; level += 7) {
      const boss = pickBoss(level, fixed(0.99));
      expect(boss!.minLevel).toBeLessThanOrEqual(level);
    }
  });

  it('보스 목록은 레벨 순이고 몹 ID 가 겹치지 않는다', () => {
    const levels = BOSSES.map((boss) => boss.minLevel);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(BOSSES.map((boss) => boss.id)).size).toBe(BOSSES.length);
  });
});

describe('보스 보상', () => {
  it('기본 설정이면 경험치는 보통 몬스터의 20배, 메소는 10배쯤', () => {
    expect(BOSS_XP).toBe(KILL_XP * 20);
    const meso = bossMeso(henesys, fixed(0.5));
    // 보통 몬스터 몫과 보스 몫을 따로 반올림해서 1~2 메소 차이가 난다
    expect(Math.abs(meso - mesoDrop(henesys, fixed(0.5)) * BOSS_MESO_MULTIPLIER)).toBeLessThanOrEqual(2);
  });

  it('보스가 자주 나오면 한 번에 덜, 드물게 나오면 더 준다', () => {
    expect(bossXp({ encounterSeconds: 180, bossEvery: 10 })).toBe(KILL_XP * 10.5);
    expect(bossXp({ encounterSeconds: 180, bossEvery: 40 })).toBe(KILL_XP * 39);
    // 몬스터 주기가 짧으면 보통 몬스터도 보스도 그만큼 덜 준다
    expect(bossXp({ encounterSeconds: 60, bossEvery: 20 })).toBe(BOSS_XP / 3);
  });

  it('싸우는 횟수는 정해 둔 범위 안', () => {
    expect(bossHits(fixed(0))).toBe(BOSS_HITS_MIN);
    expect(bossHits(fixed(0.999))).toBe(BOSS_HITS_MAX);
  });
});

describe('지정한 보스', () => {
  const pinkBean = BOSSES.find((boss) => boss.name === '핑크빈')!;

  it('보스 차례에 무작위 대신 지정한 보스가 나온다', () => {
    expect(scheduledBoss(200, pinkBean.id, fixed(0))).toBe(pinkBean);
    expect(scheduledBoss(200, null, fixed(0))).toBe(BOSSES[0]);
  });

  it('레벨이 모자라거나 없는 보스면 무작위로 돌아간다', () => {
    expect(reservedBoss(100, pinkBean.id)).toBeNull();
    expect(reservedBoss(200, 1234)).toBeNull();
    expect(scheduledBoss(100, pinkBean.id, fixed(0))).toBe(BOSSES[0]);
  });

  it('밀린 사냥을 몰아 치를 때 지정한 보스는 첫 보스 차례에 한 번만 나오고 보상은 같다', () => {
    const plain = resolveHunts(progress(18, 30), DEFAULT_PACE, 200, henesys, 30, fixed(0));
    const reserved = resolveHunts(progress(18, 30), DEFAULT_PACE, 200, henesys, 30, fixed(0), pinkBean.id);
    expect(reserved.reservationUsed).toBe(true);
    expect(reserved.bosses).toEqual({ 핑크빈: 1, 마노: 1 });
    expect(plain.bosses).toEqual({ 마노: 2 });
    expect(plain.reservationUsed).toBe(false);
    expect(reserved.xp).toBe(plain.xp);
    expect(reserved.meso).toBe(plain.meso);
  });
});

describe('셔플 백', () => {
  // Lv.30: 마노·머쉬맘·스텀피 세 마리
  const LEVEL = 30;
  const eligible = BOSSES.filter((b) => b.minLevel <= LEVEL);

  it('한 주기 동안 자격 있는 보스가 각각 정확히 한 번씩 나온다', () => {
    let bag: number[] = [];
    let lastBossId: number | null = null;
    const seenInCycle: string[] = [];
    for (let i = 0; i < eligible.length; i += 1) {
      const drawn = drawFromBag(bag, lastBossId, LEVEL, Math.random);
      expect(drawn).not.toBeNull();
      seenInCycle.push(drawn!.boss.name);
      bag = drawn!.bag;
      lastBossId = drawn!.lastBossId;
    }
    expect(new Set(seenInCycle).size).toBe(eligible.length);
    expect(bag).toHaveLength(0);
  });

  it('여러 주기에 걸쳐 새 주기 첫 보스는 직전 주기 마지막 보스와 다르다', () => {
    let bag: number[] = [];
    let lastBossId: number | null = null;
    for (let cycle = 0; cycle < 10; cycle += 1) {
      let prevLastId: number | null = null;
      for (let i = 0; i < eligible.length; i += 1) {
        const drawn = drawFromBag(bag, lastBossId, LEVEL, Math.random);
        expect(drawn).not.toBeNull();
        if (i === 0 && prevLastId !== null) {
          expect(drawn!.boss.id).not.toBe(prevLastId);
        }
        bag = drawn!.bag;
        lastBossId = drawn!.lastBossId;
        if (i === eligible.length - 1) prevLastId = drawn!.boss.id;
      }
    }
  });

  it('fixed(0) 일 때 새 주기 첫 보스가 lastBossId 와 같으면 한 칸 뒤로 민다', () => {
    const firstEligibleId = eligible[0].id;
    // fixed(0) 셔플은 원래 순서를 유지하므로 첫 번째 = firstEligibleId
    const drawn = drawFromBag([], firstEligibleId, LEVEL, fixed(0));
    expect(drawn!.boss.id).not.toBe(firstEligibleId);
  });

  it('자격 없는 ID 는 새 주기 전에 가지치기한다', () => {
    // 핑크빈(minLevel 180) ID 를 레벨 30 백에 넣으면 바로 제거되고 자격 있는 보스로 채운다
    const pinkBeanId = BOSSES.find((b) => b.name === '핑크빈')!.id;
    const drawn = drawFromBag([pinkBeanId], null, LEVEL, Math.random);
    expect(drawn).not.toBeNull();
    expect(drawn!.boss.minLevel).toBeLessThanOrEqual(LEVEL);
    expect(drawn!.boss.id).not.toBe(pinkBeanId);
  });

  it('레벨이 올라 새로 자격 생긴 보스는 현재 주기가 끝난 뒤 합류한다', () => {
    // 레벨 18(머쉬맘 minLevel)에서 백을 채워 두면 스텀피(25)는 포함되지 않는다
    const LEVEL_LOW = 18;
    const drawn = drawFromBag([], null, LEVEL_LOW, Math.random);
    // 레벨 18 자격: 마노·머쉬맘 2마리만
    expect(drawn!.bag.length).toBe(1); // 2 - 1 = 1
    expect(drawn!.boss.minLevel).toBeLessThanOrEqual(LEVEL_LOW);
  });

  it('예약 보스는 백을 소비하지 않는다', () => {
    const pinkBean = BOSSES.find((b) => b.name === '핑크빈')!;
    const prog = progressWithBag(18, 5);
    const before = [...prog.bossBag!];
    resolveHunts(prog, DEFAULT_PACE, 200, henesys, 5, fixed(0), pinkBean.id);
    // 예약 보스가 쓰였으므로 백은 그대로여야 한다
    expect(prog.bossBag).toEqual(before);
    expect(prog.lastBossId).toBeNull();
  });

  it('resolveHunts 도 셔플 백을 쓰고 progress 를 갱신한다', () => {
    const prog = progressWithBag(18, 5); // 5 hunts: encounter 19 is a boss
    resolveHunts(prog, DEFAULT_PACE, LEVEL, henesys, 5, Math.random);
    // 보스 차례(19번)에 백에서 꺼냈으므로 lastBossId 가 설정되어야 한다
    expect(prog.lastBossId).not.toBeNull();
    expect(prog.bossBag).toBeDefined();
  });

  it('자격 있는 보스가 없으면 null', () => {
    expect(drawFromBag([], null, 5)).toBeNull();
  });

  it('자쿰은 원작 입장 레벨(50)부터 새 주기에 들어간다', () => {
    expect(BOSSES.find((b) => b.id === ZAKUM_ID)!.name).toBe('자쿰');
    const refill = (level: number) => {
      const drawn = drawFromBag([], null, level, fixed(0))!;
      return [drawn.boss.id, ...drawn.bag];
    };
    expect(refill(49)).not.toContain(ZAKUM_ID);
    expect(refill(50)).toContain(ZAKUM_ID);
  });
});
