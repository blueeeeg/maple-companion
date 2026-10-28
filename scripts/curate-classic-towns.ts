// 클래식(빅뱅 이전, GMS 83) 마을 목록을 maplestory.io 로 확인하고 한글 이름을 채워 src/game/classicTowns.ts 로 쓴다. 개발용 도구다.
// node --experimental-strip-types scripts/curate-classic-towns.ts [캐시 폴더]
// 그 다음에 curate-routes.ts --era classic, curate-bgm.ts --era classic 을 돌린다
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { classicName, nameNotes } from './classicNames.ts';
import { apiBase, getJson, quote, reportFailures, useCache } from './mapleio.ts';

interface TownSpec {
  id: string;
  mapId: number;
  minLevel: number;
  sky: [number, number];
  monsterIds: number[];
}

// 마을이 열리는 레벨은 그 마을 둘레 몹 레벨에 맞췄다. 같은 마을은 지금 시대와 id 를 같이 써서 「머물기」 고른 것이 이어진다
const SPECS: TownSpec[] = [
  { id: 'henesys', mapId: 100000000, minLevel: 1, sky: [0x7ec8ff, 0xd9f2ff], monsterIds: [100100, 100101, 120100, 1210102] },
  { id: 'lith-harbor', mapId: 104000000, minLevel: 5, sky: [0x6fb8f0, 0xe3f4ff], monsterIds: [1210100, 1210101, 130101] },
  { id: 'ellinia', mapId: 101000000, minLevel: 10, sky: [0x3f7d6b, 0xb7e3c4], monsterIds: [210100, 1110100, 2220100] },
  { id: 'perion', mapId: 102000000, minLevel: 15, sky: [0xf3b27a, 0xffe2b8], monsterIds: [130100, 1110101, 2230102] },
  { id: 'kerning', mapId: 103000000, minLevel: 20, sky: [0x3b3f5c, 0x8a8fb3], monsterIds: [2230101, 2300100, 3230100] },
  { id: 'sleepywood', mapId: 105040300, minLevel: 25, sky: [0x2c3a2a, 0x6f8a5c], monsterIds: [2110200, 2230101, 2230100] },
  { id: 'ariant', mapId: 260000000, minLevel: 28, sky: [0xf6c27a, 0xfff0c8], monsterIds: [2100100, 2100102, 2100108] },
  { id: 'orbis', mapId: 200000000, minLevel: 30, sky: [0xbfe3ff, 0xffffff], monsterIds: [3230200, 4230106, 5120000] },
  { id: 'ludibrium', mapId: 220000000, minLevel: 35, sky: [0xffc4e1, 0xfff5d6], monsterIds: [3230302, 4230111, 4230113] },
  { id: 'korean-folk-town', mapId: 222000000, minLevel: 38, sky: [0x8fc3e8, 0xf3ead2], monsterIds: [4230300, 2130100] },
  { id: 'omega-sector', mapId: 221000000, minLevel: 40, sky: [0x2a3a66, 0x9fb2e0], monsterIds: [4230119, 4230120, 4230121] },
  { id: 'aquarium', mapId: 230000000, minLevel: 42, sky: [0x1e5aa8, 0x7cc4f0], monsterIds: [3210450, 5130103] },
  { id: 'mureung', mapId: 250000000, minLevel: 48, sky: [0xa8d8ea, 0xf6f1e0], monsterIds: [4230500, 4230501, 6130203] },
  { id: 'herb-town', mapId: 251000000, minLevel: 50, sky: [0x9fd4c0, 0xf2f6df], monsterIds: [4230505, 4230506] },
  { id: 'el-nath', mapId: 211000000, minLevel: 55, sky: [0x9fb8d6, 0xeaf2fb], monsterIds: [5100000, 5130105, 5100002] },
  { id: 'leafre', mapId: 240000000, minLevel: 75, sky: [0x6aa66e, 0xdcefc9], monsterIds: [8150300, 8150301, 8190003] },
  { id: 'temple-of-time', mapId: 270000100, minLevel: 85, sky: [0xd8e6ff, 0xfdf7ea], monsterIds: [8200000, 8200001, 8200002] },
];

interface MapJson {
  name: string;
  isTown: boolean;
}

interface MobJson {
  name: string;
  framebooks?: Record<string, number>;
}

const cacheDir = process.argv[2] ?? join(tmpdir(), 'maple-routes-cache');
const outFile = new URL('../src/game/classicTowns.ts', import.meta.url);
await useCache(cacheDir);

const hex = (color: number) => `0x${color.toString(16).padStart(6, '0')}`;
const problems: string[] = [];
const lines = [
  '// scripts/curate-classic-towns.ts 가 만든 파일이다. 손으로 고치지 말고 스크립트를 다시 돌린다',
  "import type { Town } from './towns';",
  '',
  '/** 클래식(GMS 83) 마을. 이름은 같은 ID 의 KMS 389 이름이고, 없거나 뜻이 바뀐 것은 손으로 쓴 이름이나 영문 이름이다 */',
  'export const CLASSIC_TOWNS: Town[] = [',
];
for (const spec of SPECS) {
  const map = await getJson<MapJson>(`${apiBase('classic')}/map/${spec.mapId}`);
  if (!map) {
    problems.push(`${spec.id}: 맵 ${spec.mapId} 이 v83 에 없음`);
    continue;
  }
  if (!map.isTown) problems.push(`${spec.id}: 맵 ${spec.mapId} 이 마을이 아님`);
  const name = await classicName('map', spec.mapId);
  const monsters: string[] = [];
  for (const id of spec.monsterIds) {
    const mob = await getJson<MobJson>(`${apiBase('classic')}/mob/${id}`);
    const books = mob?.framebooks ?? {};
    if (!mob || !(books.move || books.fly || books.stand)) {
      problems.push(`${spec.id}: 몹 ${id} 이 v83 에 없거나 움직일 그림이 없음`);
      continue;
    }
    monsters.push(`      { id: ${id}, name: ${quote((await classicName('mob', id)).name)} },`);
  }
  console.log(`${name.name}(${spec.mapId}) Lv.${spec.minLevel} 몹 ${monsters.length}`);
  lines.push(
    '  {',
    `    id: ${quote(spec.id)},`,
    `    name: ${quote(name.name)},`,
    `    mapId: ${spec.mapId},`,
    `    minLevel: ${spec.minLevel},`,
    `    sky: [${hex(spec.sky[0])}, ${hex(spec.sky[1])}],`,
    "    era: 'classic',",
    '    monsters: [',
    ...monsters,
    '    ],',
    '  },',
  );
}
lines.push('];', '');

if (nameNotes.length > 0) {
  console.log('\n이름 확인');
  nameNotes.forEach((note) => console.log(`  ${note}`));
}
if (problems.length > 0) {
  console.log('\n문제');
  problems.forEach((problem) => console.log(`  ${problem}`));
}
reportFailures();
await writeFile(outFile, lines.join('\n'));
console.log(`\n${outFile.pathname} 에 썼다`);
