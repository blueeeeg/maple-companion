import type { Point } from '../maple/ground';
import { type RouteField, isPassage } from './routeCuration';
import { TOWN_ROUTES } from './routeData';
import { CLASSIC_TOWN_ROUTES } from './routeData.classic';
import { type Town, townEra } from './towns';

/** 포털 하나로 옆 맵에 옮겨 가는 한 걸음 */
export interface FieldHop {
  toMapId: number;
  /** 지금 맵에서 걸어 갈 포털(맵 월드 좌표) */
  exit: Point;
  /** 옮겨 간 맵에서 나타날 포털 */
  arrival: Point;
  /** 옮겨 간 맵이 사냥터(또는 통로)면 그 맵. 마을로 돌아가면 null */
  field: RouteField | null;
}

/** 지금 맵에서 다음 사냥할 맵까지. 사이에 통로 맵이 있으면 포털을 이어 탄다 */
export interface FieldMove extends FieldHop {
  /** 처음 포털부터 차례로. 통로가 없으면 한 칸이고 그 칸이 이 이동과 같다 */
  hops: FieldHop[];
}

/** 마을 id 는 시대가 달라도 같아서 시대별 길 목록에서 찾는다 */
export function townFields(town: Pick<Town, 'id' | 'era'>): RouteField[] {
  return (townEra(town) === 'classic' ? CLASSIC_TOWN_ROUTES : TOWN_ROUTES)[town.id] ?? [];
}

/** 지금 맵에서 포털 하나로 닿는 맵들. 사냥터에서는 왔던 맵과 그 너머 맵으로 간다 */
function adjacentHops(townMapId: number, fields: RouteField[], currentMapId: number): FieldHop[] {
  const forward = fields
    .filter((field) => field.fromMapId === currentMapId)
    .map((field) => ({
      toMapId: field.mapId,
      exit: { x: field.entryX, y: field.entryY },
      arrival: { x: field.arrivalX, y: field.arrivalY },
      field,
    }));
  const here = fields.find((field) => field.mapId === currentMapId);
  if (!here) return forward;
  const back: FieldHop = {
    toMapId: here.fromMapId,
    exit: { x: here.arrivalX, y: here.arrivalY },
    arrival: { x: here.entryX, y: here.entryY },
    field: here.fromMapId === townMapId ? null : (fields.find((field) => field.mapId === here.fromMapId) ?? null),
  };
  return [back, ...forward];
}

/** 지금 맵(마을이면 마을 맵)에서 갈 수 있는 사냥터·마을. 통로 맵에서는 멈추지 않고 왔던 쪽이 아닌 포털로 이어 간다 */
export function fieldMoves(townMapId: number, fields: RouteField[], currentMapId: number): FieldMove[] {
  const extend = (hops: FieldHop[], cameFrom: number): FieldMove[] => {
    const last = hops[hops.length - 1];
    if (!last.field || !isPassage(last.field)) return [{ ...last, exit: hops[0].exit, hops }];
    return adjacentHops(townMapId, fields, last.toMapId)
      .filter((hop) => hop.toMapId !== cameFrom)
      .flatMap((hop) => extend([...hops, hop], last.toMapId));
  };
  return adjacentHops(townMapId, fields, currentMapId).flatMap((hop) => extend([hop], currentMapId));
}

/** 맵에 늘 띄워 두는 포털 하나. 좌표는 맵 월드 좌표, label 은 가는 맵 이름 */
export interface RoutePortal extends Point {
  label: string;
}

/** 마을 맵과 그 사냥터 맵마다 걸어서 드나드는 포털. 원작처럼 옮기지 않을 때도 보인다 */
export function routePortals(town: Pick<Town, 'mapId' | 'name'>, fields: RouteField[]): Map<number, RoutePortal[]> {
  const portals = new Map<number, RoutePortal[]>();
  [town.mapId, ...fields.map((field) => field.mapId)].forEach((mapId) => {
    const hops = adjacentHops(town.mapId, fields, mapId);
    if (hops.length > 0) portals.set(mapId, hops.map((hop) => ({ ...hop.exit, label: hop.field?.name ?? town.name })));
  });
  return portals;
}

export interface FieldCadence {
  /** 한 맵에서 이만큼 사냥하면 옮긴다 */
  hunts: number;
  /** 사냥이 적어도 한 맵에 이만큼 머물면 옮긴다. 몬스터를 꺼 둬도 돌아다니게 */
  stayMs: number;
  /** 도착하고 이만큼은 안 옮긴다 */
  minStayMs: number;
}

// 마을 자동 이동 기본 8분 안에 사냥터를 한두 번 오가게 맞췄다
export const FIELD_CADENCE: FieldCadence = { hunts: 2, stayMs: 3 * 60 * 1000, minStayMs: 60 * 1000 };

export function fieldMoveDue(
  stay: { hunts: number; sinceArrivalMs: number },
  cadence: FieldCadence = FIELD_CADENCE,
): boolean {
  if (stay.sinceArrivalMs < cadence.minStayMs) return false;
  return stay.hunts >= cadence.hunts || stay.sinceArrivalMs >= cadence.stayMs;
}

/** 이번 실행에 맵을 못 받아 온 사냥터·통로를 지나는 길은 빼고 고른다. 갈 곳이 없으면 null */
export function pickFieldMove(moves: FieldMove[], skipped: ReadonlySet<number>, random = Math.random): FieldMove | null {
  const open = moves.filter((move) => !move.hops.some((hop) => skipped.has(hop.toMapId)));
  return open.length > 0 ? open[Math.floor(random() * open.length)] : null;
}
