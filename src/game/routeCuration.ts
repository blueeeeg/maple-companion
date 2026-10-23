// scripts/curate-routes.ts 가 Node 로 바로 불러 쓰므로 확장자까지 적는다
import { type NavGraph, findPath, platformUnder } from '../maple/navigation.ts';
import type { MonsterSpec } from './towns';

/** 맵 포털 하나. WZ `portal/{n}` 의 pn·tm·tn·x·y 를 옮긴 것 */
export interface PortalData {
  name: string;
  /** 가는 맵. 999999999 면 다른 맵으로 안 간다 */
  toMap: number;
  /** 가는 맵에서 도착하는 포털 이름 */
  toName: string;
  x: number;
  y: number;
}

export const NO_MAP = 999999999;

/** 포털에 오갈 수 있는지. ok 가 아니면 못 쓰는 까닭 */
export type PortalAccess = 'ok' | 'no-platform' | 'no-path-in' | 'no-path-out';

/**
 * 캐릭터는 사냥하는 바닥(가장 긴 발판)에서 걷고, 뛰고, 떨어지고, 사다리·로프를 타서 포털까지 간다.
 * 포털로 들어갈 수 있고, 그 포털로 나온 뒤 바닥으로 돌아올 수도 있어야 쓴다
 */
export function portalAccess(graph: NavGraph, portal: Pick<PortalData, 'x' | 'y'>): PortalAccess {
  const at = platformUnder(graph, portal);
  if (!at) return 'no-platform';
  const main = graph.platforms[graph.main];
  const ground = { platform: graph.main, x: Math.round((main.minX + main.maxX) / 2) };
  if (!findPath(graph, ground, at)) return 'no-path-in';
  if (!findPath(graph, at, ground)) return 'no-path-out';
  return 'ok';
}

/** 맵 정보 mobs 의 한 칸. 같은 몹이 스폰 자리마다 하나씩 들어 있다 */
export interface MapMob {
  id: number;
}

export interface MobDetail {
  id: number;
  name: string;
  level: number;
  framebooks: Record<string, number>;
}

export interface FieldMonster extends MonsterSpec {
  level: number;
}

/** 스폰 자리가 많은 몹부터 고른다. 그림으로 움직일 동작(move·fly·stand)이 없거나 이름이 없는 몹은 뺀다 */
export function fieldMonsters(mobs: MapMob[], details: Map<number, MobDetail>, limit = 4): FieldMonster[] {
  const spawns = new Map<number, number>();
  mobs.forEach((mob) => spawns.set(mob.id, (spawns.get(mob.id) ?? 0) + 1));
  return [...spawns]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([id]) => details.get(id))
    .filter((detail): detail is MobDetail => {
      if (!detail || !detail.name) return false;
      const { framebooks } = detail;
      return Boolean(framebooks.move || framebooks.fly || framebooks.stand);
    })
    .slice(0, limit)
    .map(({ id, name, level }) => ({ id, name, level }));
}

/** 사냥터 레벨. 몹 레벨 가운데값 */
export function fieldLevel(monsters: Pick<FieldMonster, 'level'>[]): number {
  const levels = monsters.map((monster) => monster.level).sort((a, b) => a - b);
  if (levels.length === 0) return 0;
  const middle = Math.floor(levels.length / 2);
  return levels.length % 2 ? levels[middle] : Math.round((levels[middle - 1] + levels[middle]) / 2);
}

/** 이 마을에서 사냥할 만한 레벨 폭. 다음 마을이 열리고 조금 더 지날 때까지 */
export function levelBand(minLevel: number, nextTownLevel: number | null): [min: number, max: number] {
  const upper = nextTownLevel === null ? minLevel + 40 : Math.max(nextTownLevel, minLevel + 10) + 15;
  return [Math.max(1, minLevel - 10), upper];
}

/**
 * levelBand 로 하나도 못 고른 마을에 다시 쓰는 넓힌 폭. KMS 389 는 오르비스·엘나스·루디브리엄 둘레 사냥터가
 * 70~110 대라 마을이 열리는 레벨과 멀다. 보상은 rewardTown 기준이라 그림만 바뀌고 벌이는 그대로다
 */
export function relaxedLevelBand(minLevel: number): [min: number, max: number] {
  return [Math.max(1, minLevel - 10), minLevel + 60];
}

/** 걸어서 오갈 수 있는 맵 사이 연결. 양쪽 포털이 모두 바닥 위에 있다 */
export interface Link {
  from: number;
  to: number;
  /** from 맵에서 to 로 가는 포털 */
  exitX: number;
  exitY: number;
  /** to 맵에 도착하는 포털. 돌아갈 때는 이 포털로 나간다 */
  arrivalX: number;
  arrivalY: number;
}

export interface CandidateField {
  mapId: number;
  name: string;
  isTown: boolean;
  monsters: FieldMonster[];
}

export interface RouteField {
  mapId: number;
  name: string;
  /** 이 사냥터로 들어오는 앞 맵(마을이나 다른 사냥터) */
  fromMapId: number;
  /** 앞 맵에서 이 사냥터로 가는 포털(맵 월드 좌표) */
  entryX: number;
  entryY: number;
  /** 이 사냥터에 도착하는 포털. 앞 맵으로 돌아갈 때도 여기로 나간다 */
  arrivalX: number;
  arrivalY: number;
  level: number;
  monsters: MonsterSpec[];
}

export const MAX_ROUTE_FIELDS = 3;
/** 몹이 없는 통로 맵은 이만큼까지 이어서 지나간다. 통로마다 포털까지 한 번 더 걸어야 한다 */
export const MAX_PASSAGES = 2;

/** 몹이 없어 사냥하지 않고 걸어서 지나가기만 하는 맵 */
export const isPassage = (field: Pick<RouteField, 'monsters'>) => field.monsters.length === 0;

/**
 * 마을에서 너비 우선으로 걸어 갈 수 있는 사냥터를 고른다. 레벨 폭 밖인 맵, 다른 마을로는 넘어가지 않는다.
 * 몹이 없는 맵은 maxPassages 개까지 통로로 지나가서 그 너머 사냥터를 찾고, 그 너머 사냥터를 골랐을 때만 통로도 경로에 넣는다.
 * 고른 맵끼리 나무 모양으로 이어져서 어느 사냥터에서든 왔던 길로 마을에 돌아간다
 */
export function selectRoute(
  townMapId: number,
  links: Link[],
  fields: Map<number, CandidateField>,
  band: [number, number],
  limit = MAX_ROUTE_FIELDS,
  maxPassages = MAX_PASSAGES,
): RouteField[] {
  const picked: RouteField[] = [];
  const hunting = () => picked.filter((field) => !isPassage(field)).length;
  const seen = new Set([townMapId]);
  // 통로 너머 맵은 아직 경로에 안 넣은 통로들을 들고 간다
  let frontier: { mapId: number; passages: RouteField[] }[] = [{ mapId: townMapId, passages: [] }];
  while (frontier.length > 0 && hunting() < limit) {
    const next: typeof frontier = [];
    frontier.forEach((from) => {
      links
        .filter((link) => link.from === from.mapId && !seen.has(link.to))
        .sort((a, b) => a.to - b.to)
        .forEach((link) => {
          seen.add(link.to);
          const field = fields.get(link.to);
          if (!field || field.isTown || hunting() >= limit) return;
          const level = fieldLevel(field.monsters);
          const route: RouteField = {
            mapId: field.mapId,
            name: field.name,
            fromMapId: from.mapId,
            entryX: link.exitX,
            entryY: link.exitY,
            arrivalX: link.arrivalX,
            arrivalY: link.arrivalY,
            level,
            monsters: field.monsters.map(({ id, name }) => ({ id, name })),
          };
          if (isPassage(route)) {
            if (from.passages.length < maxPassages) next.push({ mapId: link.to, passages: [...from.passages, route] });
            return;
          }
          if (level < band[0] || level > band[1]) return;
          // 한 통로 너머 사냥터가 여럿이면 통로는 한 번만 넣는다
          picked.push(...from.passages.filter((passage) => !picked.includes(passage)), route);
          next.push({ mapId: link.to, passages: [] });
        });
    });
    frontier = next;
  }
  return picked;
}
