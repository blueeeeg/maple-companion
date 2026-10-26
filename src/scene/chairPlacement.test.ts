import { describe, expect, it } from 'vitest';
import { type ChairArt, chairArtOf } from '../maple/chairArt';
import {
  SIT_BROW,
  chairLoopDelayMs,
  frameTopLeft,
  inFrontOfHero,
  layerAnchor,
  layerOrder,
  seatFacing,
  seatedBodyOffset,
  seatedLook,
} from './chairPlacement';

const art = (id: number) => chairArtOf(id)!;
const PINK_BEAN_CHAIR = 3010225;
const ZAKUM_CHAIR = 3010455;
const HILLA_MAGNUS = 3015118;
const FRANKEN_BALROG = 3015521;
const STUMP = 3018221;

describe('기준 A·B', () => {
  it('sitAction 이 없으면 의자 기준점이 발 + bodyRelMove 이고 캐릭터도 거기 그린다', () => {
    const pinkBean = art(PINK_BEAN_CHAIR);
    expect(seatedBodyOffset(pinkBean)).toEqual({ x: 0, y: -86 });
    expect(layerAnchor(pinkBean, pinkBean.layers[0])).toEqual({ x: 0, y: -86 });
    // 핑크빈 의자 effect/0 origin (60, 34)
    expect(frameTopLeft(layerAnchor(pinkBean, pinkBean.layers[0]), { x: 60, y: 34 })).toEqual({ x: -60, y: -120 });
  });

  it('sitAction 이 있으면 의자 기준점이 원래 발이고 캐릭터만 옮긴다', () => {
    const hillaMagnus = art(HILLA_MAGNUS);
    expect(hillaMagnus.sitAction).toBe('sit');
    expect(seatedBodyOffset(hillaMagnus)).toEqual({ x: 50, y: -65 });
    hillaMagnus.layers.forEach((layer) => expect(layerAnchor(hillaMagnus, layer)).toEqual({ x: 0, y: 0 }));
    expect(art(FRANKEN_BALROG).sitAction).toBe('stand1');
    expect(layerAnchor(art(FRANKEN_BALROG), art(FRANKEN_BALROG).layers[0])).toEqual({ x: 0, y: 0 });
  });

  it('bodyRelMove 가 비어 있으면 발 그대로다', () => {
    expect(seatedBodyOffset(art(3010430))).toEqual({ x: 0, y: 0 });
    expect(seatedBodyOffset(art(3010001))).toEqual({ x: 0, y: 0 });
  });
});

describe('pos=1', () => {
  it('기준점에 이마(−5, −48)를 더한다', () => {
    expect(SIT_BROW).toEqual({ x: -5, y: -48 });
    const zakum = art(ZAKUM_CHAIR);
    expect(zakum.layers[0].pos).toBe(1);
    expect(layerAnchor(zakum, zakum.layers[0])).toEqual({ x: -5, y: -48 });
    const fake: ChairArt = { id: 1, img: 'x', bodyRelMove: [10, -20], layers: [] };
    expect(layerAnchor(fake, { pos: 1 })).toEqual({ x: 5, y: -68 });
    expect(layerAnchor({ ...fake, sitAction: 'sit' }, { pos: 1 })).toEqual({ x: -5, y: -48 });
  });

  it('pos=1 의자는 자쿰의 제왕·발록·혼테일 셋이다', () => {
    [ZAKUM_CHAIR, 3010636, 3010581].forEach((id) => expect(art(id).layers.some((layer) => layer.pos === 1)).toBe(true));
  });
});

describe('앞뒤', () => {
  it('z 가 음수면 캐릭터 뒤, 0 이상이면 앞이다', () => {
    expect(inFrontOfHero({ z: -1 })).toBe(false);
    expect(inFrontOfHero({ z: 0 })).toBe(true);
    expect(inFrontOfHero({ z: 3 })).toBe(true);
  });

  it('그루터기는 받침이 뒤(z −2), 잎이 앞(z 3)이다', () => {
    const { back, front } = layerOrder(art(STUMP).layers);
    expect(back.map((layer) => layer.node)).toEqual(['effect2']);
    expect(front.map((layer) => layer.node)).toEqual(['effect']);
  });

  it('같은 쪽은 z 가 작은 것부터 그린다', () => {
    const { back, front } = layerOrder([{ z: 3 }, { z: -1 }, { z: 0 }, { z: -2 }]);
    expect(back).toEqual([{ z: -2 }, { z: -1 }]);
    expect(front).toEqual([{ z: 0 }, { z: 3 }]);
  });
});

describe('그 밖의 규칙', () => {
  it('sitLeft 의자는 오른쪽을 봐도 왼쪽을 보고 앉는다', () => {
    expect(seatFacing(art(HILLA_MAGNUS), 1)).toBe(-1);
    expect(seatFacing(art(PINK_BEAN_CHAIR), 1)).toBe(1);
  });

  it('도는 의자의 가장 짧은 프레임 딜레이. 한 장짜리는 안 돈다', () => {
    expect(chairLoopDelayMs(art(3010430))).toBe(96);
    expect(chairLoopDelayMs(art(3010423))).toBe(180);
    expect(chairLoopDelayMs(art(3010001))).toBe(Infinity);
    // 그루터기 받침(한 장)은 빼고 잎(210ms)만 센다
    expect(chairLoopDelayMs(art(STUMP))).toBe(210);
  });

  it('무기·망토를 숨기는 의자는 앉은 그림에서 뺀다', () => {
    const look = [2000, 12000, 1002357, 1102481, 1302355, 1702000];
    expect(seatedLook(look, art(HILLA_MAGNUS))).toEqual([2000, 12000, 1002357]);
    expect(seatedLook(look, art(PINK_BEAN_CHAIR))).toEqual(look);
  });
});
