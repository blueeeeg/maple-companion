import type { ChairArt, ChairLayerData } from '../maple/chairArt';
import type { Point } from '../maple/ground';

// 의자 그리는 규칙은 KMS 389 WZ 값을 원작 클라이언트처럼 합성해 맞춰 본 것이다. 좌표는 모두 캐릭터가 왼쪽을 볼 때 발 기준이다

/** 앉기 0프레임의 이마(body.neck − head.neck + head.brow). pos=1 레이어는 여기를 기준점으로 쓴다 */
export const SIT_BROW: Point = { x: -5, y: -48 };

/** 캐릭터를 그릴 곳. 발에서 bodyRelMove 만큼 옮긴다 */
export function seatedBodyOffset(art: ChairArt): Point {
  const [x, y] = art.bodyRelMove ?? [0, 0];
  return { x, y };
}

/**
 * 레이어 기준점. sitAction 이 없는 의자는 옮긴 몸 자리, 있는 의자는 옮기기 전 발이다.
 * sitAction 의자를 옮긴 몸 자리에 그리면 의자가 공중에 뜬다(힐라와 매그너스는 64px)
 */
export function layerAnchor(art: ChairArt, layer: Pick<ChairLayerData, 'pos'>): Point {
  const base = art.sitAction ? { x: 0, y: 0 } : seatedBodyOffset(art);
  return layer.pos === 1 ? { x: base.x + SIT_BROW.x, y: base.y + SIT_BROW.y } : base;
}

export const frameTopLeft = (anchor: Point, origin: Point): Point => ({ x: anchor.x - origin.x, y: anchor.y - origin.y });

export const inFrontOfHero = (layer: Pick<ChairLayerData, 'z'>) => layer.z >= 0;

/** 뒤 레이어끼리, 앞 레이어끼리 z 가 작은 것부터 그린다 */
export function layerOrder<T extends Pick<ChairLayerData, 'z'>>(layers: T[]): { back: T[]; front: T[] } {
  const sorted = [...layers].sort((a, b) => a.z - b.z);
  return { back: sorted.filter((layer) => !inFrontOfHero(layer)), front: sorted.filter(inFrontOfHero) };
}

/** sitLeft 의자는 캐릭터가 오른쪽을 보고 있어도 왼쪽을 보고 앉는다 */
export const seatFacing = (art: ChairArt, facing: -1 | 1): -1 | 1 => (art.sitLeft ? -1 : facing);

/** 앉아 있는 동안 도는 의자 프레임의 가장 짧은 딜레이. 한 장뿐인 레이어는 돌지 않는다 */
export function chairLoopDelayMs(art: ChairArt): number {
  return Math.min(
    ...art.layers.filter((layer) => layer.frames.length > 1).flatMap((layer) => layer.frames.map(([, , delay]) => delay)),
  );
}

const CAPE = 110;
const WEAPON_PREFIXES = new Set([...Array.from({ length: 30 }, (_, index) => 130 + index), 170]);

/** 의자가 무기·망토를 숨기면 앉은 그림에서 뺀다. 캐시 무기 외형(170)도 같이 뺀다 */
export function seatedLook(look: number[], art: ChairArt): number[] {
  return look.filter((itemId) => {
    const prefix = Math.floor(itemId / 10000);
    if (art.hideCape && prefix === CAPE) return false;
    return !(art.hideWeapon && WEAPON_PREFIXES.has(prefix));
  });
}
