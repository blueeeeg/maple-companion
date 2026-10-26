import { describe, expect, it } from 'vitest';
import { applyEachLoaded } from './heroLoad';

describe('캐릭터 그림과 스킬을 받는 대로 걸기', () => {
  it('스킬을 다 받기 전에도 캐릭터 그림은 먼저 건다', async () => {
    const applied: string[] = [];
    let finishSkill: (value: string) => void = () => {};
    const skill = new Promise<string>((resolve) => (finishSkill = resolve));
    const done = applyEachLoaded(Promise.resolve('캡틴 그림'), skill, {
      hero: (value) => applied.push(value),
      skill: (value) => applied.push(value),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(applied).toEqual(['캡틴 그림']);
    finishSkill('캡틴 스킬');
    const [hero, loaded] = await done;
    expect(applied).toEqual(['캡틴 그림', '캡틴 스킬']);
    expect(hero).toEqual({ status: 'fulfilled', value: '캡틴 그림' });
    expect(loaded).toEqual({ status: 'fulfilled', value: '캡틴 스킬' });
  });

  it('한쪽을 못 받아도 다른 쪽은 걸고, 못 받은 것은 결과로 알린다', async () => {
    const applied: string[] = [];
    const [hero, skill] = await applyEachLoaded(Promise.resolve('그림'), Promise.reject(new Error('503')), {
      hero: (value) => applied.push(value),
      skill: (value) => applied.push(value),
    });
    expect(applied).toEqual(['그림']);
    expect(hero.status).toBe('fulfilled');
    expect(skill.status).toBe('rejected');
  });
});
