import { describe, expect, it } from 'vitest';
import { BOSSES } from './bosses';
import { CHAIRS, chairOf, chairProgress, chairsOfBoss, normalizeChairData, selectChair } from './chairs';
import { CHAIR_ART } from '../maple/chairArt';

const PINK_BEAN = 8820001;

describe('의자 목록', () => {
  it('보스 의자 23개이고 모두 지금 보스가 떨어뜨린다', () => {
    expect(CHAIRS).toHaveLength(23);
    expect(new Set(CHAIRS.map((chair) => chair.id)).size).toBe(23);
    const bossIds = new Set(BOSSES.map((boss) => boss.id));
    CHAIRS.forEach((chair) => expect(bossIds.has(chair.bossId)).toBe(true));
    expect(chairsOfBoss(PINK_BEAN).map((chair) => chair.name)).toEqual(['핑크빈 의자', '블랙빈 의자']);
  });

  it('보스마다 의자 수', () => {
    expect(Object.fromEntries(BOSSES.map((boss) => [boss.name, chairsOfBoss(boss.id).length]))).toEqual({
      마노: 1,
      머쉬맘: 2,
      스텀피: 1,
      다일: 1,
      자쿰: 2,
      '좀비 머쉬맘': 1,
      '주니어 발록': 1,
      '크림슨 발록': 1,
      피아누스: 2,
      파풀라투스: 2,
      레비아탄: 2,
      아카이럼: 2,
      핑크빈: 2,
      매그너스: 1,
      '진 힐라': 2,
    });
  });

  it('tamingMob 으로 그리는 의자는 없다', () => {
    [3016206, 3018134, 3018242].forEach((id) => expect(chairOf(id)).toBeNull());
  });

  it('의자마다 그릴 WZ 프레임이 있다', () => {
    expect(CHAIR_ART.map((art) => art.id).sort()).toEqual(CHAIRS.map((chair) => chair.id).sort());
    CHAIR_ART.forEach((art) => {
      expect(art.layers.length).toBeGreaterThan(0);
      art.layers.forEach((layer) => {
        expect(layer.frames.length).toBeGreaterThan(0);
        layer.frames.forEach(([, , delay]) => expect(delay).toBeGreaterThan(0));
      });
    });
  });
});

describe('의자 고르기', () => {
  it('가진 의자만 고르고 다시 고르면 내린다', () => {
    expect(selectChair([3010225], null, 3010225)).toBe(3010225);
    expect(selectChair([3010225], 3010225, 3010225)).toBeNull();
    expect(selectChair([3010225, 3010592], 3010225, 3010592)).toBe(3010592);
    expect(selectChair([3010225], 3010225, 3010592)).toBe(3010225);
  });

  it('모은 의자를 따로 센다', () => {
    expect(chairProgress([3010225, 3010592, 1002357])).toEqual({ owned: 2, total: 23 });
  });

  it('저장 값을 정리한다', () => {
    expect(normalizeChairData({})).toEqual({ chairOwned: [], chairSelected: null });
    expect(normalizeChairData({ chairOwned: [3010225, 3010225, 7], chairSelected: 3010225 })).toEqual({
      chairOwned: [3010225],
      chairSelected: 3010225,
    });
  });
});
