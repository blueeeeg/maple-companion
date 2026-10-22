// scripts/curate-routes.ts 가 만든 파일이다. 손으로 고치지 말고 스크립트를 다시 돌린다
import type { RouteField } from './routeCuration';

/** 마을 id → 걸어서 가는 사냥터. KMS 389 맵의 실제 포털 연결이고 좌표는 맵 월드 좌표다 */
export const TOWN_ROUTES: Record<string, RouteField[]> = {
  'henesys': [
    {
      mapId: 100010000,
      name: '헤네시스 북쪽언덕',
      fromMapId: 100000000,
      entryX: 564,
      arrivalX: 1594,
      level: 10,
      monsters: [
        { id: 1210102, name: '주황버섯' },
      ],
    },
  ],
  'lith-harbor': [],
  'ellinia': [],
  'perion': [],
  'kerning': [
    {
      mapId: 103010000,
      name: '추락주의',
      fromMapId: 103000000,
      entryX: 1506,
      arrivalX: -2928,
      level: 10,
      monsters: [
        { id: 1120100, name: '옥토퍼스' },
      ],
    },
  ],
  'orbis': [],
  'el-nath': [],
  'ludibrium': [],
  'aquarium': [
    {
      mapId: 230010400,
      name: '서쪽 바다 갈림길',
      fromMapId: 230000000,
      entryX: -948,
      arrivalX: 213,
      level: 80,
      monsters: [
        { id: 4230124, name: '프리져' },
        { id: 4230123, name: '스파커' },
      ],
    },
    {
      mapId: 230020000,
      name: '동쪽 바다 갈림길',
      fromMapId: 230000000,
      entryX: 1947,
      arrivalX: -2290,
      level: 78,
      monsters: [
        { id: 3230104, name: '마스크피쉬' },
      ],
    },
  ],
  'leafre': [
    {
      mapId: 240010000,
      name: '리프레 서쪽 숲',
      fromMapId: 240000000,
      entryX: -2277,
      arrivalX: 1119,
      level: 103,
      monsters: [
        { id: 7130500, name: '레쉬' },
      ],
    },
  ],
  'mureung': [],
  'vanishing-journey': [],
  'chewchew': [
    {
      mapId: 450002001,
      name: '동산 입구',
      fromMapId: 450002000,
      entryX: 3516,
      arrivalX: -670,
      level: 210,
      monsters: [
        { id: 8642000, name: '파인디어' },
      ],
    },
    {
      mapId: 450002002,
      name: '알록달록 숲지대1',
      fromMapId: 450002001,
      entryX: 1763,
      arrivalX: -676,
      level: 211,
      monsters: [
        { id: 8642001, name: '큰뿔 파인디어' },
      ],
    },
    {
      mapId: 450002003,
      name: '알록달록 숲지대2',
      fromMapId: 450002002,
      entryX: 1792,
      arrivalX: -698,
      level: 210,
      monsters: [
        { id: 8642002, name: '유나나' },
      ],
    },
  ],
  'cernium': [],
};
