// scripts/curate-routes.ts 가 Node 로 바로 불러 쓰므로 확장자까지 적는다
import type { Foothold } from '../maple/api';
import { type GroundPath, groundPaths, groundY, mainGround } from '../maple/ground.ts';
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

/** 포털은 발판보다 조금 위에 놓인다. 이보다 높이 떠 있으면 점프해야 닿는다고 본다 */
export const PORTAL_MAX_HEIGHT = 60;
/** 포털 좌표가 발판보다 몇 px 아래에 찍힌 맵도 있다 */
const PORTAL_SINK = 10;
/** 바닥보다 이만큼 이하로 높은 발판은 턱으로 보고 걸어서 넘는다 */
const STEP_HEIGHT = 15;

/**
 * 캐릭터는 mainGround 위만 걷는다. 포털이 바닥 바로 위에 있고, 포털과 바닥 사이에 다른 발판(윗층)이 끼어 있지 않아야 걸어서 닿는다
 */
export function portalOnGround(footholds: Foothold[], portal: Pick<PortalData, 'x' | 'y'>): boolean {
  const main = mainGround(footholds);
  if (!main || portal.x < main.minX || portal.x > main.maxX) return false;
  const mainY = groundY(main, portal.x);
  const height = mainY - portal.y;
  if (height < -PORTAL_SINK || height > PORTAL_MAX_HEIGHT) return false;
  return groundPaths(footholds).every((path) => {
    if (sameChain(path, main) || portal.x < path.minX || portal.x > path.maxX) return true;
    const y = groundY(path, portal.x);
    return y >= mainY - STEP_HEIGHT || y < portal.y - PORTAL_SINK;
  });
}

// mainGround 는 groundPaths 를 새로 만들어서 같은 묶음이어도 다른 객체다
const sameChain = (a: GroundPath, b: GroundPath) =>
  a.minX === b.minX && a.maxX === b.maxX && a.layer === b.layer && a.points.length === b.points.length;

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

/** 걸어서 오갈 수 있는 맵 사이 연결. 양쪽 포털이 모두 바닥 위에 있다 */
export interface Link {
  from: number;
  to: number;
  /** from 맵에서 to 로 가는 포털 x */
  exitX: number;
  /** to 맵에 도착하는 포털 x. 돌아갈 때는 이 포털로 나간다 */
  arrivalX: number;
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
  /** 앞 맵에서 이 사냥터로 가는 포털 x */
  entryX: number;
  /** 이 사냥터에 도착하는 포털 x. 앞 맵으로 돌아갈 때도 여기로 나간다 */
  arrivalX: number;
  level: number;
  monsters: MonsterSpec[];
}

export const MAX_ROUTE_FIELDS = 3;

/**
 * 마을에서 너비 우선으로 걸어 갈 수 있는 사냥터를 고른다. 레벨 폭 밖이거나 몹이 없는 맵, 다른 마을로는 넘어가지 않는다.
 * 고른 사냥터끼리 나무 모양으로 이어져서 어느 사냥터에서든 왔던 길로 마을에 돌아간다
 */
export function selectRoute(
  townMapId: number,
  links: Link[],
  fields: Map<number, CandidateField>,
  band: [number, number],
  limit = MAX_ROUTE_FIELDS,
): RouteField[] {
  const picked: RouteField[] = [];
  const seen = new Set([townMapId]);
  let frontier = [townMapId];
  while (frontier.length > 0 && picked.length < limit) {
    const next: number[] = [];
    frontier.forEach((from) => {
      links
        .filter((link) => link.from === from && !seen.has(link.to))
        .sort((a, b) => a.to - b.to)
        .forEach((link) => {
          seen.add(link.to);
          const field = fields.get(link.to);
          if (!field || field.isTown || field.monsters.length === 0 || picked.length >= limit) return;
          const level = fieldLevel(field.monsters);
          if (level < band[0] || level > band[1]) return;
          picked.push({
            mapId: field.mapId,
            name: field.name,
            fromMapId: from,
            entryX: link.exitX,
            arrivalX: link.arrivalX,
            level,
            monsters: field.monsters.map(({ id, name }) => ({ id, name })),
          });
          next.push(link.to);
        });
    });
    frontier = next;
  }
  return picked;
}
