import { describe, expect, it } from 'vitest';
import { BOSS_XP, DEFAULT_PACE, type HuntProgress, bossDue, pickBoss, settleHunt } from './bosses';
import { encountersDue, killXp, retimeHunts, skipHunts } from './encounters';
import { XP_PER_ACTIVE_SECOND } from './progression';
import {
  BOSS_EVERY_OPTIONS,
  DEFAULT_SETTINGS,
  ENCOUNTER_MINUTE_OPTIONS,
  type Settings,
  bossMesoShare,
  hourlyXp,
  huntPace,
  idleLimitSeconds,
  levelUpScale,
  normalizeSettings,
  parseSettings,
  pinnedTown,
  townRotateMs,
} from './settings';
import { type Town, unlockedTowns } from './towns';

const TICK_SECONDS = 2;
const LEVEL = 120;
const town: Town = unlockedTowns(LEVEL).slice(-1)[0];
/** 보스가 모인 사냥 시간의 보통 몬스터 경험치에 더 얹어 주는 비율. 기본 설정(1시간 몫에 1140)에서 거꾸로 구한다 */
const BOSS_XP_RATE = (BOSS_XP - 60) / killXp(20 * 180);
const withSettings = (change: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...change });

/**
 * main.ts 의 틱과 같은 순서로 활동 시간을 쌓고 사냥을 치른다. 설정이 바뀌면 바로 retimeHunts 를 부르고,
 * 몬스터를 끈 동안은 skipHunts 로 진행을 멈춘다. 메소 무작위 값은 가운데(0.5)로 고정한다
 */
function simulate(settingsAt: (seconds: number) => Settings, hours: number) {
  const character: HuntProgress = {
    activeSeconds: 0,
    huntSeconds: 0,
    huntBonusSeconds: 0,
    encountersResolved: 0,
    bossChargeSeconds: 0,
  };
  let settings = settingsAt(0);
  let xp = 0;
  let meso = 0;
  let bosses = 0;
  for (let elapsed = 0; elapsed < hours * 3600; elapsed += TICK_SECONDS) {
    const next = settingsAt(elapsed);
    if (next.encounterMinutes !== settings.encounterMinutes && next.encounterMinutes !== null) {
      retimeHunts(character, next.encounterMinutes * 60);
    }
    settings = next;
    character.activeSeconds += TICK_SECONDS;
    xp += TICK_SECONDS * XP_PER_ACTIVE_SECOND;
    const pace = huntPace(settings);
    if (!pace) {
      skipHunts(character, TICK_SECONDS);
      continue;
    }
    for (let due = encountersDue(character, pace.encounterSeconds); due > 0; due -= 1) {
      const boss = bossDue(character, pace) && pickBoss(LEVEL) !== null;
      const reward = settleHunt(character, pace, town, boss, () => 0.5);
      xp += reward.xp;
      meso += reward.meso;
      if (boss) bosses += 1;
    }
  }
  return { xp, meso, bosses, pending: character.activeSeconds - character.huntSeconds, bossCharge: character.bossChargeSeconds };
}

// 20시간이면 어느 주기·보스 간격 조합이든 사냥 수가 보스 간격으로 나누어떨어져서 끝자리 차이 없이 비교된다
const HOURS = 20;
const baseline = simulate(() => DEFAULT_SETTINGS, HOURS);
const expectedXpPerHour = 3600 * XP_PER_ACTIVE_SECOND + 20 * 60 + BOSS_XP - 60;

describe('몬스터 주기·보스 간격과 시간당 보상', () => {
  it('기본 설정의 시간당 EXP 는 활동 3600 + 사냥 2340', () => {
    expect(baseline.xp / HOURS).toBe(expectedXpPerHour);
    expect(expectedXpPerHour).toBe(5940);
    expect(baseline.bosses).toBe(HOURS);
  });

  ENCOUNTER_MINUTE_OPTIONS.forEach((minutes) => {
    BOSS_EVERY_OPTIONS.forEach((bossEvery) => {
      it(`${minutes}분마다 · 보스 ${bossEvery}마리마다여도 시간당 EXP 는 같고 메소는 반올림 차이뿐이다`, () => {
        const result = simulate(() => withSettings({ encounterMinutes: minutes, bossEvery }), HOURS);
        expect(result.xp).toBe(baseline.xp);
        expect(Math.abs(result.meso - baseline.meso) / baseline.meso).toBeLessThan(0.005);
        expect(result.pending).toBe(0);
      });
    });
  });

  it('주기·보스 간격을 수시로 바꿔도 시간당 보상이 늘거나 줄지 않는다', () => {
    const options = ENCOUNTER_MINUTE_OPTIONS;
    // 37분마다 다음 주기로, 53분마다 다음 보스 간격으로 바꾼다. 끝날 때 남은 진행·보스 차례가 밀린 만큼만 차이 난다
    const result = simulate(
      (seconds) =>
        withSettings({
          encounterMinutes: options[Math.floor(seconds / (37 * 60)) % options.length],
          bossEvery: BOSS_EVERY_OPTIONS[Math.floor(seconds / (53 * 60)) % BOSS_EVERY_OPTIONS.length],
        }),
      HOURS,
    );
    // 끝날 때 아직 다음 보스에 안 쓰인 보스 몫과 다음 마리까지 남은 진행만큼만 덜 받았다
    const unpaid = killXp(result.bossCharge) * BOSS_XP_RATE + killXp(result.pending);
    expect(result.xp + unpaid).toBeCloseTo(baseline.xp, 6);
    expect(Math.abs(result.meso - baseline.meso) / baseline.meso).toBeLessThan(0.02);
  });

  it('몬스터를 끄면 활동 EXP 만 쌓이고 보스도 안 나온다', () => {
    const result = simulate(() => withSettings({ encounterMinutes: null }), HOURS);
    expect(result).toMatchObject({ xp: 3600 * HOURS, meso: 0, bosses: 0 });
  });

  it('보스만 끄면 보스가 더 주는 몫만 빠진다', () => {
    const result = simulate(() => withSettings({ bossEvery: null }), HOURS);
    expect(result.bosses).toBe(0);
    expect(result.xp).toBe(baseline.xp - (BOSS_XP - 60) * HOURS);
  });

  it('안내 문구용 시간당 몫이 실제와 맞는다', () => {
    const share = hourlyXp(DEFAULT_SETTINGS);
    expect(share.activity + share.monsters + share.bossBonus).toBe(baseline.xp / HOURS);
    expect(hourlyXp(withSettings({ encounterMinutes: 10, bossEvery: 40 }))).toEqual(share);
    expect(hourlyXp(withSettings({ encounterMinutes: null }))).toEqual({ activity: 3600, monsters: 0, bossBonus: 0 });
    expect(hourlyXp(withSettings({ bossEvery: null })).bossBonus).toBe(0);
    // 보스 몫은 시간당 메소의 9/29 쯤이다
    expect(bossMesoShare()).toBeCloseTo(9 / 29, 10);
  });
});

describe('주기를 바꾸는 순간', () => {
  const clock = (pending: number): HuntProgress => ({
    activeSeconds: 10_000 + pending,
    huntSeconds: 10_000,
    huntBonusSeconds: 0,
    encountersResolved: 0,
    bossChargeSeconds: 0,
  });

  it('10분에서 1분으로 줄이면 한 마리만 바로 나오고 그 한 마리가 쌓인 몫을 다 준다', () => {
    const character = clock(590);
    retimeHunts(character, 60);
    expect(encountersDue(character, 60)).toBe(1);
    const reward = settleHunt(character, { ...DEFAULT_PACE, encounterSeconds: 60 }, town, false, () => 0.5);
    // 590초 중 1분 단위로 끊어지는 540초 몫. 남은 50초는 다음 마리로 이어진다
    expect(reward.xp).toBe(killXp(540));
    expect(character.activeSeconds - character.huntSeconds).toBe(50);
    expect(character.huntBonusSeconds).toBe(0);
    expect(character.encountersResolved).toBe(1);
    // 합친 몫도 보스 몫에 모인다
    expect(character.bossChargeSeconds).toBe(540);
  });

  it('주기를 늘리면 쌓인 진행이 그대로 이어진다', () => {
    const character = clock(50);
    retimeHunts(character, 600);
    expect(character).toEqual(clock(50));
    expect(encountersDue(character, 600)).toBe(0);
  });

  it('보스 간격을 바꿔도 모인 보스 몫은 그대로다', () => {
    const character = clock(0);
    character.bossChargeSeconds = 180 * 15;
    // 20마리마다였다면 5마리 뒤가 보스. 10마리마다로 줄이면 바로 보스지만 모인 15마리 몫만 준다
    expect(bossDue(character, { encounterSeconds: 180, bossEvery: 20 })).toBe(false);
    const pace = { encounterSeconds: 180, bossEvery: 10 };
    expect(bossDue(character, pace)).toBe(true);
    character.activeSeconds += 180;
    const reward = settleHunt(character, pace, town, true, () => 0.5);
    expect(reward.xp).toBe(killXp(180) + killXp(180 * 16) * BOSS_XP_RATE);
    expect(character.bossChargeSeconds).toBe(0);
  });

  it('몬스터를 껐다 켜도 꺼 둔 동안의 사냥이 한꺼번에 나오지 않는다', () => {
    const character = clock(100);
    character.activeSeconds += 3600;
    skipHunts(character, 3600);
    expect(encountersDue(character, 180)).toBe(0);
    expect(character.activeSeconds - character.huntSeconds).toBe(100);
  });
});

describe('설정 저장', () => {
  it('저장이 없거나 깨졌으면 기본값', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS);
  });

  it('기본값', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      encounterMinutes: 3,
      bossEvery: 20,
      damageNumbers: true,
      townRotate: true,
      townRotateMinutes: 8,
      pinnedTownId: null,
      bgmVolume: 35,
      levelUpEffect: 'original',
      idleMinutes: 2,
    });
  });

  it('목록에 없는 값은 기본값으로, 끄기(null)는 그대로 받는다', () => {
    const settings = normalizeSettings({
      encounterMinutes: 7,
      bossEvery: null,
      damageNumbers: 'no',
      townRotateMinutes: 15,
      pinnedTownId: 'atlantis',
      bgmVolume: 180,
      levelUpEffect: 'small',
      idleMinutes: 10,
    });
    expect(settings).toMatchObject({
      encounterMinutes: 3,
      bossEvery: null,
      damageNumbers: true,
      townRotateMinutes: 15,
      pinnedTownId: null,
      bgmVolume: 100,
      levelUpEffect: 'small',
      idleMinutes: 10,
    });
    expect(normalizeSettings({ encounterMinutes: null }).encounterMinutes).toBeNull();
    expect(normalizeSettings({ bgmVolume: 0 }).bgmVolume).toBe(0);
    expect(normalizeSettings({ bgmVolume: '' }).bgmVolume).toBe(0);
  });

  it('저장했다 읽으면 그대로다', () => {
    const settings = withSettings({ encounterMinutes: null, pinnedTownId: 'ellinia', bgmVolume: 0, idleMinutes: 5 });
    expect(parseSettings(JSON.stringify(settings))).toEqual(settings);
  });
});

describe('설정 해석', () => {
  it('몬스터 주기는 초로, 끄면 null', () => {
    expect(huntPace(DEFAULT_SETTINGS)).toEqual(DEFAULT_PACE);
    expect(huntPace(withSettings({ encounterMinutes: 10, bossEvery: null }))).toEqual({ encounterSeconds: 600, bossEvery: null });
    expect(huntPace(withSettings({ encounterMinutes: null }))).toBeNull();
  });

  it('마을을 고정하거나 자동 이동을 끄면 돌지 않는다', () => {
    expect(townRotateMs(DEFAULT_SETTINGS)).toBe(8 * 60 * 1000);
    expect(townRotateMs(withSettings({ townRotate: false }))).toBeNull();
    expect(townRotateMs(withSettings({ pinnedTownId: 'ellinia' }))).toBeNull();
  });

  it('고정한 마을이 아직 안 열렸으면 자동', () => {
    const settings = withSettings({ pinnedTownId: 'leafre' });
    expect(pinnedTown(settings, 200)?.id).toBe('leafre');
    expect(pinnedTown(settings, 5)).toBeNull();
    expect(pinnedTown(DEFAULT_SETTINGS, 200)).toBeNull();
  });

  it('레벨업 이펙트·자리 비움', () => {
    expect(levelUpScale(DEFAULT_SETTINGS)).toBe(1);
    expect(levelUpScale(withSettings({ levelUpEffect: 'small' }))).toBe(0.65);
    expect(idleLimitSeconds(DEFAULT_SETTINGS)).toBe(120);
    expect(idleLimitSeconds(withSettings({ idleMinutes: 10 }))).toBe(600);
  });
});
