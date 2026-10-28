// 앱이 캐릭터에 입히는 아이템(몸·얼굴·헤어·직업 장비·장비 컬렉션) 중 GMS 83 에도 있는 것을 골라 src/maple/classicItems.ts 로 쓴다. 개발용 도구다.
// node --experimental-strip-types scripts/curate-classic-items.ts [캐시 폴더]
// 클래식 캐릭터는 여기 든 아이템만 v83 그림으로 그리고 나머지는 지금 판 그림으로 그린다
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiBase, getJson, reportFailures, useCache, wzBase } from './mapleio.ts';

const cacheDir = process.argv[2] ?? join(tmpdir(), 'maple-routes-cache');
const outFile = new URL('../src/maple/classicItems.ts', import.meta.url);
await useCache(cacheDir);

// 장비 목록 모듈은 확장자 없는 import 가 있어 node 로 바로 못 불러온다. 장비 ID(1000000번대)만 글자로 읽는다
const sources = await Promise.all(
  ['appearance.ts', 'jobs.ts', 'jobs.classic.ts', 'equipment.ts', 'equipment.classic.ts'].map((file) =>
    readFile(new URL(`../src/game/${file}`, import.meta.url), 'utf8'),
  ),
);
const equipIds = new Set(sources.flatMap((source) => [...source.matchAll(/\b(1\d{6})\b/g)].map((match) => Number(match[1]))));
const appearance = sources[0];
const listed = (name: string) => [...(new RegExp(`${name}[^=]*=\\s*([\\s\\S]*?);`).exec(appearance)?.[1] ?? '').matchAll(/\b(\d{5})\b/g)];
const faceHair = [...listed('FACES'), ...listed('HAIRS')].map((match) => Number(match[1]));
const skins = [...(/SKINS = \[([^\]]*)\]/.exec(appearance)?.[1] ?? '').matchAll(/\d+/g)].flatMap((match) => [
  2000 + Number(match[0]),
  12000 + Number(match[0]),
]);

const present: number[] = [];
const missing: number[] = [];
for (const id of [...skins, ...faceHair, ...equipIds].sort((a, b) => a - b)) {
  // 몸·머리는 String 에 이름이 없어서 WZ 노드로 본다
  const found =
    id < 20000
      ? await getJson(`${wzBase('classic')}/Character/${String(id).padStart(8, '0')}.img`)
      : await getJson(`${apiBase('classic')}/item/${id}/name`);
  (found ? present : missing).push(id);
}

const lines = [
  '// scripts/curate-classic-items.ts 가 만든 파일이다. 손으로 고치지 말고 스크립트를 다시 돌린다',
  '',
  '/** 앱이 입히는 아이템 중 GMS 83 에도 있는 것. 클래식 캐릭터는 이 아이템만 v83 그림으로 그린다 */',
  'export const CLASSIC_ITEM_IDS: ReadonlySet<number> = new Set([',
  ...Array.from({ length: Math.ceil(present.length / 10) }, (_, row) => `  ${present.slice(row * 10, row * 10 + 10).join(', ')},`),
  ']);',
  '',
];
reportFailures();
await writeFile(outFile, lines.join('\n'));
console.log(`v83 에 있음 ${present.length} · 없음 ${missing.length}`);
console.log(`${outFile.pathname} 에 썼다`);
