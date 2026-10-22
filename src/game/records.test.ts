import { describe, expect, it } from 'vitest';
import { BOSSES } from './bosses';
import {
  baselineAdvancements,
  bossRecord,
  formatDay,
  formatTogetherTime,
  mergeAdvancements,
  normalizeAdvancements,
  noteAdvancements,
} from './records';
import { TOWNS } from './towns';

describe('함께한 시간', () => {
  it('시간과 분으로 적는다', () => {
    expect(formatTogetherTime(123 * 3600 + 45 * 60 + 59)).toBe('123시간 45분');
    expect(formatTogetherTime(3600)).toBe('1시간 0분');
    expect(formatTogetherTime(45 * 60)).toBe('45분');
  });

  it('1분이 안 되면 「1분 미만」, 천 시간이 넘으면 자릿수를 끊는다', () => {
    expect(formatTogetherTime(0)).toBe('1분 미만');
    expect(formatTogetherTime(59)).toBe('1분 미만');
    expect(formatTogetherTime(1234 * 3600)).toBe('1,234시간 0분');
  });

  it('날짜는 「2026.10.22」 꼴이다', () => {
    expect(formatDay(new Date(2026, 9, 2, 13, 5).getTime())).toBe('2026.10.02');
  });
});

describe('전직 기록', () => {
  it('기록 칸이 없던 저장은 이미 한 전직을 날짜 모름으로 둔다', () => {
    expect(normalizeAdvancements(undefined, 4)).toEqual({ 1: null, 2: null, 3: null, 4: null });
    expect(normalizeAdvancements(undefined, 0)).toEqual({});
  });

  it('저장된 기록은 그대로 읽고 이상한 값은 버린다', () => {
    const saved = JSON.parse(JSON.stringify({ 1: null, 2: 1700000000000, 3: 'x', 4: -5, 9: 1 }));
    expect(normalizeAdvancements(saved, 6)).toEqual({ 1: null, 2: 1700000000000 });
  });

  it('지금 차수까지 아직 안 적은 전직만 지금 시각으로 적는다', () => {
    const log = baselineAdvancements(2);
    expect(noteAdvancements(log, 2, 1000)).toEqual([]);
    expect(noteAdvancements(log, 4, 2000)).toEqual([3, 4]);
    expect(log).toEqual({ 1: null, 2: null, 3: 2000, 4: 2000 });
    expect(noteAdvancements(log, 4, 3000)).toEqual([]);
  });

  it('합칠 때는 날짜가 있는 쪽, 둘 다 있으면 이른 쪽이다', () => {
    const merged = mergeAdvancements({ 1: null, 2: 500, 3: 900 }, { 1: 100, 2: 700, 4: null });
    expect(merged).toEqual({ 1: 100, 2: 500, 3: 900, 4: null });
    expect(mergeAdvancements(merged, { 1: 100 })).toEqual(merged);
  });
});

describe('보스 기록', () => {
  it('몬스터 기록에서 보스 이름만 센다', () => {
    const record = bossRecord({ 주황버섯: 30, 머쉬맘: 2, 레비아탄: 1, 다일: 4 });
    expect(record.total).toBe(7);
    expect(record.strongest?.name).toBe('레비아탄');
    expect(bossRecord({ 주황버섯: 3 })).toEqual({ total: 0, strongest: null });
  });

  it('보스 이름은 마을 몬스터와 겹치지 않는다', () => {
    const monsters = new Set(TOWNS.flatMap((town) => town.monsters.map((monster) => monster.name)));
    BOSSES.forEach((boss) => expect(monsters.has(boss.name)).toBe(false));
  });
});
