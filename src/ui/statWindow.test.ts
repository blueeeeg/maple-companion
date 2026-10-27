import { describe, expect, it } from 'vitest';
import { type StatWindowState, jobChangeTitle, summaryValues } from './statWindow';

const DAY = new Date(2026, 9, 27, 12).getTime();

const state = (change: Partial<StatWindowState> = {}): StatWindowState => ({
  name: '바다',
  level: 120,
  jobName: '캡틴',
  tier: 4,
  xpIntoLevel: 6,
  xpForLevel: 2192,
  ratio: 0.003,
  activeSeconds: 0,
  hunts: 321,
  bosses: { total: 0, strongest: null },
  meso: 123_456,
  advancedAt: { 1: DAY - 3, 2: DAY - 2, 3: DAY - 1, 4: DAY },
  jobHistory: [],
  canChangeJob: true,
  freeJobChange: false,
  collection: { owned: 3, total: 79 },
  look: [],
  standAction: 'stand1',
  ...change,
});

describe('캐릭터 정보창 줄', () => {
  it('「직업」 줄은 차수 없는 이름만 적는다. 차수는 「전직」 줄에 있다', () => {
    expect(summaryValues(state()).job).toEqual({ text: '캡틴', title: '캡틴' });
    expect(summaryValues(state({ jobName: '아크메이지(썬,콜)' })).job.text).toBe('아크메이지(썬,콜)');
  });

  it('「전직」 줄은 바꿀 수 있어도 날짜를 줄이지 않는다', () => {
    expect(summaryValues(state()).advancement.text).toBe('4차 · 2026.10.27');
    expect(summaryValues(state({ canChangeJob: false })).advancement.text).toBe('4차 · 2026.10.27');
  });

  it('전직 전이거나 날짜를 모르는 차수', () => {
    expect(summaryValues(state({ tier: 0, jobName: '초보자', canChangeJob: false })).advancement.text).toBe('아직 전직 전');
    expect(summaryValues(state({ advancedAt: { 1: null, 2: null, 3: null, 4: null } })).advancement.text).toBe('4차 · 기록 전');
  });

  it('「바꾸기」 풍선 도움말은 값을, 무료 한 번이 남았으면 무료라고 적는다', () => {
    expect(jobChangeTitle(false)).toBe('같은 계열 다른 직업으로 · 50,000 메소');
    expect(jobChangeTitle(true)).toBe('같은 계열 다른 직업으로 · 한 번 무료');
  });
});
