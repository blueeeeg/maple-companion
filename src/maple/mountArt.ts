import type { Texture } from 'pixi.js';
import { wzImageUrl } from './api';
import type { Point } from './ground';
import { loadTexture } from './textures';

// 탈것은 Character.wz/TamingMob(KMS 389) 레이어를 캐릭터 그림과 직접 합성한다. 캐릭터 API 에 탈것 ID 를 넣으면 탈것은 그려 주지만
// 탈것의 characterAction 을 무시해서 몸이 stand1·walk1 로 탈것 위에 서 있다. 원작은 characterAction 이 없으면 앉은(sit) 몸으로 탄다.
// 프레임은 [첫 레이어 navel x, navel y, delay, 레이어]. 레이어는 [z, origin x, origin y, navel(없으면 null), _Canvas 아래 그림 경로]

export type MountZ =
  | 'tamingMobBack'
  | 'tamingMobRear'
  | 'saddleRear'
  | 'characterEnd'
  | 'tamingMobMid'
  | 'saddleFront'
  | 'tamingMobFront';

export type MountLayer = [z: MountZ, originX: number, originY: number, navel: [number, number] | null, path: string];
export type MountFrame = [navelX: number, navelY: number, delay: number, layers: MountLayer[]];

export type MountAction = 'stand1' | 'walk1';
/** 탈 때 캐릭터 몸 동작. 탈것 WZ 의 characterAction 이고, 없으면 sit 이다 */
export type BodyAction = 'sit' | 'fly';

export interface MountMotion {
  /** 탈것 WZ 동작 */
  action: MountAction;
  body: BodyAction;
  frames: MountFrame[];
}

export interface MountArt {
  id: number;
  /** info/invisibleCape. 탄 동안 망토를 그리지 않는다 */
  hideCape?: true;
  stand: MountMotion;
  walk: MountMotion;
}

/** 몸(Character/00002000.img) 동작 프레임의 body map/navel. 탈것 프레임 f 에는 몸 프레임 f mod 몸 프레임 수를 쓴다 */
export const BODY_NAVEL: Record<BodyAction, Point[]> = {
  sit: [{ x: -2, y: -17 }],
  fly: [
    { x: -4, y: -24 },
    { x: -4, y: -24 },
  ],
};

/** maplestory.io FeetCenter 캐릭터 그림 가운데와 몸 기준점의 차이. 원작 클라이언트 값이 아니라 API 그림을 픽셀 비교해 잰 값이다 */
export const API_FEET_BIAS: Point = { x: -8, y: -2 };

// 원작 안장 3단계(멧돼지·은빛갈기·레드 드라코)는 안장 01912000 레이어를 같이 그린다.
// 핑크빈·블랙빈과 둥둥 여행은 walk1 navel 을 API 가 못 읽어 같은 번호의 stand1 navel 을 쓴다.
// 루시드의 날개는 stand1 노드를 못 읽어 서 있을 때도 walk1 을 쓴다
export const MOUNT_ART: MountArt[] = [
  {
    id: 1902000,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [3, -51, 180, [['tamingMobMid', 34, 50, [3, -51], '01902000.img/stand1/0/0'], ['saddleFront', 16, 55, [3, -51], '01912000.img/1902000/stand1/0/0'], ['saddleRear', 0, 60, [3, -51], '01912000.img/1902000/walk1/0/1']]],
        [3, -52, 180, [['tamingMobMid', 34, 51, [3, -52], '01902000.img/stand1/1/0'], ['saddleFront', 16, 56, [3, -52], '01912000.img/1902000/stand1/0/0'], ['saddleRear', 0, 61, [3, -52], '01912000.img/1902000/walk1/0/1']]],
        [3, -53, 180, [['tamingMobMid', 34, 52, [3, -53], '01902000.img/stand1/2/0'], ['saddleFront', 16, 57, [3, -53], '01912000.img/1902000/stand1/0/0'], ['saddleRear', 0, 62, [3, -53], '01912000.img/1902000/walk1/0/1']]],
        [3, -54, 180, [['tamingMobMid', 34, 53, [3, -54], '01902000.img/stand1/3/0'], ['saddleFront', 16, 58, [3, -54], '01912000.img/1902000/stand1/0/0'], ['saddleRear', 0, 63, [3, -54], '01912000.img/1902000/walk1/0/1']]],
        [3, -53, 180, [['tamingMobMid', 34, 52, [3, -53], '01902000.img/stand1/4/0'], ['saddleFront', 16, 57, [3, -53], '01912000.img/1902000/stand1/0/0'], ['saddleRear', 0, 62, [3, -53], '01912000.img/1902000/walk1/0/1']]],
        [3, -52, 180, [['tamingMobMid', 34, 51, [3, -52], '01902000.img/stand1/5/0'], ['saddleFront', 16, 56, [3, -52], '01912000.img/1902000/stand1/0/0'], ['saddleRear', 0, 61, [3, -52], '01912000.img/1902000/walk1/0/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [3, -53, 120, [['tamingMobMid', 34, 52, [3, -53], '01902000.img/walk1/0/0'], ['saddleFront', 16, 57, [3, -53], '01912000.img/1902000/walk1/0/0'], ['saddleRear', 0, 62, [3, -53], '01912000.img/1902000/walk1/0/1']]],
        [3, -52, 120, [['tamingMobMid', 34, 51, [3, -52], '01902000.img/walk1/1/0'], ['saddleFront', 16, 56, [3, -52], '01912000.img/1902000/walk1/1/0'], ['saddleRear', 0, 61, [3, -52], '01912000.img/1902000/walk1/0/1']]],
        [3, -53, 120, [['tamingMobMid', 34, 52, [3, -53], '01902000.img/walk1/2/0'], ['saddleFront', 16, 57, [3, -53], '01912000.img/1902000/walk1/2/0'], ['saddleRear', 0, 62, [3, -53], '01912000.img/1902000/walk1/0/1']]],
        [3, -52, 120, [['tamingMobMid', 34, 51, [3, -52], '01902000.img/walk1/3/0'], ['saddleFront', 16, 56, [3, -52], '01912000.img/1902000/walk1/3/0'], ['saddleRear', 0, 61, [3, -52], '01912000.img/1902000/walk1/0/1']]],
      ],
    },
  },
  {
    id: 1902001,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [3, -53, 180, [['tamingMobFront', 42, 55, [3, -53], '01902001.img/walk1/0/0'], ['tamingMobMid', 24, 58, [3, -53], '01902001.img/stand1/0/1'], ['saddleFront', 16, 57, [3, -53], '01912000.img/1902001/stand1/0/0'], ['saddleRear', 0, 62, [3, -53], '01912000.img/1902001/walk1/0/1']]],
        [3, -54, 180, [['tamingMobFront', 42, 56, [3, -54], '01902001.img/walk1/1/0'], ['tamingMobMid', 24, 59, [3, -54], '01902001.img/stand1/1/1'], ['saddleFront', 16, 58, [3, -54], '01912000.img/1902001/stand1/1/0'], ['saddleRear', 0, 63, [3, -54], '01912000.img/1902001/walk1/0/1']]],
        [3, -55, 180, [['tamingMobFront', 42, 56, [3, -55], '01902001.img/stand1/2/0'], ['tamingMobMid', 24, 59, [3, -55], '01902001.img/stand1/2/1'], ['saddleFront', 16, 59, [3, -55], '01912000.img/1902001/stand1/2/0'], ['saddleRear', 0, 64, [3, -55], '01912000.img/1902001/walk1/0/1']]],
        [3, -54, 180, [['tamingMobFront', 42, 56, [3, -54], '01902001.img/walk1/3/0'], ['tamingMobMid', 24, 58, [3, -54], '01902001.img/stand1/3/1'], ['saddleFront', 16, 58, [3, -54], '01912000.img/1902001/stand1/3/0'], ['saddleRear', 0, 63, [3, -54], '01912000.img/1902001/walk1/0/1']]],
        [3, -53, 180, [['tamingMobFront', 42, 56, [3, -53], '01902001.img/walk1/4/0'], ['tamingMobMid', 24, 57, [3, -53], '01902001.img/stand1/4/1'], ['saddleFront', 16, 57, [3, -53], '01912000.img/1902001/stand1/4/0'], ['saddleRear', 0, 62, [3, -53], '01912000.img/1902001/walk1/0/1']]],
        [3, -52, 180, [['tamingMobFront', 42, 56, [3, -52], '01902001.img/walk1/0/0'], ['tamingMobMid', 24, 57, [3, -52], '01902001.img/stand1/5/1'], ['saddleFront', 16, 56, [3, -52], '01912000.img/1902001/stand1/5/0'], ['saddleRear', 0, 61, [3, -52], '01912000.img/1902001/walk1/0/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [5, -54, 90, [['tamingMobFront', 41, 56, [5, -54], '01902001.img/walk1/0/0'], ['tamingMobMid', 24, 61, [5, -54], '01902001.img/walk1/0/1'], ['saddleFront', 14, 58, [5, -54], '01912000.img/1902001/walk1/0/0'], ['saddleRear', -2, 63, [5, -54], '01912000.img/1902001/walk1/0/1']]],
        [4, -55, 90, [['tamingMobFront', 42, 55, [4, -55], '01902001.img/walk1/1/0'], ['tamingMobMid', 23, 62, [4, -55], '01902001.img/walk1/1/1'], ['saddleFront', 15, 59, [4, -55], '01912000.img/1902001/walk1/1/0'], ['saddleRear', -1, 64, [4, -55], '01912000.img/1902001/walk1/0/1']]],
        [4, -54, 90, [['tamingMobFront', 42, 56, [4, -54], '01902001.img/walk1/2/0'], ['tamingMobMid', 17, 59, [4, -54], '01902001.img/walk1/2/1'], ['saddleFront', 15, 58, [4, -54], '01912000.img/1902001/walk1/2/0'], ['saddleRear', -1, 63, [4, -54], '01912000.img/1902001/walk1/0/1']]],
        [5, -53, 90, [['tamingMobFront', 42, 56, [5, -53], '01902001.img/walk1/3/0'], ['tamingMobMid', 16, 58, [5, -53], '01902001.img/walk1/3/1'], ['saddleFront', 14, 57, [5, -53], '01912000.img/1902001/walk1/3/0'], ['saddleRear', -2, 62, [5, -53], '01912000.img/1902001/walk1/0/1']]],
        [7, -53, 90, [['tamingMobFront', 41, 57, [7, -53], '01902001.img/walk1/4/0'], ['tamingMobMid', 17, 58, [7, -53], '01902001.img/walk1/4/1'], ['saddleFront', 12, 57, [7, -53], '01912000.img/1902001/walk1/4/0'], ['saddleRear', -4, 62, [7, -53], '01912000.img/1902001/walk1/0/1']]],
        [6, -54, 90, [['tamingMobFront', 42, 57, [6, -54], '01902001.img/walk1/1/0'], ['tamingMobMid', 20, 60, [6, -54], '01902001.img/walk1/5/1'], ['saddleFront', 13, 58, [6, -54], '01912000.img/1902001/walk1/5/0'], ['saddleRear', -3, 63, [6, -54], '01912000.img/1902001/walk1/0/1']]],
      ],
    },
  },
  {
    id: 1902002,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [12, -68, 180, [['tamingMobFront', 60, 115, [12, -68], '01902002.img/walk1/0/0'], ['tamingMobMid', 62, 37, [-13, -24], '01902002.img/stand1/0/1'], ['tamingMobRear', 21, 55, [9, -46], '01902002.img/stand1/0/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
        [12, -67, 180, [['tamingMobFront', 60, 114, [12, -67], '01902002.img/walk1/1/0'], ['tamingMobMid', 61, 40, [-12, -20], '01902002.img/stand1/1/1'], ['tamingMobRear', 18, 17, [27, 9], '01902002.img/walk1/1/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
        [12, -66, 180, [['tamingMobFront', 60, 113, [12, -66], '01902002.img/walk1/2/0'], ['tamingMobMid', 63, 38, [-14, -23], '01902002.img/stand1/2/1'], ['tamingMobRear', 18, 16, [27, 9], '01902002.img/walk1/2/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
        [12, -67, 180, [['tamingMobFront', 60, 114, [12, -67], '01902002.img/stand1/3/0'], ['tamingMobMid', 64, 33, [-15, -29], '01902002.img/stand1/3/1'], ['tamingMobRear', 12, 7, [22, -11], '01902002.img/stand1/3/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
        [12, -68, 180, [['tamingMobFront', 60, 115, [12, -68], '01902002.img/walk1/4/0'], ['tamingMobMid', 37, 67, [12, -63], '01902002.img/stand1/4/1'], ['tamingMobRear', 10, 8, [19, -14], '01902002.img/stand1/4/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
        [12, -69, 180, [['tamingMobFront', 60, 116, [12, -69], '01902002.img/walk1/5/0'], ['tamingMobMid', 37, 69, [12, -64], '01902002.img/stand1/5/1'], ['tamingMobRear', 11, 16, [20, -20], '01902002.img/walk1/5/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
        [12, -68, 180, [['tamingMobFront', 60, 115, [12, -68], '01902002.img/walk1/0/0'], ['tamingMobMid', 62, 37, [-13, -24], '01902002.img/stand1/0/1'], ['tamingMobRear', 20, 9, [30, 1], '01902002.img/walk1/0/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
        [12, -67, 180, [['tamingMobFront', 60, 114, [12, -67], '01902002.img/stand1/7/0'], ['tamingMobMid', 61, 40, [-12, -20], '01902002.img/stand1/1/1'], ['tamingMobRear', 18, 17, [27, 9], '01902002.img/walk1/1/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
        [12, -66, 180, [['tamingMobFront', 60, 113, [12, -66], '01902002.img/stand1/8/0'], ['tamingMobMid', 63, 38, [-14, -23], '01902002.img/stand1/2/1'], ['tamingMobRear', 18, 16, [27, 9], '01902002.img/walk1/2/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
        [12, -67, 180, [['tamingMobFront', 60, 114, [12, -67], '01902002.img/stand1/9/0'], ['tamingMobMid', 64, 33, [-15, -29], '01902002.img/stand1/3/1'], ['tamingMobRear', 12, 7, [22, -13], '01902002.img/stand1/3/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
        [12, -68, 180, [['tamingMobFront', 60, 115, [12, -68], '01902002.img/walk1/4/0'], ['tamingMobMid', 37, 67, [12, -63], '01902002.img/stand1/4/1'], ['tamingMobRear', 10, 8, [19, -14], '01902002.img/stand1/4/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
        [12, -69, 180, [['tamingMobFront', 60, 116, [12, -69], '01902002.img/stand1/11/0'], ['tamingMobMid', 37, 69, [12, -64], '01902002.img/stand1/5/1'], ['tamingMobRear', 11, 16, [20, -21], '01902002.img/walk1/5/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [12, -68, 160, [['tamingMobFront', 60, 115, [12, -68], '01902002.img/walk1/0/0'], ['tamingMobMid', 61, 37, [-13, -24], '01902002.img/walk1/0/1'], ['tamingMobRear', 20, 9, [30, 1], '01902002.img/walk1/0/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
        [12, -67, 160, [['tamingMobFront', 60, 114, [12, -67], '01902002.img/walk1/1/0'], ['tamingMobMid', 61, 39, [-13, -22], '01902002.img/walk1/1/1'], ['tamingMobRear', 18, 17, [30, 10], '01902002.img/walk1/1/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
        [12, -66, 160, [['tamingMobFront', 60, 113, [12, -66], '01902002.img/walk1/2/0'], ['tamingMobMid', 62, 36, [-14, -25], '01902002.img/walk1/2/1'], ['tamingMobRear', 18, 16, [27, 9], '01902002.img/walk1/2/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [21, -10], '01912000.img/1902002/walk1/0/1']]],
        [12, -67, 160, [['tamingMobFront', 60, 114, [12, -67], '01902002.img/walk1/3/0'], ['tamingMobMid', 64, 33, [-16, -29], '01902002.img/walk1/3/1'], ['tamingMobRear', 12, 14, [21, -20], '01902002.img/walk1/3/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
        [12, -68, 160, [['tamingMobFront', 60, 115, [12, -68], '01902002.img/walk1/4/0'], ['tamingMobMid', 66, 34, [-18, -30], '01902002.img/walk1/4/1'], ['tamingMobRear', 10, 17, [19, -23], '01902002.img/walk1/4/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
        [12, -69, 160, [['tamingMobFront', 60, 116, [12, -69], '01902002.img/walk1/5/0'], ['tamingMobMid', 62, 34, [-14, -29], '01902002.img/walk1/5/1'], ['tamingMobRear', 11, 16, [20, -21], '01902002.img/walk1/5/2'], ['saddleFront', 21, 27, [4, -23], '01912000.img/1902002/walk1/0/0'], ['saddleRear', 35, 15, [22, -10], '01912000.img/1902002/walk1/0/1']]],
      ],
    },
  },
  {
    id: 1932006,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [3, -51, 140, [['tamingMobMid', 58, 93, [3, -51], '01932006.img/stand1/0/0'], ['tamingMobRear', -5, 57, [3, -51], '01932006.img/walk1/0/1']]],
        [3, -50, 140, [['tamingMobMid', 59, 91, [3, -50], '01932006.img/stand1/1/0'], ['tamingMobRear', -5, 56, [3, -50], '01932006.img/walk1/0/1']]],
        [3, -49, 140, [['tamingMobMid', 61, 89, [3, -49], '01932006.img/stand1/2/0'], ['tamingMobRear', -5, 55, [3, -49], '01932006.img/walk1/0/1']]],
        [3, -50, 140, [['tamingMobMid', 59, 91, [3, -50], '01932006.img/stand1/1/0'], ['tamingMobRear', -5, 56, [3, -50], '01932006.img/walk1/0/1']]],
        [3, -51, 140, [['tamingMobMid', 58, 93, [3, -51], '01932006.img/stand1/0/0'], ['tamingMobRear', -5, 57, [3, -51], '01932006.img/walk1/0/1']]],
        [3, -50, 140, [['tamingMobMid', 59, 91, [3, -50], '01932006.img/stand1/1/0'], ['tamingMobRear', -5, 56, [3, -50], '01932006.img/walk1/0/1']]],
        [3, -49, 140, [['tamingMobMid', 61, 89, [3, -49], '01932006.img/stand1/6/0'], ['tamingMobRear', -5, 55, [3, -49], '01932006.img/walk1/0/1']]],
        [3, -50, 140, [['tamingMobMid', 59, 91, [3, -50], '01932006.img/stand1/1/0'], ['tamingMobRear', -5, 56, [3, -50], '01932006.img/walk1/0/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [-2, -48, 140, [['tamingMobMid', 79, 77, [-2, -48], '01932006.img/walk1/0/0'], ['tamingMobRear', 0, 54, [-2, -48], '01932006.img/walk1/0/1']]],
        [-2, -47, 140, [['tamingMobMid', 81, 72, [-2, -47], '01932006.img/walk1/1/0'], ['tamingMobRear', 0, 53, [-2, -47], '01932006.img/walk1/0/1']]],
        [-2, -46, 140, [['tamingMobMid', 82, 71, [-2, -46], '01932006.img/walk1/2/0'], ['tamingMobRear', 0, 52, [-2, -46], '01932006.img/walk1/0/1']]],
        [-2, -47, 140, [['tamingMobMid', 81, 73, [-2, -47], '01932006.img/walk1/3/0'], ['tamingMobRear', 0, 53, [-2, -47], '01932006.img/walk1/0/1']]],
      ],
    },
  },
  {
    id: 1932007,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [13, -26, 180, [['tamingMobMid', 61, 53, [13, -26], '01932007.img/stand1/0/0']]],
        [13, -26, 180, [['tamingMobMid', 64, 53, [13, -26], '01932007.img/stand1/1/0']]],
        [13, -26, 180, [['tamingMobMid', 65, 53, [13, -26], '01932007.img/stand1/2/0']]],
        [13, -26, 180, [['tamingMobMid', 62, 54, [13, -26], '01932007.img/stand1/3/0']]],
        [13, -26, 180, [['tamingMobMid', 64, 53, [13, -26], '01932007.img/stand1/4/0']]],
        [13, -26, 180, [['tamingMobMid', 64, 51, [13, -26], '01932007.img/stand1/5/0']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [13, -26, 220, [['tamingMobMid', 45, 51, [13, -26], '01932007.img/walk1/0/0']]],
        [11, -26, 220, [['tamingMobMid', 43, 54, [11, -26], '01932007.img/walk1/1/0']]],
        [13, -26, 220, [['tamingMobMid', 45, 51, [13, -26], '01932007.img/walk1/0/0']]],
        [14, -25, 220, [['tamingMobMid', 46, 54, [14, -25], '01932007.img/walk1/3/0']]],
      ],
    },
  },
  {
    id: 1932008,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [-3, -35, 140, [['tamingMobMid', 43, 47, [-3, -35], '01932008.img/stand1/0/0'], ['tamingMobRear', 12, 39, [-3, -35], '01932008.img/stand1/0/1']]],
        [-3, -34, 140, [['tamingMobMid', 43, 46, [-3, -34], '01932008.img/stand1/1/0'], ['tamingMobRear', 12, 38, [-3, -34], '01932008.img/stand1/1/1']]],
        [-3, -35, 140, [['tamingMobMid', 43, 47, [-3, -35], '01932008.img/stand1/0/0'], ['tamingMobRear', 12, 39, [-3, -35], '01932008.img/stand1/2/1']]],
        [-3, -34, 140, [['tamingMobMid', 43, 46, [-3, -34], '01932008.img/stand1/1/0'], ['tamingMobRear', 12, 40, [-3, -34], '01932008.img/stand1/3/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [-3, -35, 140, [['tamingMobMid', 66, 47, [-3, -35], '01932008.img/walk1/0/0'], ['tamingMobRear', 12, 43, [-3, -35], '01932008.img/walk1/0/1']]],
        [-3, -34, 140, [['tamingMobMid', 63, 46, [-3, -34], '01932008.img/walk1/1/0'], ['tamingMobRear', 12, 42, [-3, -34], '01932008.img/walk1/1/1']]],
        [-3, -35, 140, [['tamingMobMid', 66, 47, [-3, -35], '01932008.img/walk1/0/0'], ['tamingMobRear', 12, 43, [-3, -35], '01932008.img/walk1/2/1']]],
        [-3, -34, 140, [['tamingMobMid', 63, 46, [-3, -34], '01932008.img/walk1/3/0'], ['tamingMobRear', 12, 42, [-3, -34], '01932008.img/walk1/3/1']]],
      ],
    },
  },
  {
    id: 1932009,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [6, -34, 140, [['tamingMobMid', 34, 46, [6, -34], '01932009.img/walk1/2/0'], ['tamingMobRear', 2, 32, [6, -34], '01932009.img/stand1/0/1']]],
        [6, -33, 140, [['tamingMobMid', 35, 45, [6, -33], '01932009.img/stand1/1/0'], ['tamingMobRear', 2, 31, [6, -33], '01932009.img/stand1/1/1']]],
        [6, -32, 140, [['tamingMobMid', 36, 44, [6, -32], '01932009.img/stand1/2/0'], ['tamingMobRear', 2, 30, [6, -32], '01932009.img/stand1/2/1']]],
        [6, -32, 140, [['tamingMobMid', 36, 44, [6, -32], '01932009.img/stand1/3/0'], ['tamingMobRear', 2, 30, [6, -32], '01932009.img/stand1/3/1']]],
        [6, -32, 140, [['tamingMobMid', 36, 44, [6, -32], '01932009.img/stand1/3/0'], ['tamingMobRear', 2, 30, [6, -32], '01932009.img/stand1/4/1']]],
        [6, -32, 140, [['tamingMobMid', 36, 44, [6, -32], '01932009.img/stand1/3/0'], ['tamingMobRear', 2, 30, [6, -32], '01932009.img/stand1/5/1']]],
        [6, -33, 140, [['tamingMobMid', 35, 45, [6, -33], '01932009.img/stand1/1/0'], ['tamingMobRear', 2, 31, [6, -33], '01932009.img/stand1/6/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [6, -34, 140, [['tamingMobMid', 41, 59, [6, -34], '01932009.img/walk1/0/0'], ['tamingMobRear', 2, 32, [6, -34], '01932009.img/walk1/0/1']]],
        [6, -33, 140, [['tamingMobMid', 35, 54, [6, -33], '01932009.img/walk1/1/0'], ['tamingMobRear', 2, 31, [6, -33], '01932009.img/walk1/1/1']]],
        [6, -34, 140, [['tamingMobMid', 34, 46, [6, -34], '01932009.img/walk1/2/0'], ['tamingMobRear', 2, 32, [6, -34], '01932009.img/walk1/2/1']]],
        [6, -33, 140, [['tamingMobMid', 35, 54, [6, -33], '01932009.img/walk1/3/0'], ['tamingMobRear', 2, 31, [6, -33], '01932009.img/walk1/3/1']]],
      ],
    },
  },
  {
    id: 1932011,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [0, -58, 180, [['tamingMobFront', 48, 63, [0, -58], '01932011.img/stand1/0/0'], ['tamingMobRear', 52, 70, [0, -58], '01932011.img/stand1/0/1']]],
        [0, -59, 180, [['tamingMobFront', 48, 64, [0, -59], '01932011.img/stand1/1/0'], ['tamingMobRear', 50, 61, [2, -49], '01932011.img/stand1/1/1']]],
        [0, -60, 180, [['tamingMobFront', 48, 65, [0, -60], '01932011.img/stand1/2/0'], ['tamingMobRear', 52, 72, [0, -60], '01932011.img/stand1/2/1']]],
        [0, -61, 180, [['tamingMobFront', 48, 66, [0, -61], '01932011.img/stand1/3/0'], ['tamingMobRear', 52, 73, [0, -61], '01932011.img/stand1/3/1']]],
        [0, -60, 180, [['tamingMobFront', 48, 65, [0, -60], '01932011.img/stand1/4/0'], ['tamingMobRear', 52, 71, [0, -60], '01932011.img/stand1/4/1']]],
        [0, -59, 180, [['tamingMobFront', 48, 64, [0, -59], '01932011.img/stand1/5/0'], ['tamingMobRear', 52, 71, [0, -59], '01932011.img/stand1/5/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [-2, -60, 120, [['tamingMobFront', 53, 64, [-2, -60], '01932011.img/walk1/0/0'], ['tamingMobRear', 57, 72, [-2, -60], '01932011.img/walk1/0/1']]],
        [1, -58, 120, [['tamingMobFront', 50, 62, [1, -58], '01932011.img/walk1/1/0'], ['tamingMobRear', 57, 73, [-2, -61], '01932011.img/walk1/1/1']]],
        [-2, -62, 120, [['tamingMobFront', 53, 66, [-2, -62], '01932011.img/walk1/2/0'], ['tamingMobRear', 57, 74, [-2, -62], '01932011.img/walk1/2/1']]],
        [-2, -61, 120, [['tamingMobFront', 53, 65, [-2, -61], '01932011.img/walk1/3/0'], ['tamingMobRear', 57, 73, [-2, -61], '01932011.img/walk1/3/1']]],
      ],
    },
  },
  {
    id: 1932034,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [11, -38, 180, [['tamingMobFront', 77, 49, [11, -38], '01932034.img/stand1/0/0'], ['tamingMobRear', 11, 48, [11, -38], '01932034.img/stand1/0/1']]],
        [10, -38, 180, [['tamingMobFront', 78, 48, [10, -38], '01932034.img/stand1/1/0'], ['tamingMobRear', 12, 48, [10, -38], '01932034.img/stand1/1/1']]],
        [11, -38, 180, [['tamingMobFront', 76, 48, [11, -38], '01932034.img/stand1/2/0'], ['tamingMobRear', 12, 48, [11, -38], '01932034.img/stand1/2/1']]],
        [10, -38, 180, [['tamingMobFront', 76, 48, [10, -38], '01932034.img/stand1/3/0'], ['tamingMobRear', 12, 48, [10, -38], '01932034.img/stand1/3/1']]],
        [11, -38, 180, [['tamingMobFront', 76, 48, [11, -38], '01932034.img/stand1/4/0'], ['tamingMobRear', 12, 48, [11, -38], '01932034.img/stand1/4/1']]],
        [10, -38, 180, [['tamingMobFront', 76, 48, [10, -38], '01932034.img/stand1/5/0'], ['tamingMobRear', 12, 51, [10, -38], '01932034.img/stand1/5/1']]],
        [11, -38, 180, [['tamingMobFront', 77, 49, [11, -38], '01932034.img/stand1/0/0'], ['tamingMobRear', 11, 53, [11, -38], '01932034.img/stand1/6/1']]],
        [11, -38, 180, [['tamingMobFront', 77, 49, [11, -38], '01932034.img/stand1/0/0'], ['tamingMobRear', 11, 48, [11, -38], '01932034.img/stand1/0/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [11, -38, 80, [['tamingMobFront', 81, 49, [11, -38], '01932034.img/walk1/0/0'], ['tamingMobRear', 11, 48, [11, -38], '01932034.img/walk1/0/1']]],
        [11, -38, 150, [['tamingMobFront', 78, 48, [11, -38], '01932034.img/walk1/1/0'], ['tamingMobRear', 11, 47, [11, -38], '01932034.img/walk1/1/1']]],
        [11, -38, 180, [['tamingMobFront', 77, 49, [11, -38], '01932034.img/walk1/2/0'], ['tamingMobRear', 11, 48, [11, -38], '01932034.img/walk1/2/1']]],
        [11, -37, 150, [['tamingMobFront', 78, 48, [11, -37], '01932034.img/walk1/3/0'], ['tamingMobRear', 11, 47, [11, -37], '01932034.img/walk1/3/1']]],
      ],
    },
  },
  {
    id: 1932005,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [-1, -50, 216, [['tamingMobRear', 61, 68, [-1, -50], '01932005.img/stand1/0/0']]],
        [-1, -51, 216, [['tamingMobRear', 61, 69, [-1, -51], '01932005.img/stand1/1/0']]],
        [-1, -52, 216, [['tamingMobRear', 61, 70, [-1, -52], '01932005.img/stand1/2/0']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [-1, -50, 150, [['tamingMobRear', 61, 68, [-1, -50], '01932005.img/walk1/0/0']]],
        [0, -51, 150, [['tamingMobRear', 60, 69, [0, -51], '01932005.img/walk1/1/0']]],
        [1, -52, 150, [['tamingMobRear', 59, 70, [1, -52], '01932005.img/walk1/2/0']]],
        [0, -53, 150, [['tamingMobRear', 60, 72, [0, -53], '01932005.img/walk1/3/0']]],
        [-1, -54, 150, [['tamingMobRear', 61, 73, [-1, -54], '01932005.img/walk1/4/0']]],
        [-2, -53, 150, [['tamingMobRear', 62, 72, [-2, -53], '01932005.img/walk1/5/0']]],
        [-4, -52, 150, [['tamingMobRear', 63, 70, [-4, -52], '01932005.img/walk1/6/0']]],
        [-2, -51, 150, [['tamingMobRear', 62, 69, [-2, -51], '01932005.img/walk1/7/0']]],
      ],
    },
  },
  {
    id: 1932004,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [25, -78, 200, [['tamingMobMid', 50, 85, [25, -78], '01932003.img/stand1/0/0']]],
        [25, -77, 200, [['tamingMobMid', 50, 84, [25, -77], '01932003.img/stand1/1/0']]],
        [25, -76, 200, [['tamingMobMid', 50, 83, [25, -76], '01932003.img/stand1/2/0']]],
        [25, -77, 200, [['tamingMobMid', 50, 84, [25, -77], '01932003.img/stand1/1/0']]],
        [25, -78, 200, [['tamingMobMid', 50, 85, [25, -78], '01932003.img/stand1/0/0'], ['tamingMobMid', 50, 85, null, '01932003.img/stand1/0/0']]],
        [25, -77, 200, [['tamingMobMid', 50, 84, [25, -77], '01932003.img/stand1/1/0']]],
        [25, -76, 200, [['tamingMobMid', 50, 83, [25, -76], '01932003.img/stand1/6/0']]],
        [25, -77, 200, [['tamingMobMid', 50, 84, [25, -77], '01932003.img/stand1/1/0']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [22, -79, 140, [['tamingMobMid', 51, 86, [22, -79], '01932003.img/walk1/0/0']]],
        [21, -80, 140, [['tamingMobMid', 51, 84, [21, -80], '01932003.img/walk1/1/0']]],
        [20, -82, 140, [['tamingMobMid', 51, 84, [20, -82], '01932003.img/walk1/2/0']]],
        [21, -78, 140, [['tamingMobMid', 51, 85, [21, -78], '01932003.img/walk1/3/0']]],
        [23, -77, 140, [['tamingMobMid', 51, 87, [23, -77], '01932003.img/walk1/4/0']]],
        [26, -78, 140, [['tamingMobMid', 51, 83, [26, -78], '01932003.img/walk1/5/0']]],
        [25, -83, 140, [['tamingMobMid', 51, 85, [25, -83], '01932003.img/walk1/6/0']]],
      ],
    },
  },
  {
    id: 1932023,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [4, -62, 180, [['tamingMobFront', -4, 73, [4, -62], '01932023.img/stand1/0/0'], ['tamingMobRear', 29, 72, [4, -62], '01932023.img/stand1/0/1']]],
        [4, -61, 180, [['tamingMobFront', -4, 72, [4, -61], '01932023.img/stand1/0/0'], ['tamingMobRear', 29, 71, [4, -61], '01932023.img/stand1/1/1']]],
        [4, -60, 180, [['tamingMobFront', -4, 71, [4, -60], '01932023.img/stand1/0/0'], ['tamingMobRear', 29, 70, [4, -60], '01932023.img/stand1/2/1']]],
        [4, -61, 180, [['tamingMobFront', -4, 72, [4, -61], '01932023.img/stand1/0/0'], ['tamingMobRear', 29, 71, [4, -61], '01932023.img/stand1/1/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [4, -62, 120, [['tamingMobFront', -4, 73, [4, -62], '01932023.img/walk1/0/0'], ['tamingMobRear', 29, 72, [4, -62], '01932023.img/walk1/0/1']]],
        [4, -60, 120, [['tamingMobFront', -4, 71, [4, -60], '01932023.img/walk1/0/0'], ['tamingMobRear', 29, 70, [4, -60], '01932023.img/walk1/1/1']]],
        [4, -59, 120, [['tamingMobFront', -4, 70, [4, -59], '01932023.img/walk1/0/0'], ['tamingMobRear', 29, 69, [4, -59], '01932023.img/walk1/2/1']]],
        [4, -76, 120, [['tamingMobFront', -4, 85, [4, -76], '01932023.img/walk1/3/0'], ['tamingMobRear', 29, 84, [4, -76], '01932023.img/walk1/3/1']]],
        [4, -74, 120, [['tamingMobFront', -4, 83, [4, -74], '01932023.img/walk1/3/0'], ['tamingMobRear', 29, 82, [4, -74], '01932023.img/walk1/3/1']]],
      ],
    },
  },
  {
    id: 1932027,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [2, -59, 180, [['tamingMobRear', 43, 229, [2, -59], '01932027.img/walk1/0/0'], ['saddleFront', 31, 65, [2, -59], '01932027.img/walk1/0/1']]],
        [2, -60, 180, [['tamingMobRear', 43, 233, [2, -60], '01932027.img/walk1/1/0'], ['saddleFront', 31, 66, [2, -60], '01932027.img/walk1/0/1']]],
        [2, -61, 180, [['tamingMobRear', 43, 235, [2, -61], '01932027.img/walk1/2/0'], ['saddleFront', 31, 67, [2, -61], '01932027.img/walk1/0/1']]],
        [2, -60, 180, [['tamingMobRear', 43, 230, [2, -60], '01932027.img/walk1/0/0'], ['saddleFront', 31, 66, [2, -60], '01932027.img/walk1/0/1']]],
        [2, -59, 180, [['tamingMobRear', 43, 232, [2, -59], '01932027.img/walk1/1/0'], ['saddleFront', 31, 65, [2, -59], '01932027.img/walk1/0/1']]],
        [2, -58, 180, [['tamingMobRear', 43, 232, [2, -58], '01932027.img/walk1/2/0'], ['saddleFront', 31, 64, [2, -58], '01932027.img/walk1/0/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [2, -59, 120, [['tamingMobRear', 43, 229, [2, -59], '01932027.img/walk1/0/0'], ['saddleFront', 31, 65, [2, -59], '01932027.img/walk1/0/1']]],
        [2, -60, 120, [['tamingMobRear', 43, 233, [2, -60], '01932027.img/walk1/1/0'], ['saddleFront', 29, 66, [2, -60], '01932027.img/walk1/1/1']]],
        [2, -61, 120, [['tamingMobRear', 43, 235, [2, -61], '01932027.img/walk1/2/0'], ['saddleFront', 27, 67, [2, -61], '01932027.img/walk1/2/1']]],
        [2, -60, 120, [['tamingMobRear', 43, 230, [2, -60], '01932027.img/walk1/0/0'], ['saddleFront', 29, 66, [2, -60], '01932027.img/walk1/3/1']]],
        [2, -59, 120, [['tamingMobRear', 43, 232, [2, -59], '01932027.img/walk1/1/0'], ['saddleFront', 31, 65, [2, -59], '01932027.img/walk1/0/1']]],
        [2, -58, 120, [['tamingMobRear', 43, 232, [2, -58], '01932027.img/walk1/2/0'], ['saddleFront', 33, 64, [2, -58], '01932027.img/walk1/5/1']]],
      ],
    },
  },
  {
    id: 1932026,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [9, -67, 330, [['tamingMobFront', 18, 66, [9, -67], '01932026.img/walk1/1/0'], ['tamingMobMid', 41, 119, [9, -67], '01932026.img/stand1/0/1'], ['saddleFront', 13, 77, [9, -67], '01932026.img/walk1/0/2']]],
        [9, -66, 330, [['tamingMobFront', 18, 67, [9, -66], '01932026.img/stand1/1/0'], ['tamingMobMid', 41, 118, [9, -66], '01932026.img/stand1/1/1'], ['saddleFront', 13, 76, [9, -66], '01932026.img/walk1/0/2']]],
        [9, -65, 330, [['tamingMobFront', 19, 67, [9, -65], '01932026.img/stand1/2/0'], ['tamingMobMid', 41, 117, [9, -65], '01932026.img/stand1/2/1'], ['saddleFront', 13, 75, [9, -65], '01932026.img/walk1/0/2']]],
        [9, -66, 330, [['tamingMobFront', 19, 66, [9, -66], '01932026.img/stand1/3/0'], ['tamingMobMid', 41, 118, [9, -66], '01932026.img/stand1/1/1'], ['saddleFront', 13, 76, [9, -66], '01932026.img/walk1/0/2']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [8, -65, 190, [['tamingMobFront', 19, 63, null, '01932026.img/walk1/0/0'], ['tamingMobMid', 42, 117, [8, -65], '01932026.img/walk1/0/1'], ['saddleFront', 14, 75, [8, -65], '01932026.img/walk1/0/2']]],
        [9, -67, 190, [['tamingMobFront', 18, 66, [9, -67], '01932026.img/walk1/1/0'], ['tamingMobMid', 42, 120, [9, -67], '01932026.img/walk1/1/1'], ['saddleFront', 13, 77, [9, -67], '01932026.img/walk1/0/2']]],
        [8, -64, 190, [['tamingMobFront', 19, 66, [8, -64], '01932026.img/walk1/2/0'], ['tamingMobMid', 44, 117, [8, -64], '01932026.img/walk1/2/1'], ['saddleFront', 14, 74, [8, -64], '01932026.img/walk1/0/2']]],
        [9, -67, 190, [['tamingMobFront', 18, 64, [9, -67], '01932026.img/walk1/1/0'], ['tamingMobMid', 42, 120, [9, -67], '01932026.img/walk1/3/1'], ['saddleFront', 13, 77, [9, -67], '01932026.img/walk1/0/2']]],
      ],
    },
  },
  {
    id: 1932049,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [2, -57, 140, [['tamingMobMid', 55, 72, [2, -57], '01932049.img/stand1/0/0'], ['tamingMobRear', -3, 64, [2, -57], '01932049.img/walk1/0/1']]],
        [2, -58, 140, [['tamingMobMid', 58, 72, [2, -58], '01932049.img/stand1/1/0'], ['tamingMobRear', -3, 65, [2, -58], '01932049.img/walk1/0/1']]],
        [2, -59, 140, [['tamingMobMid', 63, 73, [2, -59], '01932049.img/walk1/5/0'], ['tamingMobRear', -3, 66, [2, -59], '01932049.img/walk1/0/1']]],
        [2, -60, 140, [['tamingMobMid', 55, 75, [2, -60], '01932049.img/stand1/0/0'], ['tamingMobRear', -3, 67, [2, -60], '01932049.img/walk1/0/1']]],
        [2, -59, 140, [['tamingMobMid', 58, 73, [2, -59], '01932049.img/stand1/1/0'], ['tamingMobRear', -3, 66, [2, -59], '01932049.img/walk1/0/1']]],
        [2, -58, 140, [['tamingMobMid', 63, 72, [2, -58], '01932049.img/walk1/5/0'], ['tamingMobRear', -3, 65, [2, -58], '01932049.img/walk1/0/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [2, -57, 140, [['tamingMobMid', 55, 72, [2, -57], '01932049.img/walk1/0/0'], ['tamingMobRear', -3, 64, [2, -57], '01932049.img/walk1/0/1']]],
        [2, -58, 140, [['tamingMobMid', 58, 72, [2, -58], '01932049.img/walk1/1/0'], ['tamingMobRear', -3, 65, [2, -58], '01932049.img/walk1/0/1']]],
        [2, -59, 140, [['tamingMobMid', 63, 73, [2, -59], '01932049.img/walk1/2/0'], ['tamingMobRear', -3, 66, [2, -59], '01932049.img/walk1/0/1']]],
        [2, -60, 140, [['tamingMobMid', 55, 75, [2, -60], '01932049.img/walk1/3/0'], ['tamingMobRear', -3, 67, [2, -60], '01932049.img/walk1/0/1']]],
        [2, -59, 140, [['tamingMobMid', 58, 73, [2, -59], '01932049.img/walk1/4/0'], ['tamingMobRear', -3, 66, [2, -59], '01932049.img/walk1/0/1']]],
        [2, -58, 140, [['tamingMobMid', 63, 72, [2, -58], '01932049.img/walk1/5/0'], ['tamingMobRear', -3, 65, [2, -58], '01932049.img/walk1/0/1']]],
      ],
    },
  },
  {
    id: 1932013,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [4, -19, 120, [['tamingMobMid', 62, 34, [4, -19], '01932013.img/stand1/0/0'], ['characterEnd', -2, 45, [4, -19], '01932013.img/stand1/0/1']]],
        [5, -18, 120, [['tamingMobMid', 62, 34, [5, -18], '01932013.img/stand1/1/0'], ['characterEnd', -2, 45, [5, -18], '01932013.img/stand1/0/1']]],
        [6, -19, 120, [['tamingMobMid', 62, 34, [6, -19], '01932013.img/stand1/2/0'], ['characterEnd', -2, 45, [6, -19], '01932013.img/stand1/0/1']]],
        [6, -19, 120, [['tamingMobMid', 62, 34, [6, -19], '01932013.img/stand1/3/0'], ['characterEnd', -2, 45, [6, -19], '01932013.img/stand1/0/1']]],
        [6, -19, 120, [['tamingMobMid', 62, 34, [6, -19], '01932013.img/stand1/4/0'], ['characterEnd', -2, 45, [6, -19], '01932013.img/stand1/0/1']]],
        [6, -19, 120, [['tamingMobMid', 62, 34, [6, -19], '01932013.img/stand1/5/0'], ['characterEnd', -2, 45, [6, -19], '01932013.img/stand1/0/1']]],
        [6, -19, 120, [['tamingMobMid', 62, 34, [6, -19], '01932013.img/stand1/6/0'], ['characterEnd', -2, 45, [6, -19], '01932013.img/stand1/0/1']]],
        [6, -19, 120, [['tamingMobMid', 62, 34, [6, -19], '01932013.img/stand1/7/0'], ['characterEnd', -2, 45, [6, -19], '01932013.img/stand1/0/1']]],
        [6, -19, 120, [['tamingMobMid', 62, 34, [6, -19], '01932013.img/stand1/8/0'], ['characterEnd', -2, 45, [6, -19], '01932013.img/stand1/0/1']]],
        [6, -19, 120, [['tamingMobMid', 62, 34, [6, -19], '01932013.img/stand1/8/0'], ['characterEnd', -2, 45, [6, -19], '01932013.img/stand1/0/1']]],
        [6, -19, 120, [['tamingMobMid', 62, 34, [6, -19], '01932013.img/stand1/8/0'], ['characterEnd', -2, 45, [6, -19], '01932013.img/stand1/0/1']]],
        [6, -19, 120, [['tamingMobMid', 62, 34, [6, -19], '01932013.img/stand1/8/0'], ['characterEnd', -2, 45, [6, -19], '01932013.img/stand1/0/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [5, -18, 120, [['tamingMobMid', 62, 34, [5, -18], '01932013.img/walk1/0/0'], ['characterEnd', 14, 45, [5, -18], '01932013.img/walk1/0/1']]],
        [5, -20, 120, [['tamingMobMid', 62, 35, [5, -20], '01932013.img/walk1/1/0'], ['characterEnd', 10, 46, [5, -20], '01932013.img/walk1/1/1']]],
        [5, -18, 120, [['tamingMobMid', 62, 34, [5, -18], '01932013.img/walk1/2/0'], ['characterEnd', 15, 45, [5, -18], '01932013.img/walk1/2/1']]],
        [5, -18, 150, [['tamingMobMid', 62, 35, [5, -18], '01932013.img/walk1/3/0'], ['characterEnd', 12, 46, [5, -18], '01932013.img/walk1/3/1']]],
      ],
    },
  },
  {
    id: 1932028,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [47, -43, 180, [['saddleRear', 72, 141, [47, -43], '01932028.img/stand1/0/0'], ['saddleFront', -26, 43, [47, -43], '01932028.img/walk1/0/1'], ['saddleRear', -36, 46, [47, -43], '01932028.img/walk1/0/2']]],
        [47, -44, 180, [['saddleRear', 72, 139, [47, -44], '01932028.img/stand1/1/0'], ['saddleFront', -26, 44, [47, -44], '01932028.img/walk1/0/1'], ['saddleRear', -36, 47, [47, -44], '01932028.img/walk1/0/2']]],
        [47, -45, 180, [['saddleRear', 72, 137, [47, -45], '01932028.img/stand1/2/0'], ['saddleFront', -26, 45, [47, -45], '01932028.img/walk1/0/1'], ['saddleRear', -36, 48, [47, -45], '01932028.img/walk1/0/2']]],
        [47, -44, 180, [['saddleRear', 72, 139, [47, -44], '01932028.img/stand1/3/0'], ['saddleFront', -26, 44, [47, -44], '01932028.img/walk1/0/1'], ['saddleRear', -36, 47, [47, -44], '01932028.img/walk1/0/2']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [41, -45, 120, [['saddleRear', 89, 139, [41, -45], '01932028.img/walk1/0/0'], ['saddleFront', -20, 45, [41, -45], '01932028.img/walk1/0/1'], ['saddleRear', -30, 48, [41, -45], '01932028.img/walk1/0/2']]],
        [41, -46, 120, [['saddleRear', 88, 138, [41, -46], '01932028.img/walk1/1/0'], ['saddleFront', -20, 46, [41, -46], '01932028.img/walk1/0/1'], ['saddleRear', -30, 49, [41, -46], '01932028.img/walk1/0/2']]],
        [41, -45, 120, [['saddleRear', 89, 139, [41, -45], '01932028.img/walk1/2/0'], ['saddleFront', -20, 45, [41, -45], '01932028.img/walk1/0/1'], ['saddleRear', -30, 48, [41, -45], '01932028.img/walk1/0/2']]],
        [41, -46, 120, [['saddleRear', 88, 138, [41, -46], '01932028.img/walk1/3/0'], ['saddleFront', -20, 46, [41, -46], '01932028.img/walk1/0/1'], ['saddleRear', -30, 49, [41, -46], '01932028.img/walk1/0/2']]],
      ],
    },
  },
  {
    id: 1932089,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [17, -55, 120, [['tamingMobFront', 53, 109, [17, -55], '01932089.img/stand1/0/0'], ['tamingMobRear', 58, 95, [17, -55], '01932089.img/stand1/0/1']]],
        [17, -56, 120, [['tamingMobFront', 53, 110, [17, -56], '01932089.img/stand1/1/0'], ['tamingMobRear', 67, 79, [17, -56], '01932089.img/stand1/1/1']]],
        [17, -57, 120, [['tamingMobFront', 53, 111, [17, -57], '01932089.img/stand1/2/0'], ['tamingMobRear', 38, 80, [17, -57], '01932089.img/stand1/2/1']]],
        [17, -58, 120, [['tamingMobFront', 53, 112, [17, -58], '01932089.img/stand1/3/0'], ['tamingMobRear', 37, 81, [17, -58], '01932089.img/stand1/3/1']]],
        [17, -59, 120, [['tamingMobFront', 53, 113, [17, -59], '01932089.img/stand1/4/0'], ['tamingMobRear', 68, 82, [17, -59], '01932089.img/stand1/4/1']]],
        [17, -58, 120, [['tamingMobFront', 53, 112, [17, -58], '01932089.img/stand1/5/0'], ['tamingMobRear', 59, 97, [17, -58], '01932089.img/stand1/5/1']]],
        [17, -57, 120, [['tamingMobFront', 53, 111, [17, -57], '01932089.img/stand1/6/0'], ['tamingMobRear', 58, 97, [17, -57], '01932089.img/stand1/6/1']]],
        [17, -56, 120, [['tamingMobFront', 53, 110, [17, -56], '01932089.img/stand1/7/0'], ['tamingMobRear', 56, 98, [17, -56], '01932089.img/stand1/7/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [18, -55, 120, [['tamingMobFront', 53, 109, [18, -55], '01932089.img/walk1/0/0'], ['tamingMobRear', 58, 95, [17, -55], '01932089.img/walk1/0/1']]],
        [16, -56, 120, [['tamingMobFront', 54, 110, [16, -56], '01932089.img/walk1/1/0'], ['tamingMobRear', 67, 79, [16, -56], '01932089.img/walk1/1/1']]],
        [15, -57, 120, [['tamingMobFront', 55, 111, [15, -57], '01932089.img/walk1/2/0'], ['tamingMobRear', 38, 80, [15, -57], '01932089.img/walk1/2/1']]],
        [15, -58, 120, [['tamingMobFront', 55, 112, [15, -58], '01932089.img/walk1/3/0'], ['tamingMobRear', 37, 81, [15, -58], '01932089.img/walk1/3/1']]],
        [16, -59, 120, [['tamingMobFront', 54, 113, [16, -59], '01932089.img/walk1/4/0'], ['tamingMobRear', 68, 82, [16, -59], '01932089.img/walk1/4/1']]],
        [17, -58, 120, [['tamingMobFront', 53, 112, [17, -58], '01932089.img/walk1/5/0'], ['tamingMobRear', 59, 97, [17, -58], '01932089.img/walk1/5/1']]],
        [18, -57, 120, [['tamingMobFront', 53, 111, [18, -57], '01932089.img/walk1/6/0'], ['tamingMobRear', 58, 97, [17, -57], '01932089.img/walk1/6/1']]],
        [17, -56, 120, [['tamingMobFront', 53, 110, [17, -56], '01932089.img/walk1/7/0'], ['tamingMobRear', 56, 98, [17, -56], '01932089.img/walk1/7/1']]],
      ],
    },
  },
  {
    id: 1932178,
    hideCape: true,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [7, -88, 200, [['tamingMobFront', -5, 126, [7, -88], '01932178.img/walk1/0/0'], ['tamingMobMid', 75, 147, [7, -88], '01932178.img/stand1/0/1'], ['tamingMobRear', 54, 118, [7, -88], '01932178.img/walk1/0/2']]],
        [7, -91, 200, [['tamingMobFront', -5, 121, [7, -91], '01932178.img/walk1/1/0'], ['tamingMobMid', 76, 149, [7, -91], '01932178.img/stand1/1/1'], ['tamingMobRear', 55, 117, [7, -91], '01932178.img/walk1/1/2']]],
        [6, -94, 200, [['tamingMobFront', -4, 80, [6, -94], '01932178.img/stand1/2/0'], ['tamingMobMid', 80, 151, [6, -94], '01932178.img/stand1/2/1'], ['tamingMobRear', 28, 80, [6, -94], '01932178.img/stand1/2/2']]],
        [5, -95, 200, [['tamingMobFront', -3, 82, [5, -95], '01932178.img/walk1/3/0'], ['tamingMobMid', 82, 152, [5, -95], '01932178.img/stand1/3/1'], ['tamingMobRear', 26, 82, [5, -95], '01932178.img/walk1/3/2']]],
        [6, -91, 200, [['tamingMobFront', -6, 101, [6, -91], '01932178.img/stand1/4/0'], ['tamingMobMid', 77, 149, [6, -91], '01932178.img/stand1/1/1'], ['tamingMobRear', 45, 105, [6, -91], '01932178.img/walk1/4/2']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [7, -88, 150, [['tamingMobFront', -5, 126, [7, -88], '01932178.img/walk1/0/0'], ['tamingMobMid', 78, 146, [7, -88], '01932178.img/walk1/0/1'], ['tamingMobRear', 54, 118, [7, -88], '01932178.img/walk1/0/2']]],
        [7, -90, 150, [['tamingMobFront', -5, 120, [7, -90], '01932178.img/walk1/1/0'], ['tamingMobMid', 81, 147, [7, -90], '01932178.img/walk1/1/1'], ['tamingMobRear', 55, 116, [7, -90], '01932178.img/walk1/1/2']]],
        [6, -92, 150, [['tamingMobFront', -3, 82, [6, -92], '01932178.img/walk1/2/0'], ['tamingMobMid', 85, 148, [6, -92], '01932178.img/walk1/2/1'], ['tamingMobRear', 35, 86, [6, -92], '01932178.img/walk1/2/2']]],
        [4, -93, 150, [['tamingMobFront', -2, 82, [4, -93], '01932178.img/walk1/3/0'], ['tamingMobMid', 88, 148, [4, -93], '01932178.img/walk1/3/1'], ['tamingMobRear', 30, 82, [4, -93], '01932178.img/walk1/3/2']]],
        [6, -91, 150, [['tamingMobFront', -5, 101, [6, -91], '01932178.img/walk1/4/0'], ['tamingMobMid', 82, 148, [6, -91], '01932178.img/walk1/1/1'], ['tamingMobRear', 46, 105, [6, -91], '01932178.img/walk1/4/2']]],
      ],
    },
  },
  {
    id: 1932010,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [7, -111, 200, [['tamingMobFront', 60, 124, [7, -111], '01932010.img/stand1/0/0'], ['tamingMobRear', 84, 155, [7, -111], '01932010.img/stand1/0/1']]],
        [7, -111, 200, [['tamingMobFront', 60, 124, [7, -111], '01932010.img/stand1/1/0'], ['tamingMobRear', 84, 155, [7, -111], '01932010.img/stand1/1/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [-16, -118, 200, [['tamingMobFront', 79, 131, [-16, -118], '01932010.img/walk1/0/0'], ['tamingMobRear', 104, 161, [-16, -118], '01932010.img/walk1/0/1']]],
        [-22, -112, 200, [['tamingMobFront', 85, 127, [-22, -112], '01932010.img/walk1/1/0'], ['tamingMobRear', 104, 155, [-22, -112], '01932010.img/walk1/1/1']]],
        [-20, -121, 200, [['tamingMobFront', 84, 133, [-20, -121], '01932010.img/walk1/2/0'], ['tamingMobRear', 108, 168, [-20, -121], '01932010.img/walk1/2/1']]],
        [-25, -116, 200, [['tamingMobFront', 95, 128, [-25, -116], '01932010.img/walk1/2/0'], ['tamingMobRear', 123, 157, [-25, -116], '01932010.img/walk1/3/1']]],
        [-19, -117, 200, [['tamingMobFront', 84, 131, [-19, -117], '01932010.img/walk1/2/0'], ['tamingMobRear', 108, 166, [-19, -117], '01932010.img/walk1/4/1']]],
      ],
    },
  },
  {
    id: 1932012,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [7, -111, 200, [['tamingMobFront', 60, 123, [7, -111], '01932012.img/stand1/0/0'], ['tamingMobRear', 84, 155, [7, -111], '01932012.img/stand1/0/1']]],
        [7, -111, 200, [['tamingMobFront', 60, 123, [7, -111], '01932012.img/stand1/1/0'], ['tamingMobRear', 84, 155, [7, -111], '01932012.img/stand1/1/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [-16, -118, 200, [['tamingMobFront', 79, 130, [-16, -118], '01932012.img/walk1/0/0'], ['tamingMobRear', 104, 161, [-16, -118], '01932012.img/walk1/0/1']]],
        [-22, -112, 200, [['tamingMobFront', 85, 126, [-22, -112], '01932012.img/walk1/1/0'], ['tamingMobRear', 104, 155, [-22, -112], '01932012.img/walk1/1/1']]],
        [-20, -121, 200, [['tamingMobFront', 84, 132, [-20, -121], '01932012.img/walk1/2/0'], ['tamingMobRear', 108, 168, [-20, -121], '01932012.img/walk1/2/1']]],
        [-25, -116, 200, [['tamingMobFront', 95, 127, [-25, -116], '01932012.img/walk1/2/0'], ['tamingMobRear', 123, 157, [-25, -116], '01932012.img/walk1/3/1']]],
        [-19, -117, 200, [['tamingMobFront', 84, 130, [-19, -117], '01932012.img/walk1/2/0'], ['tamingMobRear', 108, 166, [-19, -117], '01932012.img/walk1/4/1']]],
      ],
    },
  },
  {
    id: 1932250,
    hideCape: true,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [7, -111, 200, [['tamingMobFront', 60, 123, [7, -111], '01932012.img/stand1/0/0'], ['tamingMobRear', 84, 155, [7, -111], '01932012.img/stand1/0/1']]],
        [7, -111, 200, [['tamingMobFront', 60, 123, [7, -111], '01932012.img/stand1/1/0'], ['tamingMobRear', 84, 155, [7, -111], '01932012.img/stand1/1/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [-16, -118, 200, [['tamingMobFront', 79, 130, [-16, -118], '01932012.img/walk1/0/0'], ['tamingMobRear', 104, 161, [-16, -118], '01932012.img/walk1/0/1']]],
        [-22, -112, 200, [['tamingMobFront', 85, 126, [-22, -112], '01932012.img/walk1/1/0'], ['tamingMobRear', 104, 155, [-22, -112], '01932012.img/walk1/1/1']]],
        [-20, -121, 200, [['tamingMobFront', 84, 132, [-20, -121], '01932012.img/walk1/2/0'], ['tamingMobRear', 108, 168, [-20, -121], '01932012.img/walk1/2/1']]],
        [-25, -116, 200, [['tamingMobFront', 95, 127, [-25, -116], '01932012.img/walk1/2/0'], ['tamingMobRear', 123, 157, [-25, -116], '01932012.img/walk1/3/1']]],
        [-19, -117, 200, [['tamingMobFront', 84, 130, [-19, -117], '01932012.img/walk1/2/0'], ['tamingMobRear', 108, 166, [-19, -117], '01932012.img/walk1/4/1']]],
      ],
    },
  },
  {
    id: 1932161,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [10, -20, 150, [['tamingMobFront', 20, 121, [10, -20], '01932161.img/stand1/0/0'], ['tamingMobRear', 48, 178, null, '01932161.img/stand1/0/1']]],
        [10, -21, 150, [['tamingMobFront', 20, 123, [10, -21], '01932161.img/stand1/0/0'], ['tamingMobRear', 48, 179, null, '01932161.img/stand1/1/1']]],
        [10, -23, 150, [['tamingMobFront', 20, 126, [10, -23], '01932161.img/stand1/0/0'], ['tamingMobRear', 48, 181, null, '01932161.img/stand1/2/1']]],
        [10, -25, 150, [['tamingMobFront', 20, 127, [10, -25], '01932161.img/stand1/0/0'], ['tamingMobRear', 48, 183, null, '01932161.img/stand1/3/1']]],
        [10, -24, 150, [['tamingMobFront', 20, 125, [10, -24], '01932161.img/stand1/0/0'], ['tamingMobRear', 48, 182, null, '01932161.img/stand1/4/1']]],
        [10, -23, 150, [['tamingMobFront', 20, 123, [10, -23], '01932161.img/stand1/0/0'], ['tamingMobRear', 48, 181, null, '01932161.img/stand1/5/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [10, -20, 150, [['tamingMobFront', 20, 121, [10, -20], '01932161.img/stand1/0/0'], ['tamingMobRear', 48, 178, null, '01932161.img/stand1/0/1']]],
        [10, -21, 150, [['tamingMobFront', 20, 123, [10, -21], '01932161.img/stand1/0/0'], ['tamingMobRear', 48, 179, null, '01932161.img/stand1/1/1']]],
        [10, -23, 150, [['tamingMobFront', 20, 126, [10, -23], '01932161.img/stand1/0/0'], ['tamingMobRear', 48, 181, null, '01932161.img/stand1/2/1']]],
        [10, -25, 150, [['tamingMobFront', 20, 127, [10, -25], '01932161.img/stand1/0/0'], ['tamingMobRear', 48, 183, null, '01932161.img/stand1/3/1']]],
        [10, -24, 150, [['tamingMobFront', 20, 125, [10, -24], '01932161.img/stand1/0/0'], ['tamingMobRear', 48, 182, null, '01932161.img/stand1/4/1']]],
        [10, -23, 150, [['tamingMobFront', 20, 123, [10, -23], '01932161.img/stand1/0/0'], ['tamingMobRear', 48, 181, null, '01932161.img/stand1/5/1']]],
      ],
    },
  },
  {
    id: 1932162,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [10, -60, 150, [['tamingMobFront', 20, 156, [10, -60], '01932162.img/stand1/0/0'], ['tamingMobRear', 48, 213, [10, -60], '01932162.img/stand1/0/1']]],
        [10, -61, 150, [['tamingMobFront', 20, 158, [10, -61], '01932162.img/stand1/0/0'], ['tamingMobRear', 48, 214, [10, -61], '01932162.img/stand1/1/1']]],
        [10, -63, 150, [['tamingMobFront', 20, 161, [10, -63], '01932162.img/stand1/0/0'], ['tamingMobRear', 48, 216, [10, -63], '01932162.img/stand1/2/1']]],
        [10, -65, 150, [['tamingMobFront', 20, 162, [10, -65], '01932162.img/stand1/0/0'], ['tamingMobRear', 48, 218, [10, -65], '01932162.img/stand1/3/1']]],
        [10, -64, 150, [['tamingMobFront', 20, 160, [10, -64], '01932162.img/stand1/0/0'], ['tamingMobRear', 48, 217, [10, -64], '01932162.img/stand1/4/1']]],
        [10, -63, 150, [['tamingMobFront', 20, 158, [10, -63], '01932162.img/stand1/0/0'], ['tamingMobRear', 48, 216, [10, -64], '01932162.img/stand1/5/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [10, -60, 150, [['tamingMobFront', 20, 156, [10, -60], '01932162.img/stand1/0/0'], ['tamingMobRear', 48, 213, [10, -60], '01932162.img/stand1/0/1']]],
        [10, -61, 150, [['tamingMobFront', 20, 158, [10, -61], '01932162.img/stand1/0/0'], ['tamingMobRear', 48, 214, [10, -61], '01932162.img/stand1/1/1']]],
        [10, -63, 150, [['tamingMobFront', 20, 161, [10, -63], '01932162.img/stand1/0/0'], ['tamingMobRear', 48, 216, [10, -63], '01932162.img/stand1/2/1']]],
        [10, -65, 150, [['tamingMobFront', 20, 162, [10, -65], '01932162.img/stand1/0/0'], ['tamingMobRear', 48, 218, [10, -65], '01932162.img/stand1/3/1']]],
        [10, -64, 150, [['tamingMobFront', 20, 160, [10, -64], '01932162.img/stand1/0/0'], ['tamingMobRear', 48, 217, [10, -64], '01932162.img/stand1/4/1']]],
        [10, -63, 150, [['tamingMobFront', 20, 158, [10, -63], '01932162.img/stand1/0/0'], ['tamingMobRear', 48, 216, [10, -63], '01932162.img/stand1/5/1']]],
      ],
    },
  },
  {
    id: 1932323,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [3, -46, 120, [['tamingMobFront', 67, 78, [3, -46], '01932323.img/stand1/0/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 76, [3, -46], '01932323.img/stand1/1/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 75, [3, -46], '01932323.img/stand1/2/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 76, [3, -46], '01932323.img/stand1/3/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 78, [3, -46], '01932323.img/stand1/4/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 76, [3, -46], '01932323.img/stand1/5/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 75, [3, -46], '01932323.img/stand1/6/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 76, [3, -46], '01932323.img/stand1/1/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 78, [3, -46], '01932323.img/stand1/8/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 78, [3, -46], '01932323.img/stand1/9/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 78, [3, -46], '01932323.img/stand1/4/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 88, 98, [3, -46], '01932323.img/stand1/11/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 73, 81, [3, -46], '01932323.img/stand1/12/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 73, 81, [3, -46], '01932323.img/stand1/13/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 78, [3, -46], '01932323.img/stand1/14/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 78, [3, -46], '01932323.img/stand1/15/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 78, [3, -46], '01932323.img/stand1/16/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 78, [3, -46], '01932323.img/stand1/17/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 78, [3, -46], '01932323.img/stand1/18/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 78, [3, -46], '01932323.img/stand1/19/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 78, [3, -46], '01932323.img/stand1/8/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 78, [3, -46], '01932323.img/stand1/9/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 78, [3, -46], '01932323.img/stand1/4/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
        [3, -46, 120, [['tamingMobFront', 67, 78, [3, -46], '01932323.img/stand1/23/0'], ['tamingMobRear', 29, 51, null, '01932323.img/stand1/0/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [5, -68, 200, [['tamingMobFront', 54, 126, [5, -68], '01932323.img/walk1/0/0'], ['tamingMobRear', 83, 77, null, '01932323.img/walk1/0/1']]],
        [5, -67, 200, [['tamingMobFront', 54, 124, [5, -67], '01932323.img/walk1/1/0'], ['tamingMobRear', 81, 77, null, '01932323.img/walk1/1/1']]],
        [6, -70, 200, [['tamingMobFront', 55, 124, [6, -70], '01932323.img/walk1/2/0'], ['tamingMobRear', 82, 78, null, '01932323.img/walk1/2/1']]],
        [6, -69, 200, [['tamingMobFront', 56, 124, [6, -69], '01932323.img/walk1/3/0'], ['tamingMobRear', 82, 75, null, '01932323.img/walk1/3/1']]],
        [6, -73, 200, [['tamingMobFront', 56, 127, [6, -73], '01932323.img/walk1/4/0'], ['tamingMobRear', 80, 80, null, '01932323.img/walk1/4/1']]],
        [6, -72, 200, [['tamingMobFront', 55, 126, [6, -72], '01932323.img/walk1/5/0'], ['tamingMobRear', 85, 80, null, '01932323.img/walk1/5/1']]],
        [5, -69, 200, [['tamingMobFront', 55, 123, [5, -69], '01932323.img/walk1/6/0'], ['tamingMobRear', 82, 79, null, '01932323.img/walk1/0/1']]],
        [5, -67, 200, [['tamingMobFront', 55, 125, [5, -67], '01932323.img/walk1/7/0'], ['tamingMobRear', 79, 79, null, '01932323.img/walk1/1/1']]],
        [5, -72, 200, [['tamingMobFront', 55, 124, [5, -72], '01932323.img/walk1/8/0'], ['tamingMobRear', 82, 81, null, '01932323.img/walk1/2/1']]],
        [5, -73, 200, [['tamingMobFront', 54, 122, [5, -73], '01932323.img/walk1/9/0'], ['tamingMobRear', 81, 82, null, '01932323.img/walk1/3/1']]],
        [5, -77, 200, [['tamingMobFront', 54, 123, [5, -77], '01932323.img/walk1/10/0'], ['tamingMobRear', 79, 84, null, '01932323.img/walk1/4/1']]],
      ],
    },
  },
  {
    id: 1932241,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [6, -42, 90, [['tamingMobFront', 69, 93, [6, -42], '01932241.img/stand1/0/0'], ['tamingMobBack', 0, 73, [6, -42], '01932237.img/stand1/0/1']]],
        [6, -41, 90, [['tamingMobFront', 69, 92, [6, -41], '01932241.img/stand1/1/0'], ['tamingMobBack', 0, 72, [6, -41], '01932237.img/stand1/0/1']]],
        [6, -42, 90, [['tamingMobFront', 69, 93, [6, -42], '01932241.img/stand1/0/0'], ['tamingMobBack', 0, 73, [6, -42], '01932237.img/stand1/0/1']]],
        [6, -41, 90, [['tamingMobFront', 69, 92, [6, -41], '01932241.img/stand1/1/0'], ['tamingMobBack', 0, 72, [6, -41], '01932237.img/stand1/0/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [6, -42, 150, [['tamingMobFront', 118, 93, [6, -42], '01932241.img/walk1/0/0'], ['tamingMobBack', 54, 73, [6, -42], '01932237.img/walk1/0/1']]],
        [6, -41, 150, [['tamingMobFront', 118, 92, [6, -41], '01932241.img/walk1/1/0'], ['tamingMobBack', 59, 72, [6, -41], '01932237.img/walk1/1/1']]],
        [6, -42, 150, [['tamingMobFront', 118, 93, [6, -42], '01932241.img/walk1/2/0'], ['tamingMobBack', 54, 73, [6, -42], '01932237.img/walk1/0/1']]],
        [6, -41, 150, [['tamingMobFront', 115, 92, [6, -41], '01932241.img/walk1/3/0'], ['tamingMobBack', 55, 72, [6, -41], '01932237.img/walk1/3/1']]],
        [6, -42, 150, [['tamingMobFront', 118, 93, [6, -42], '01932241.img/walk1/0/0'], ['tamingMobBack', 61, 73, [6, -42], '01932237.img/walk1/4/1']]],
        [6, -41, 150, [['tamingMobFront', 118, 92, [6, -41], '01932241.img/walk1/1/0'], ['tamingMobBack', 59, 72, [6, -41], '01932237.img/walk1/5/1']]],
        [6, -42, 150, [['tamingMobFront', 118, 93, [6, -42], '01932241.img/walk1/2/0'], ['tamingMobBack', 54, 73, [6, -42], '01932237.img/walk1/6/1']]],
        [6, -41, 150, [['tamingMobFront', 115, 92, [6, -41], '01932241.img/walk1/3/0'], ['tamingMobBack', 55, 72, [6, -41], '01932237.img/walk1/7/1']]],
      ],
    },
  },
  {
    id: 1932544,
    hideCape: true,
    stand: {
      action: 'walk1',
      body: 'fly',
      frames: [
        [2, -35, 150, [['tamingMobRear', 61, 124, [2, -35], '01932544.img/walk1/0/0']]],
        [2, -36, 150, [['tamingMobRear', 61, 124, [2, -36], '01932544.img/walk1/1/0']]],
        [2, -37, 150, [['tamingMobRear', 60, 124, [2, -37], '01932544.img/walk1/2/0']]],
        [2, -38, 150, [['tamingMobRear', 59, 124, [2, -38], '01932544.img/walk1/3/0']]],
        [2, -37, 150, [['tamingMobRear', 54, 124, [2, -37], '01932544.img/walk1/4/0']]],
        [2, -36, 150, [['tamingMobRear', 54, 123, [2, -36], '01932544.img/walk1/5/0']]],
        [2, -36, 150, [['tamingMobRear', 55, 124, [2, -36], '01932544.img/walk1/6/0']]],
        [2, -35, 150, [['tamingMobRear', 55, 124, [2, -35], '01932544.img/walk1/7/0']]],
        [2, -35, 150, [['tamingMobRear', 61, 124, [2, -35], '01932544.img/walk1/8/0']]],
        [2, -36, 150, [['tamingMobRear', 61, 124, [2, -36], '01932544.img/walk1/9/0']]],
        [2, -37, 150, [['tamingMobRear', 60, 124, [2, -37], '01932544.img/walk1/10/0']]],
        [2, -38, 150, [['tamingMobRear', 58, 124, [2, -38], '01932544.img/walk1/11/0']]],
        [2, -38, 150, [['tamingMobRear', 54, 124, [2, -38], '01932544.img/walk1/12/0']]],
        [2, -37, 150, [['tamingMobRear', 54, 124, [2, -37], '01932544.img/walk1/13/0']]],
        [2, -36, 150, [['tamingMobRear', 53, 124, [2, -36], '01932544.img/walk1/14/0']]],
        [2, -35, 150, [['tamingMobRear', 55, 124, [2, -35], '01932544.img/walk1/15/0']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'fly',
      frames: [
        [2, -35, 150, [['tamingMobRear', 61, 124, [2, -35], '01932544.img/walk1/0/0']]],
        [2, -36, 150, [['tamingMobRear', 61, 124, [2, -36], '01932544.img/walk1/1/0']]],
        [2, -37, 150, [['tamingMobRear', 60, 124, [2, -37], '01932544.img/walk1/2/0']]],
        [2, -38, 150, [['tamingMobRear', 59, 124, [2, -38], '01932544.img/walk1/3/0']]],
        [2, -37, 150, [['tamingMobRear', 54, 124, [2, -37], '01932544.img/walk1/4/0']]],
        [2, -36, 150, [['tamingMobRear', 54, 123, [2, -36], '01932544.img/walk1/5/0']]],
        [2, -36, 150, [['tamingMobRear', 55, 124, [2, -36], '01932544.img/walk1/6/0']]],
        [2, -35, 150, [['tamingMobRear', 55, 124, [2, -35], '01932544.img/walk1/7/0']]],
        [2, -35, 150, [['tamingMobRear', 61, 124, [2, -35], '01932544.img/walk1/8/0']]],
        [2, -36, 150, [['tamingMobRear', 61, 124, [2, -36], '01932544.img/walk1/9/0']]],
        [2, -37, 150, [['tamingMobRear', 60, 124, [2, -37], '01932544.img/walk1/10/0']]],
        [2, -38, 150, [['tamingMobRear', 58, 124, [2, -38], '01932544.img/walk1/11/0']]],
        [2, -38, 150, [['tamingMobRear', 54, 124, [2, -38], '01932544.img/walk1/12/0']]],
        [2, -37, 150, [['tamingMobRear', 54, 124, [2, -37], '01932544.img/walk1/13/0']]],
        [2, -36, 150, [['tamingMobRear', 53, 124, [2, -36], '01932544.img/walk1/14/0']]],
        [2, -35, 150, [['tamingMobRear', 55, 124, [2, -35], '01932544.img/walk1/15/0']]],
      ],
    },
  },
  {
    id: 1932204,
    stand: {
      action: 'stand1',
      body: 'sit',
      frames: [
        [-46, -87, 150, [['saddleFront', 71, 91, [-46, -87], '01932204.img/stand1/0/0'], ['saddleRear', 73, 99, null, '01932204.img/walk1/0/1']]],
        [-46, -86, 150, [['saddleFront', 71, 90, [-46, -86], '01932204.img/stand1/0/0'], ['saddleRear', 73, 98, null, '01932204.img/walk1/0/1']]],
        [-46, -87, 150, [['saddleFront', 71, 91, [-46, -87], '01932204.img/stand1/0/0'], ['saddleRear', 73, 99, null, '01932204.img/walk1/0/1']]],
        [-46, -88, 150, [['saddleFront', 71, 92, [-46, -88], '01932204.img/stand1/0/0'], ['saddleRear', 73, 100, null, '01932204.img/walk1/0/1']]],
        [-46, -89, 150, [['saddleFront', 71, 93, [-46, -89], '01932204.img/stand1/0/0'], ['saddleRear', 73, 101, null, '01932204.img/walk1/0/1']]],
        [-46, -88, 150, [['saddleFront', 71, 92, [-46, -88], '01932204.img/stand1/0/0'], ['saddleRear', 73, 100, null, '01932204.img/walk1/0/1']]],
      ],
    },
    walk: {
      action: 'walk1',
      body: 'sit',
      frames: [
        [-46, -87, 150, [['saddleFront', 71, 94, [-46, -87], '01932204.img/walk1/0/0'], ['saddleRear', 73, 99, null, '01932204.img/walk1/0/1']]],
        [-46, -86, 150, [['saddleFront', 71, 93, [-46, -86], '01932204.img/walk1/1/0'], ['saddleRear', 73, 98, null, '01932204.img/walk1/0/1']]],
        [-46, -87, 150, [['saddleFront', 71, 92, [-46, -87], '01932204.img/walk1/2/0'], ['saddleRear', 73, 99, null, '01932204.img/walk1/0/1']]],
        [-46, -88, 150, [['saddleFront', 71, 92, [-46, -88], '01932204.img/walk1/3/0'], ['saddleRear', 73, 100, null, '01932204.img/walk1/0/1']]],
        [-46, -87, 150, [['saddleFront', 71, 91, [-46, -87], '01932204.img/walk1/4/0'], ['saddleRear', 73, 99, null, '01932204.img/walk1/0/1']]],
        [-46, -86, 150, [['saddleFront', 71, 90, [-46, -86], '01932204.img/walk1/5/0'], ['saddleRear', 73, 98, null, '01932204.img/walk1/0/1']]],
      ],
    },
  },
];

const artById = new Map(MOUNT_ART.map((art) => [art.id, art]));
export const mountArtOf = (mountId: number): MountArt | null => artById.get(mountId) ?? null;

/** 프레임마다 레이어 그림. 같은 그림을 가리키는 레이어가 많아 주소마다 한 번만 받는다 */
export function loadMountFrames(motion: MountMotion): Promise<Texture[][]> {
  return Promise.all(
    motion.frames.map(([, , , layers]) =>
      Promise.all(layers.map(([, , , , path]) => loadTexture(wzImageUrl(`Character/TamingMob/_Canvas/${path}`)))),
    ),
  );
}
