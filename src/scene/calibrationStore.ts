import { DATA_KEY, type Era, dataKey } from '../maple/api';
import type { Calibration } from '../maple/ground';

// 보정값은 그 버전의 맵 렌더로 잰 것이라 버전마다 따로 둔다. 클래식 맵은 같은 ID 라도 지형이 다르다
export const calibrationKey = (mapId: number, era: Era = 'current') => `maple-companion:calibration:${dataKey(era)}:${mapId}`;
/** 버전 표시 없이 남긴 예전 보정값. 모두 KMS 389 렌더로 잰 것이다 */
const LEGACY_CALIBRATION_KEY = 'maple-companion:calibration:';
const LEGACY_CALIBRATION_DATA_KEY = 'KMS-389';

export function readCalibration(mapId: number, era: Era = 'current'): Calibration | null {
  try {
    const text =
      localStorage.getItem(calibrationKey(mapId, era)) ??
      (era === 'current' && DATA_KEY === LEGACY_CALIBRATION_DATA_KEY ? localStorage.getItem(LEGACY_CALIBRATION_KEY + mapId) : null);
    return text ? (JSON.parse(text) as Calibration) : null;
  } catch {
    return null;
  }
}

export function storeCalibration(mapId: number, calibration: Calibration, era: Era = 'current'): void {
  try {
    localStorage.setItem(calibrationKey(mapId, era), JSON.stringify(calibration));
  } catch {
    // 다음 실행에서 다시 계산한다
  }
}
