import { describe, expect, it } from 'vitest';
import { bossHint, formatMinutes, townRotateHint } from './settings';

describe('활동 시간 표기', () => {
  it('한 시간 아래는 분, 넘으면 시간과 남은 분', () => {
    expect(formatMinutes(30)).toBe('30분');
    expect(formatMinutes(60)).toBe('1시간');
    expect(formatMinutes(400)).toBe('6시간 40분');
  });
});

describe('보스 안내', () => {
  it('몬스터 주기 × 보스 간격을 활동 시간으로 함께 적는다', () => {
    expect(bossHint(10, 3)).toMatch(/^사냥 10번마다 1번은 보스예요\(활동 약 30분마다\)/);
    expect(bossHint(20, 3)).toContain('활동 약 1시간마다');
    expect(bossHint(40, 10)).toContain('활동 약 6시간 40분마다');
  });

  it('시간당 보상이 같다는 말은 남긴다', () => {
    expect(bossHint(20, 3)).toContain('시간당 보상은 같아요');
  });

  it('몬스터를 끈 동안은 시간 대신 켜야 나온다고 적는다', () => {
    expect(bossHint(20, null)).toBe('사냥 20번마다 1번은 보스예요. 몬스터를 켜야 나와요');
  });
});

describe('마을 이동 안내', () => {
  it('고정 중이면 고정한 마을과 푸는 법을 적는다', () => {
    expect(townRotateHint(true, '리스항구')).toBe('리스항구 고정 중이라 쉬어요 · 마을 고정을 「자동」으로 바꾸면 골라요');
  });

  it('자동을 꺼 둬도 고정이 먼저다', () => {
    expect(townRotateHint(false, '리스항구')).toMatch(/^리스항구 고정 중/);
  });

  it('고정한 마을이 아직 안 열렸으면 자동으로 도는 힌트를 적는다', () => {
    expect(townRotateHint(true, '안 열린 마을', false)).toBe('고정한 마을이 아직 안 열려서 자동으로 돌아요');
    expect(townRotateHint(false, '안 열린 마을', false)).toBe('고정한 마을이 아직 안 열려서 자동으로 돌아요');
  });

  it('고정 없이 자동을 껐으면 자동을 켜라고 한다', () => {
    expect(townRotateHint(false, null)).toContain('「자동」을 켜면 시간을 골라요');
  });

  it('돌고 있으면 평소 안내', () => {
    expect(townRotateHint(true, null)).toBe('정해 둔 시간마다 최근에 열린 마을 중 하나로 옮겨요');
  });
});
