import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calibrationKey, readCalibration, storeCalibration } from './calibrationStore';

const store = new Map<string, string>();

describe('지면 보정값 저장', () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('시대마다 다른 키에 둔다. 지금 시대 키는 예전과 같다', () => {
    expect(calibrationKey(100000000)).toBe('maple-companion:calibration:KMS-389:100000000');
    expect(calibrationKey(100000000, 'classic')).toBe('maple-companion:calibration:GMS-83:100000000');
  });

  it('같은 맵 ID 라도 시대가 다르면 따로 읽고 쓴다', () => {
    storeCalibration(100000000, { dx: 1, dy: 2, score: 9, exact: true });
    storeCalibration(100000000, { dx: 30, dy: 40, score: 7 }, 'classic');
    expect(readCalibration(100000000)).toEqual({ dx: 1, dy: 2, score: 9, exact: true });
    expect(readCalibration(100000000, 'classic')).toEqual({ dx: 30, dy: 40, score: 7 });
    expect(readCalibration(101000000, 'classic')).toBeNull();
  });

  it('버전 표시 없는 예전 보정값은 KMS 389 로 잰 것이라 지금 시대만 읽는다', () => {
    store.set('maple-companion:calibration:102000000', JSON.stringify({ dx: 5, dy: 6, score: 3 }));
    expect(readCalibration(102000000)).toEqual({ dx: 5, dy: 6, score: 3 });
    expect(readCalibration(102000000, 'classic')).toBeNull();
  });
});
