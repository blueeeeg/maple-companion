import { describe, expect, it } from 'vitest';
import type { SkillInfo } from './api';
import { evictionPlan, trimSkillInfo } from './skillStore';

describe('스킬 데이터 저장 예산', () => {
  it('예산 안이면 아무것도 안 지운다', () => {
    expect(evictionPlan({ 1: { bytes: 10, usedAt: 1 }, 2: { bytes: 10, usedAt: 2 } }, 20)).toEqual([]);
  });

  it('넘으면 마지막으로 쓴 때가 오래된 것부터 예산 안에 들 때까지 지운다', () => {
    const index = { 1: { bytes: 30, usedAt: 300 }, 2: { bytes: 30, usedAt: 100 }, 3: { bytes: 30, usedAt: 200 } };
    expect(evictionPlan(index, 60)).toEqual(['2']);
    expect(evictionPlan(index, 30)).toEqual(['2', '3']);
  });
});

describe('스킬 데이터 줄이기', () => {
  it('그리는 데 쓰는 이름·사거리·타수·이펙트·동작만 남긴다', () => {
    const frame = { image: 'AAAA', delay: 90, origin: { x: 1, y: 2 } };
    const raw = {
      description: { name: '인피니티', desc: '긴 설명' },
      properties: { lt: 'Point [ X=-400, Y=-300 ]', attackCount: '3', damage: '3', time: '40' },
      effect: [{ frames: [frame] }],
      actions: ['alert2'],
      icon: 'BBBB',
    } as unknown as SkillInfo;
    expect(trimSkillInfo(raw)).toEqual({
      description: { name: '인피니티' },
      properties: { lt: 'Point [ X=-400, Y=-300 ]', attackCount: '3' },
      effect: [{ frames: [frame] }],
      hit: [],
      actions: ['alert2'],
    });
  });
});
