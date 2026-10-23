import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from './appearance';
import { BOSSES, BOSS_XP, DEFAULT_PACE, type HuntPace, type HuntProgress, bossDue, resolveHunts } from './bosses';
import { bossTurn, bossWaitSeconds, formatBossWait, normalizeReservedBoss, settleBossFight } from './bossChallenge';
import { type Character, createCharacter } from './characters';
import { encountersDue } from './encounters';
import { TOWNS } from './towns';

const henesys = TOWNS[0];
const fixed = (value: number) => () => value;
const pinkBean = BOSSES.find((boss) => boss.name === '핑크빈')!;
const mano = BOSSES[0];

const progress = (encountersResolved: number, banked = 0): HuntProgress => ({
  activeSeconds: encountersResolved * 180 + banked,
  huntSeconds: encountersResolved * 180,
  huntBonusSeconds: 0,
  encountersResolved,
  bossChargeSeconds: (encountersResolved % 20) * 180,
});

const freshCharacter = (change: Partial<Character> = {}): Character => ({
  ...createCharacter('a', '테스트', DEFAULT_APPEARANCE),
  ...change,
});

describe('보스 지정 저장값', () => {
  it('있는 보스 ID 만 남기고 나머지는 지정 없음이다', () => {
    expect(normalizeReservedBoss(pinkBean.id)).toBe(pinkBean.id);
    expect(normalizeReservedBoss(undefined)).toBeNull();
    expect(normalizeReservedBoss(null)).toBeNull();
    expect(normalizeReservedBoss(1234)).toBeNull();
    expect(normalizeReservedBoss(String(pinkBean.id))).toBeNull();
  });
});

describe('다음 보스까지 남은 시간', () => {
  it('보스 몫이 다 찼으면 보스 차례다', () => {
    expect(bossTurn(progress(19), DEFAULT_PACE)).toEqual({ kind: 'ready' });
  });

  it('남은 보통 사냥 수와 지금 쌓인 사냥 시계로 센다', () => {
    // 막 보스를 잡았으면 보통 19번 + 보스 1번 = 20번 몫
    expect(bossWaitSeconds(progress(20), DEFAULT_PACE)).toBe(20 * 180);
    // 18번째까지 잡고 다음 몬스터까지 60초가 쌓였으면 19번째(보통) 뒤 20번째가 보스다
    expect(bossTurn(progress(18, 60), DEFAULT_PACE)).toEqual({ kind: 'waiting', seconds: 2 * 180 - 60 });
  });

  it('보스·몬스터를 꺼 두면 보스 차례가 오지 않는다', () => {
    expect(bossTurn(progress(19), { ...DEFAULT_PACE, bossEvery: null })).toEqual({ kind: 'off', reason: 'bosses' });
    expect(bossTurn(progress(19), null)).toEqual({ kind: 'off', reason: 'monsters' });
  });

  it('센 시간만큼 활동하면 그때 보스가 나오고 1초 전에는 안 나온다', () => {
    const paces: HuntPace[] = [DEFAULT_PACE, { encounterSeconds: 300, bossEvery: 7 }, { encounterSeconds: 60, bossEvery: 2 }];
    paces.forEach((pace) => {
      [0, 3, 5].forEach((resolved) => {
        const start = progress(resolved, 37);
        start.bossChargeSeconds = (resolved % pace.bossEvery!) * pace.encounterSeconds;
        start.activeSeconds = resolved * pace.encounterSeconds + 37;
        start.huntSeconds = resolved * pace.encounterSeconds;
        const wait = bossWaitSeconds(start, pace)!;
        const early = { ...start, activeSeconds: start.activeSeconds + wait - 1 };
        const before = resolveHunts(early, pace, 200, henesys, encountersDue(early, pace.encounterSeconds), fixed(0));
        expect(Object.keys(before.bosses)).toEqual([]);
        early.activeSeconds += 1;
        const at = resolveHunts(early, pace, 200, henesys, encountersDue(early, pace.encounterSeconds), fixed(0));
        expect(Object.keys(at.bosses)).toHaveLength(1);
      });
    });
  });

  it('「약 23분」 처럼 분 단위로 올려 적는다', () => {
    expect(formatBossWait(22 * 60 + 1)).toBe('약 23분');
    expect(formatBossWait(20)).toBe('약 1분');
    expect(formatBossWait(3600)).toBe('약 1시간');
    expect(formatBossWait(3600 + 5 * 60)).toBe('약 1시간 5분');
  });
});

describe('연습전', () => {
  it('경험치·메소·처치 기록을 주지 않고 사냥 진행도 그대로다', () => {
    const character = freshCharacter({ ...progress(7, 90), killXp: 500, meso: 1234, monsterBook: { 달팽이: 3 }, reservedBossId: mano.id });
    const before = structuredClone(character);
    expect(settleBossFight(character, DEFAULT_PACE, henesys, mano, true, fixed(0.5))).toEqual({ xp: 0, meso: 0 });
    expect(character).toEqual(before);
  });

  it('보스 차례가 온 상태에서 연습전을 해도 보스 차례는 그대로 남는다', () => {
    const character = freshCharacter(progress(19));
    settleBossFight(character, DEFAULT_PACE, henesys, pinkBean, true);
    expect(bossDue(character, DEFAULT_PACE)).toBe(true);
    expect(character.bossChargeSeconds).toBe(19 * 180);
    expect(character.huntSeconds).toBe(19 * 180);
  });
});

describe('진짜 도전', () => {
  it('보스 차례를 써서 보통 보스와 같은 보상을 주고 처치를 센다', () => {
    const character = freshCharacter(progress(19, 180));
    const reward = settleBossFight(character, DEFAULT_PACE, henesys, pinkBean, false, fixed(0.5));
    expect(reward.xp).toBe(BOSS_XP);
    expect(character.killXp).toBe(BOSS_XP);
    expect(character.monsterBook).toEqual({ 핑크빈: 1 });
    expect(character.bossChargeSeconds).toBe(0);
    expect(character.encountersResolved).toBe(20);
  });

  it('지정해 둔 그 보스를 잡았을 때만 지정을 지운다', () => {
    const other = freshCharacter({ ...progress(19), reservedBossId: mano.id });
    settleBossFight(other, DEFAULT_PACE, henesys, pinkBean, false);
    expect(other.reservedBossId).toBe(mano.id);
    const same = freshCharacter({ ...progress(19), reservedBossId: pinkBean.id });
    settleBossFight(same, DEFAULT_PACE, henesys, pinkBean, false);
    expect(same.reservedBossId).toBeNull();
  });
});

/**
 * 활동 시간을 1분씩 늘리며 main.ts 처럼 밀린 사냥을 치른다. 보스 지정·「지금 도전」(사냥이 오기 전에 보스 차례를 미리 씀)·
 * 연습전을 섞어도 끝에 같은 수의 사냥을 치렀으면 경험치·메소가 똑같아야 한다
 */
function simulate(minutes: number, options: { reserve?: number; challengeEarly?: boolean; practiceEvery?: number }) {
  const random = fixed(0.5);
  const character = freshCharacter({ reservedBossId: options.reserve ?? null });
  const bosses: string[] = [];
  for (let minute = 1; minute <= minutes; minute += 1) {
    character.activeSeconds += 60;
    if (options.practiceEvery && minute % options.practiceEvery === 0) {
      settleBossFight(character, DEFAULT_PACE, henesys, pinkBean, true, random);
    }
    if (options.challengeEarly && bossDue(character, DEFAULT_PACE) && encountersDue(character, 180) === 0) {
      settleBossFight(character, DEFAULT_PACE, henesys, pinkBean, false, random);
      bosses.push(pinkBean.name);
    }
    const due = encountersDue(character, 180);
    if (due === 0) continue;
    const result = resolveHunts(character, DEFAULT_PACE, 200, henesys, due, random, character.reservedBossId);
    character.killXp += result.xp;
    character.meso += result.meso;
    if (result.reservationUsed) character.reservedBossId = null;
    Object.entries(result.bosses).forEach(([name, count]) => bosses.push(...Array<string>(count).fill(name)));
  }
  return { xp: character.killXp, meso: character.meso, hunts: character.encountersResolved, bosses };
}

describe('시간당 보상은 그대로', () => {
  // 3분 × 20번 = 1시간마다 보스. 10시간 뒤 정각이면 어느 쪽이든 보스 10번을 다 치렀다
  const HOURS = 10 * 60;
  const baseline = simulate(HOURS, {});

  it('보스를 지정해도 경험치·메소 합계가 같고 지정한 보스는 다음 보스 차례에 한 번만 나온다', () => {
    const reserved = simulate(HOURS, { reserve: mano.id });
    expect(reserved.xp).toBe(baseline.xp);
    expect(reserved.meso).toBe(baseline.meso);
    expect(reserved.bosses).toHaveLength(10);
    // 지정한 보스는 첫 번째 차례에 나온다
    expect(reserved.bosses[0]).toBe(mano.name);
    // 이후 9번은 셔플 백 순서로 나오므로 baseline 과 순서가 다를 수 있다. 보상은 위에서 이미 확인
    expect(reserved.bosses.slice(1).every((name) => BOSSES.some((b) => b.name === name))).toBe(true);
  });

  it('보스 차례가 오자마자 「지금 도전」 해도 합계가 같다', () => {
    const early = simulate(HOURS, { challengeEarly: true });
    expect(early.hunts).toBe(baseline.hunts);
    expect(early.xp).toBe(baseline.xp);
    expect(early.meso).toBe(baseline.meso);
    expect(early.bosses).toHaveLength(10);
  });

  it('연습전을 몇 번 하든 합계가 같다', () => {
    const practiced = simulate(HOURS, { practiceEvery: 7 });
    expect(practiced).toEqual(baseline);
  });
});
