// 원작 BGM 목록(Sound.wz 의 Bgm 폴더)과 앱이 아는 맵의 BGM 을 maplestory.io 에서 읽어 src/audio/bgmCatalog.ts 로 쓴다. 개발용 도구다.
// node --experimental-strip-types scripts/curate-bgm.ts [캐시 폴더]
// 곡 이름과 경로만 받는다. 소리는 받지 않는다
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TOWN_ROUTES } from '../src/game/routeData.ts';
import { TOWNS } from '../src/game/towns.ts';

const WZ = 'https://maplestory.io/api/wz/KMS/389';
const TIMEOUT_MS = 30_000;

const cacheDir = process.argv[2] ?? join(tmpdir(), 'maple-bgm-cache');
const outFile = new URL('../src/audio/bgmCatalog.ts', import.meta.url);
const failures: string[] = [];

async function getJson<T>(url: string): Promise<T | null> {
  const file = join(cacheDir, url.replace(/^https:\/\/maplestory\.io\/api\//, '').replace(/[^\w.-]+/g, '_') + '.json');
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T | null;
  } catch {
    // 캐시에 없으면 받는다
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const body = response.ok ? await response.json() : response.status === 404 ? null : undefined;
      if (body === undefined) throw new Error(`${response.status}`);
      await writeFile(file, JSON.stringify(body));
      return body as T | null;
    } catch (error) {
      console.warn(`  재시도 ${attempt + 1} ${url}: ${(error as Error).message}`);
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  failures.push(url);
  return null;
}

const wzMapPath = (mapId: number) => {
  const padded = String(mapId).padStart(9, '0');
  return `Map/Map/Map${padded[0]}/${padded}.img`;
};

/** Bgm00 … Bgm60 을 번호 순으로, 이름 붙은 폴더(BgmEvent·BgmUI 등)는 그 뒤에 이름 순으로 */
function folderOrder(a: string, b: string): number {
  const [na, nb] = [/^Bgm(\d+)$/.exec(a), /^Bgm(\d+)$/.exec(b)];
  if (na && nb) return Number(na[1]) - Number(nb[1]);
  if (na || nb) return na ? -1 : 1;
  return a.localeCompare(b, 'en');
}

const quote = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

await mkdir(cacheDir, { recursive: true });

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
const bossSource = await readFile(new URL('../src/game/bosses.ts', import.meta.url), 'utf8');
const bossMaps = [...bossSource.matchAll(/mapId: (\d+)/g)].map((match) => Number(match[1]));
const mapIds = [
  ...new Set([
    ...TOWNS.map((town) => town.mapId),
    ...Object.values(TOWN_ROUTES).flatMap((fields) => fields.map((field) => field.mapId)),
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

const lines = [
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
if (failures.length > 0) {
  console.log('\n못 받은 주소 (다시 돌리면 이것만 다시 받는다)');
  failures.forEach((url) => console.log(`  ${url}`));
}
await writeFile(outFile, lines.join('\n'));
console.log(`폴더 ${catalog.length}개 · 곡 ${catalog.reduce((sum, [, tracks]) => sum + tracks.length, 0)}개 · 맵 ${mapBgm.length}/${mapIds.length}개`);
console.log(`${outFile.pathname} 에 썼다`);
