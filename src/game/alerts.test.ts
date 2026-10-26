import { describe, expect, it } from 'vitest';
import { describeAlert, firstAlert, shouldAlert } from './alerts';
import { DEFAULT_SETTINGS, normalizeSettings, parseSettings } from './settings';

describe('언제 알리나', () => {
  const on = { jobAlerts: true };

  it('창이 숨었거나 다른 앱을 보고 있을 때만 알린다', () => {
    expect(shouldAlert(on, { shown: false, focused: false })).toBe(true);
    expect(shouldAlert(on, { shown: true, focused: false })).toBe(true);
    // 숨긴 창이 포커스를 들고 있다고 나와도 볼 수 없다
    expect(shouldAlert(on, { shown: false, focused: true })).toBe(true);
    expect(shouldAlert(on, { shown: true, focused: true })).toBe(false);
  });

  it('설정에서 끄면 알리지 않는다', () => {
    expect(shouldAlert({ jobAlerts: false }, { shown: false, focused: false })).toBe(false);
  });
});

describe('같은 일은 한 번만', () => {
  it('같은 key 는 두 번째부터 false', () => {
    const sent = new Set<string>();
    expect(firstAlert(sent, 'job-choice:a')).toBe(true);
    expect(firstAlert(sent, 'job-choice:a')).toBe(false);
    expect(firstAlert(sent, 'job-choice:b')).toBe(true);
  });

  it('직업 고르기는 캐릭터마다, 전직은 캐릭터·차수마다 하나다', () => {
    const choice = (level: number) =>
      describeAlert({ kind: 'job-choice', characterId: 'a', characterName: '단풍이', level }).key;
    const advancement = (characterId: string, tier: number) =>
      describeAlert({ kind: 'advancement', characterId, characterName: '단풍이', tier, jobTitle: '파이터 · 2차' }).key;
    expect(choice(10)).toBe(choice(11));
    expect(advancement('a', 2)).not.toBe(advancement('a', 3));
    expect(advancement('a', 2)).not.toBe(advancement('b', 2));
    expect(advancement('a', 2)).not.toBe(choice(10));
  });

  it('장비 드롭은 캐릭터·아이템마다 하나다', () => {
    const drop = (characterId: string, itemId: number) =>
      describeAlert({ kind: 'equip-drop', characterId, characterName: '단풍이', itemId, itemName: '자쿰의 투구', bossName: '자쿰' });
    expect(drop('a', 1002357).key).not.toBe(drop('a', 1003112).key);
    expect(drop('a', 1002357).key).not.toBe(drop('b', 1002357).key);
    expect(drop('a', 1002357).body).toContain('자쿰의 투구');
  });

  it('2차 갈래 고르기는 캐릭터마다 하나이고 전직관 이름을 적는다', () => {
    const alert = describeAlert({ kind: 'branch-choice', characterId: 'a', characterName: '바다', level: 30, instructor: '카이린' });
    expect(alert.key).toBe('branch-choice:a');
    expect(alert.key).not.toBe(describeAlert({ kind: 'job-choice', characterId: 'a', characterName: '바다', level: 30 }).key);
    expect(alert.title).toBe('바다 전직 가능!');
    expect(alert.body).toContain('카이린에게 2차 전직 갈래');
  });

  it('알림 문구에 캐릭터 이름과 차수가 들어간다', () => {
    expect(describeAlert({ kind: 'job-choice', characterId: 'a', characterName: '단풍이', level: 10 })).toMatchObject({
      title: '단풍이 전직 가능!',
    });
    expect(
      describeAlert({ kind: 'advancement', characterId: 'a', characterName: '단풍이', tier: 2, jobTitle: '파이터 · 2차' }),
    ).toMatchObject({ title: '단풍이 2차 전직!', body: '전직 완료: 파이터 · 2차' });
  });
});

describe('알림 설정', () => {
  it('기본은 켜져 있고, 예전 저장에는 없어서 켜진 채로 읽는다', () => {
    expect(DEFAULT_SETTINGS.jobAlerts).toBe(true);
    expect(parseSettings(JSON.stringify({ version: 1, idleMinutes: 5 })).jobAlerts).toBe(true);
  });

  it('끈 것은 그대로, 불리언이 아니면 기본값', () => {
    expect(normalizeSettings({ jobAlerts: false }).jobAlerts).toBe(false);
    expect(normalizeSettings({ jobAlerts: 'no' }).jobAlerts).toBe(true);
    expect(parseSettings(JSON.stringify({ ...DEFAULT_SETTINGS, jobAlerts: false })).jobAlerts).toBe(false);
  });
});
