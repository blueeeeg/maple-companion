import type { RouteField } from './routeCuration';
import { TOWN_ROUTES } from './routeData';
import type { Town } from './towns';

/** 지금 맵에서 포털로 옮겨 갈 한 걸음 */
export interface FieldMove {
  toMapId: number;
  /** 지금 맵에서 걸어 갈 포털 x(맵 월드 좌표) */
  exitX: number;
  /** 옮겨 간 맵에서 나타날 포털 x */
  arrivalX: number;
  /** 옮겨 간 맵이 사냥터면 그 사냥터. 마을로 돌아가면 null */
  field: RouteField | null;
}

export function townFields(town: Pick<Town, 'id'>): RouteField[] {
  return TOWN_ROUTES[town.id] ?? [];
}

/** 지금 맵(마을이면 마을 맵)에서 포털 하나로 갈 수 있는 맵들. 사냥터에서는 왔던 맵과 그 너머 사냥터로 간다 */
export function fieldMoves(townMapId: number, fields: RouteField[], currentMapId: number): FieldMove[] {
  const forward = fields
    .filter((field) => field.fromMapId === currentMapId)
    .map((field) => ({ toMapId: field.mapId, exitX: field.entryX, arrivalX: field.arrivalX, field }));
  const here = fields.find((field) => field.mapId === currentMapId);
  if (!here) return forward;
  const back: FieldMove = {
    toMapId: here.fromMapId,
    exitX: here.arrivalX,
    arrivalX: here.entryX,
    field: here.fromMapId === townMapId ? null : (fields.find((field) => field.mapId === here.fromMapId) ?? null),
  };
  return [back, ...forward];
}

/** 맵에 늘 띄워 두는 포털 하나. x 는 맵 월드 좌표, label 은 가는 맵 이름 */
export interface RoutePortal {
  x: number;
  label: string;
}

/** 마을 맵과 그 사냥터 맵마다 걸어서 드나드는 포털. 원작처럼 옮기지 않을 때도 보인다 */
export function routePortals(town: Pick<Town, 'mapId' | 'name'>, fields: RouteField[]): Map<number, RoutePortal[]> {
  const portals = new Map<number, RoutePortal[]>();
  [town.mapId, ...fields.map((field) => field.mapId)].forEach((mapId) => {
    const moves = fieldMoves(town.mapId, fields, mapId);
    if (moves.length > 0) portals.set(mapId, moves.map((move) => ({ x: move.exitX, label: move.field?.name ?? town.name })));
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

/** 이번 실행에 맵을 못 받아 온 사냥터는 빼고 고른다. 갈 곳이 없으면 null */
export function pickFieldMove(moves: FieldMove[], skipped: ReadonlySet<number>, random = Math.random): FieldMove | null {
  const open = moves.filter((move) => !skipped.has(move.toMapId));
  return open.length > 0 ? open[Math.floor(random() * open.length)] : null;
}
