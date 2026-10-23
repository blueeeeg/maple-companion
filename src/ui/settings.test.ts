import { describe, expect, it } from 'vitest';
import { bossHint, formatMinutes, townHint } from './settings';

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

describe('마을 안내', () => {
  it('돌아다니면 고른 시간과 함께 적는다', () => {
    expect(townHint(8, null)).toBe('8분마다 최근에 열린 마을을 돌아다녀요');
    expect(townHint(30, null)).toMatch(/^30분마다/);
  });

  it('머물면 그 마을과 사냥터에만 있다고 적는다. 사냥터가 없으면 마을만', () => {
    expect(townHint(8, { name: '커닝시티', open: true, hasFields: true })).toBe('커닝시티와 그 사냥터에만 있어요');
    expect(townHint(8, { name: '페리온', open: true, hasFields: true })).toBe('페리온과 그 사냥터에만 있어요');
    expect(townHint(8, { name: '리스항구', open: true, hasFields: false })).toBe('리스항구에만 있어요');
  });

  it('머물 마을이 아직 안 열린 캐릭터는 돌아다닌다고 적는다', () => {
    expect(townHint(15, { name: '리프레', open: false, hasFields: true })).toBe(
      '리프레는 이 캐릭터에게 아직 안 열려서 15분마다 최근에 열린 마을을 돌아다녀요',
    );
    expect(townHint(8, { name: '무릉', open: false, hasFields: false })).toMatch(/^무릉은 /);
  });
});
