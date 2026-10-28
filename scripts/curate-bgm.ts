// 원작 BGM 목록(Sound.wz 의 Bgm 폴더)과 앱이 아는 맵의 BGM 을 maplestory.io 에서 읽어 src/audio/bgmCatalog.ts 로 쓴다. 개발용 도구다.
// node --experimental-strip-types scripts/curate-bgm.ts [캐시 폴더] [--era classic]
// 클래식(GMS 83)은 클래식 마을·사냥터 맵의 BGM 만 src/audio/bgmCatalog.classic.ts 로 쓴다. 곡 목록(BGM 고르기)은 지금 판 것을 쓴다
// 곡 이름과 경로만 받는다. 소리는 받지 않는다
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TOWN_ROUTES } from '../src/game/routeData.ts';
import { CLASSIC_TOWN_ROUTES } from '../src/game/routeData.classic.ts';
import { townsFor } from '../src/game/towns.ts';
import { eraArg, getJson, positionalArgs, quote, reportFailures, useCache, wzBase, wzMapPath } from './mapleio.ts';

const era = eraArg(process.argv);
const WZ = wzBase(era);

const cacheDir = positionalArgs(process.argv)[2] ?? join(tmpdir(), 'maple-bgm-cache');
const outFile = new URL(era === 'classic' ? '../src/audio/bgmCatalog.classic.ts' : '../src/audio/bgmCatalog.ts', import.meta.url);

/** Bgm00 … Bgm60 을 번호 순으로, 이름 붙은 폴더(BgmEvent·BgmUI 등)는 그 뒤에 이름 순으로 */
function folderOrder(a: string, b: string): number {
  const [na, nb] = [/^Bgm(\d+)$/.exec(a), /^Bgm(\d+)$/.exec(b)];
  if (na && nb) return Number(na[1]) - Number(nb[1]);
  if (na || nb) return na ? -1 : 1;
  return a.localeCompare(b, 'en');
}

await useCache(cacheDir);

const sound = await getJson<{ children: string[] }>(`${WZ}/Sound`);
const folders = (sound?.children ?? [])
  .filter((name) => /^Bgm\w*\.img$/.test(name))
  .map((name) => name.slice(0, -'.img'.length))
  .sort(folderOrder);
const catalog: [string, string[]][] = [];
for (const folder of folders) {
  const node = await getJson<{ children: string[] }>(`${WZ}/Sound/${folder}.img`);
  if (node?.children.length) catalog.push([folder, node.children]);
}
const byLowerPath = new Map(catalog.flatMap(([folder, tracks]) => tracks.map((track) => [`${folder}/${track}`.toLowerCase(), `${folder}/${track}`])));

// 보스 목록 모듈은 확장자 없는 import 가 있어 node 로 바로 못 불러온다. 맵 ID 만 글자로 읽는다
// 보스는 클래식 캐릭터도 지금 판 맵에서 싸워서 클래식 목록에는 넣지 않는다
const bossSource = await readFile(new URL('../src/game/bosses.ts', import.meta.url), 'utf8');
const bossMaps = era === 'classic' ? [] : [...bossSource.matchAll(/mapId: (\d+)/g)].map((match) => Number(match[1]));
const routes = era === 'classic' ? CLASSIC_TOWN_ROUTES : TOWN_ROUTES;
const mapIds = [
  ...new Set([
    ...townsFor(era).map((town) => town.mapId),
    ...Object.values(routes).flatMap((fields) => fields.map((field) => field.mapId)),
    ...bossMaps,
  ]),
].sort((a, b) => a - b);

const mapBgm: [number, string][] = [];
for (const mapId of mapIds) {
  const value = (await getJson<{ value: string }>(`${WZ}/${wzMapPath(mapId)}/info/bgm`))?.value;
  if (!value) continue;
  // WZ 의 맵 BGM 값은 대소문자가 폴더 목록과 다를 때가 있다
  const path = byLowerPath.get(value.toLowerCase());
  if (path) mapBgm.push([mapId, path]);
  else console.warn(`  목록에 없는 곡 ${mapId} → ${value}`);
}

const lines =
  era === 'classic'
    ? [
        '// scripts/curate-bgm.ts --era classic 이 만든 파일이다. 손으로 고치지 말고 스크립트를 다시 돌린다',
        '',
        '/** 클래식 마을·사냥터 맵의 BGM(GMS 83 Sound.wz 경로). 여기 없는 맵은 bgm.ts 가 v83 WZ 에서 읽는다 */',
        'export const CLASSIC_MAP_BGM: Record<number, string> = {',
        ...mapBgm.map(([mapId, path]) => `  ${mapId}: ${quote(path)},`),
        '};',
        '',
      ]
    : [
        '// scripts/curate-bgm.ts 가 만든 파일이다. 손으로 고치지 말고 스크립트를 다시 돌린다',
        '',
        '/** KMS 389 Sound.wz 의 BGM 폴더와 그 안의 곡 이름. 곡 경로는 `Bgm00/FloralLife` 처럼 폴더/이름이다 */',
        'export const BGM_FOLDERS: [folder: string, tracks: string[]][] = [',
        ...catalog.map(([folder, tracks]) => `  [${quote(folder)}, [${tracks.map(quote).join(', ')}]],`),
        '];',
        '',
        '/** 앱이 아는 맵(마을·사냥터·보스 맵)의 BGM. 여기 없는 맵은 bgm.ts 가 WZ 에서 읽어 기기에 남긴다 */',
        'export const MAP_BGM: Record<number, string> = {',
        ...mapBgm.map(([mapId, path]) => `  ${mapId}: ${quote(path)},`),
        '};',
        '',
      ];
reportFailures();
await writeFile(outFile, lines.join('\n'));
console.log(`폴더 ${catalog.length}개 · 곡 ${catalog.reduce((sum, [, tracks]) => sum + tracks.length, 0)}개 · 맵 ${mapBgm.length}/${mapIds.length}개`);
console.log(`${outFile.pathname} 에 썼다`);
