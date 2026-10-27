// 마을에서 걸어서 갈 수 있는 사냥터를 maplestory.io 에서 찾아 src/game/routeData.ts 로 쓴다. 개발용 도구다.
// node --experimental-strip-types scripts/curate-routes.ts [캐시 폴더] [--era classic]
// 클래식(GMS 83)은 src/game/routeData.classic.ts 로 쓰고 이름은 scripts/classicNames.ts 로 한글을 채운다
// 서버가 느려서 요청은 하나씩 보내고 받은 응답은 캐시 폴더에 남긴다. 리소스(그림·소리)는 받지 않는다
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Foothold } from '../src/maple/api.ts';
import {
  type CandidateField,
  type Link,
  type MapMob,
  type MobDetail,
  NO_MAP,
  type PortalData,
  type RouteField,
  fieldLevel,
  fieldMonsters,
  isPassage,
  MAX_PASSAGES,
  MAX_ROUTE_FIELDS,
  levelBand,
  portalAccess,
  relaxedLevelBand,
  selectRoute,
} from '../src/game/routeCuration.ts';
import { townsFor } from '../src/game/towns.ts';
import { type LadderRope, type NavGraph, buildNavGraph } from '../src/maple/navigation.ts';
import { classicName, nameNotes } from './classicNames.ts';
import { apiBase, eraArg, getJson, positionalArgs, quote, reportFailures, useCache, wzBase, wzMapPath } from './mapleio.ts';

const era = eraArg(process.argv);
const API = apiBase(era);
const WZ = wzBase(era);
const TOWNS = townsFor(era);
const MAX_DEPTH = 3;
/** 데이터로는 사냥터처럼 보이지만 고르지 않는 맵과 그 까닭 */
const EXCLUDED_MAPS: Record<typeof era, Record<number, string>> = {
  current: {},
  classic: {
    230000003: '아쿠아리움 동물원. 전시용 Zoo 몹만 있다',
    100000002: '헤네시스 마을 안 집(뒤에 장로 스탄의 집). 사냥터가 아니다',
    // 아래 맵은 바닥 레이어 그림으로 지면 보정을 정확히 맞추지 못한다(감사에서 두 번 다 어림값). 세 개의 문은 어림값도 틀려 캐릭터가 뜬다
    106000001: '지면 보정을 정확히 못 맞춤',
    107000001: '지면 보정을 정확히 못 맞춤',
    107000200: '지면 보정을 정확히 못 맞춤',
    270000000: '지면 보정을 정확히 못 맞추고 어림값도 틀림',
  },
};

const cacheDir = positionalArgs(process.argv)[2] ?? join(tmpdir(), 'maple-routes-cache');
const outFile = new URL(era === 'classic' ? '../src/game/routeData.classic.ts' : '../src/game/routeData.ts', import.meta.url);

interface MapJson {
  name: string;
  streetName?: string;
  isTown: boolean;
  footholds: Record<string, Foothold> | null;
  ladderRopes: LadderRope[] | null;
  mobs: MapMob[] | null;
}

interface MapData {
  id: number;
  name: string;
  isTown: boolean;
  footholds: Foothold[];
  ladders: LadderRope[];
  mobs: MapMob[];
}

async function wzValue<T>(path: string): Promise<T | null> {
  return (await getJson<{ value: T }>(`${WZ}/${path}`))?.value ?? null;
}

/** 맵 정보 API 는 스크립트가 붙은 포털을 null 로 내려서, 마을 밖으로 나가는 포털이 빠진다. WZ 노드에서 직접 읽는다 */
const portalCache = new Map<number, PortalData[]>();
async function loadPortals(mapId: number): Promise<PortalData[]> {
  if (portalCache.has(mapId)) return portalCache.get(mapId)!;
  const base = `${wzMapPath(mapId)}/portal`;
  const node = await getJson<{ children: string[] }>(`${WZ}/${base}`);
  const portals: PortalData[] = [];
  for (const index of node?.children ?? []) {
    const toMap = await wzValue<number>(`${base}/${index}/tm`);
    if (toMap === null || toMap === NO_MAP || toMap === mapId) continue;
    const [name, toName, x, y] = [
      await wzValue<string>(`${base}/${index}/pn`),
      await wzValue<string>(`${base}/${index}/tn`),
      await wzValue<number>(`${base}/${index}/x`),
      await wzValue<number>(`${base}/${index}/y`),
    ];
    if (name === null || x === null || y === null) continue;
    portals.push({ name, toMap, toName: toName ?? '', x, y });
  }
  portalCache.set(mapId, portals);
  return portals;
}

const maps = new Map<number, MapData | null>();
async function loadMap(mapId: number): Promise<MapData | null> {
  if (maps.has(mapId)) return maps.get(mapId)!;
  const info = await getJson<MapJson>(`${API}/map/${mapId}`);
  const data = info
    ? {
        id: mapId,
        name: info.name,
        isTown: info.isTown,
        footholds: Object.values(info.footholds ?? {}),
        ladders: info.ladderRopes ?? [],
        mobs: (info.mobs ?? []).filter((mob) => mob && typeof mob.id === 'number'),
      }
    : null;
  maps.set(mapId, data);
  return data;
}

const graphs = new Map<number, NavGraph>();
function navGraph(map: MapData): NavGraph {
  if (!graphs.has(map.id)) graphs.set(map.id, buildNavGraph(map.footholds, map.ladders));
  return graphs.get(map.id)!;
}

const ACCESS_REASON = {
  'no-platform': '포털 아래 발판이 없음',
  'no-path-in': '바닥에서 포털까지 가는 길이 없음',
  'no-path-out': '포털에서 바닥으로 내려오는 길이 없음',
} as const;

const mobs = new Map<number, MobDetail>();
async function loadMobs(ids: number[]): Promise<Map<number, MobDetail>> {
  for (const id of new Set(ids)) {
    if (mobs.has(id)) continue;
    const info = await getJson<{ name: string; meta?: { level?: number }; framebooks?: Record<string, number> }>(
      `${API}/mob/${id}`,
    );
    if (!info) continue;
    const name = era === 'classic' && info.name ? (await classicName('mob', id)).name : info.name;
    mobs.set(id, { id, name, level: info.meta?.level ?? 0, framebooks: info.framebooks ?? {} });
  }
  return mobs;
}

interface Exclusion {
  townId: string;
  from: string;
  to: string;
  reason: string;
}

async function curateTown(
  townIndex: number,
  band: [number, number],
  maxPassages: number,
  exclusions: Exclusion[],
): Promise<RouteField[]> {
  const town = TOWNS[townIndex];
  const links: Link[] = [];
  const fields = new Map<number, CandidateField>();
  const visited = new Set<number>([town.mapId]);
  let frontier = [town.mapId];
  const label = (mapId: number) => `${maps.get(mapId)?.name ?? '?'}(${mapId})`;
  const exclude = (from: number, to: number, reason: string) =>
    exclusions.push({ townId: town.id, from: label(from), to: label(to), reason });

  let suitable = 0;
  // 사냥터는 가까운 층부터 고르니, 이번 층까지 셋이 모이면 더 깊이 볼 필요가 없다
  // 통로는 사냥터 깊이에 세지 않는다
  for (let depth = 0; depth < MAX_DEPTH + maxPassages && frontier.length > 0 && suitable < MAX_ROUTE_FIELDS; depth += 1) {
    const nextFrontier: number[] = [];
    for (const fromId of frontier) {
      const from = (await loadMap(fromId))!;
      // 건물 안·다른 마을로 가는 포털이 많아서, 맵 정보로 마을인지 먼저 보고 포털은 필요한 맵만 읽는다
      for (const portal of await loadPortals(fromId)) {
        if (visited.has(portal.toMap)) continue;
        const target = await loadMap(portal.toMap);
        if (!target) continue;
        const excluded = EXCLUDED_MAPS[era][target.id];
        if (excluded) {
          visited.add(target.id);
          exclude(fromId, portal.toMap, excluded);
          continue;
        }
        // 무릉 사원처럼 앱 마을이 아닌 마을 맵은 통로로 지나갈 수 있다. 앱 마을로는 넘어가지 않는다
        const isAppTown = TOWNS.some((each) => each.mapId === target.id);
        if (isAppTown || (target.isTown && maxPassages === 0)) continue;
        const exitAccess = portalAccess(navGraph(from), portal);
        if (exitAccess !== 'ok') {
          exclude(fromId, portal.toMap, `나가는 포털 ${portal.name}(${portal.x}, ${portal.y}): ${ACCESS_REASON[exitAccess]}`);
          continue;
        }
        const targetPortals = await loadPortals(target.id);
        const back = targetPortals.find((each) => each.name === portal.toName && each.toMap === fromId)
          ?? targetPortals.find((each) => each.toMap === fromId);
        if (!back) {
          exclude(fromId, portal.toMap, '돌아오는 포털이 없음');
          continue;
        }
        const arrivalAccess = portalAccess(navGraph(target), back);
        if (arrivalAccess !== 'ok') {
          exclude(fromId, portal.toMap, `도착 포털 ${back.name}(${back.x}, ${back.y}): ${ACCESS_REASON[arrivalAccess]}`);
          continue;
        }
        visited.add(portal.toMap);
        links.push({ from: fromId, to: portal.toMap, exitX: portal.x, exitY: portal.y, arrivalX: back.x, arrivalY: back.y });
        const details = await loadMobs(target.mobs.map((mob) => mob.id));
        const monsters = fieldMonsters(target.mobs, details);
        const name = era === 'classic' ? (await classicName('map', target.id)).name : target.name;
        fields.set(target.id, { mapId: target.id, name, isTown: isAppTown, monsters });
        if (monsters.length === 0) {
          exclude(fromId, portal.toMap, maxPassages > 0 ? '몬스터 없음 (통로로만 지나감)' : '몬스터 없음');
          // 너머에 고를 사냥터가 없으면 selectRoute 가 통로도 넣지 않는다
          if (maxPassages > 0) nextFrontier.push(portal.toMap);
          continue;
        }
        const level = fieldLevel(monsters);
        if (level < band[0] || level > band[1]) {
          exclude(fromId, portal.toMap, `몹 레벨 ${level} 이 ${band[0]}~${band[1]} 밖`);
          continue;
        }
        suitable += 1;
        nextFrontier.push(portal.toMap);
      }
    }
    frontier = nextFrontier;
  }
  return selectRoute(town.mapId, links, fields, band, MAX_ROUTE_FIELDS, maxPassages);
}

function render(routes: Record<string, RouteField[]>): string {
  const lines = [
    '// scripts/curate-routes.ts 가 만든 파일이다. 손으로 고치지 말고 스크립트를 다시 돌린다',
    "import type { RouteField } from './routeCuration';",
    '',
    era === 'classic'
      ? '/** 클래식 마을 id → 걸어서 가는 사냥터. GMS 83 맵의 실제 포털 연결이고 좌표는 맵 월드 좌표다. 이름은 KMS 389 로 채웠다 */'
      : '/** 마을 id → 걸어서 가는 사냥터. KMS 389 맵의 실제 포털 연결이고 좌표는 맵 월드 좌표다 */',
    `export const ${era === 'classic' ? 'CLASSIC_TOWN_ROUTES' : 'TOWN_ROUTES'}: Record<string, RouteField[]> = {`,
  ];
  Object.entries(routes).forEach(([townId, fields]) => {
    if (fields.length === 0) {
      lines.push(`  ${quote(townId)}: [],`);
      return;
    }
    lines.push(`  ${quote(townId)}: [`);
    fields.forEach((field) => {
      lines.push('    {');
      lines.push(`      mapId: ${field.mapId},`);
      lines.push(`      name: ${quote(field.name)},`);
      lines.push(`      fromMapId: ${field.fromMapId},`);
      lines.push(`      entryX: ${field.entryX},`);
      lines.push(`      entryY: ${field.entryY},`);
      lines.push(`      arrivalX: ${field.arrivalX},`);
      lines.push(`      arrivalY: ${field.arrivalY},`);
      lines.push(`      level: ${field.level},`);
      lines.push('      monsters: [');
      field.monsters.forEach((monster) => lines.push(`        { id: ${monster.id}, name: ${quote(monster.name)} },`));
      lines.push('      ],');
      lines.push('    },');
    });
    lines.push('  ],');
  });
  lines.push('};', '');
  return lines.join('\n');
}

await useCache(cacheDir);
const exclusions: Exclusion[] = [];
const routes: Record<string, RouteField[]> = {};
for (let index = 0; index < TOWNS.length; index += 1) {
  const town = TOWNS[index];
  console.log(`${town.name}(${town.mapId}) Lv.${town.minLevel}`);
  const band = levelBand(town.minLevel, TOWNS[index + 1]?.minLevel ?? null);
  // 통로를 지나면 포털을 한 번 더 걸어야 하고, 넓힌 폭은 마을 레벨과 먼 몹이 나와서 앞 규칙으로 하나도 못 고를 때만 쓴다
  const attempts: [band: [number, number], maxPassages: number][] = [
    [band, 0],
    [band, MAX_PASSAGES],
    [relaxedLevelBand(town.minLevel), MAX_PASSAGES],
  ];
  let townExclusions: Exclusion[] = [];
  for (const [attemptBand, maxPassages] of attempts) {
    townExclusions = [];
    routes[town.id] = await curateTown(index, attemptBand, maxPassages, townExclusions);
    if (routes[town.id].length > 0) break;
    console.log(`  레벨 ${attemptBand[0]}~${attemptBand[1]} · 통로 ${maxPassages}개로는 사냥터가 없다`);
  }
  exclusions.push(...townExclusions);
  routes[town.id].forEach((field) =>
    console.log(
      `  → ${field.name}(${field.mapId}) ← ${field.fromMapId} ${isPassage(field) ? '통로' : `Lv.${field.level} ${field.monsters.map((monster) => monster.name).join(', ')}`}`,
    ),
  );
}
console.log('\n제외');
exclusions.forEach((each) => console.log(`  [${each.townId}] ${each.from} → ${each.to}: ${each.reason}`));
if (nameNotes.length > 0) {
  console.log('\n이름 확인');
  nameNotes.forEach((note) => console.log(`  ${note}`));
}
reportFailures();
await writeFile(outFile, render(routes));
console.log(`\n${outFile.pathname} 에 썼다`);
