// 캐시샵 부위마다 GMS 83 캐시 아이템 목록과 KMS 389 목록을 견줘 둘 다에 있는 아이템을 src/maple/classicCashItems.ts 로 쓴다. 개발용 도구다.
// node --experimental-strip-types scripts/curate-classic-cash.ts [캐시 폴더]
// 클래식 캐릭터의 캐시샵은 이 아이템만 팔고, 이 아이템은 v83 그림으로 그린다. 이름·성별은 지금처럼 KMS 389 목록에서 읽는다
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CASH_CATEGORIES } from '../src/game/cashShop.ts';
import { apiBase, getJson, reportFailures, useCache } from './mapleio.ts';

const cacheDir = process.argv[2] ?? join(tmpdir(), 'maple-routes-cache');
const outFile = new URL('../src/maple/classicCashItems.ts', import.meta.url);
await useCache(cacheDir);

const listUrl = (era: 'current' | 'classic', subCategory: string) =>
  `${apiBase(era)}/item?subCategoryFilter=${encodeURIComponent(subCategory)}&cashFilter=true&count=20000`;

const ids: number[] = [];
for (const { slot, subCategory } of CASH_CATEGORIES) {
  const classic = (await getJson<{ id: number }[]>(listUrl('classic', subCategory))) ?? [];
  const current = new Set(((await getJson<{ id: number }[]>(listUrl('current', subCategory))) ?? []).map(({ id }) => id));
  const both = classic.map(({ id }) => id).filter((id) => current.has(id));
  ids.push(...both);
  console.log(`${slot} v83 ${classic.length} · KMS 389 에도 있음 ${both.length}`);
}
const sorted = [...new Set(ids)].sort((a, b) => a - b);

const lines = [
  '// scripts/curate-classic-cash.ts 가 만든 파일이다. 손으로 고치지 말고 스크립트를 다시 돌린다',
  '',
  '/** GMS 83 캐시 아이템 중 KMS 389 에도 같은 ID 로 있는 것. 클래식 캐시샵은 이것만 팔고 v83 그림으로 그린다 */',
  'export const CLASSIC_CASH_ITEM_IDS: ReadonlySet<number> = new Set([',
  ...Array.from({ length: Math.ceil(sorted.length / 10) }, (_, row) => `  ${sorted.slice(row * 10, row * 10 + 10).join(', ')},`),
  ']);',
  '',
];
reportFailures();
await writeFile(outFile, lines.join('\n'));
console.log(`${sorted.length}개를 ${outFile.pathname} 에 썼다`);
