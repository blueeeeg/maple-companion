// 클래식(GMS 83) 모험가 스킬북을 maplestory.io 에서 읽어 src/game/skillBook.classic.ts 로 쓴다. 개발용 도구다.
// node --experimental-strip-types scripts/curate-classic-skills.ts [캐시 폴더]
// 지금 시대 스킬북(src/game/skillBook.ts)과 같은 기준으로 공격·액티브·패시브와 이펙트 그림 유무를 가른다
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLASSIC_JOB_BRANCHES, CLASSIC_JOB_LINES } from '../src/game/jobs.classic.ts';
import { classicSkillName, nameNotes } from './classicNames.ts';
import { apiBase, getJson, quote, reportFailures, useCache, wzBase } from './mapleio.ts';

type SkillType = 'attack' | 'active' | 'passive';

interface FrameLayer {
  frames: unknown[];
}

interface SkillJson {
  id: number;
  invisible?: boolean;
  actions?: string[];
  effect?: FrameLayer[];
  hit?: FrameLayer[];
  levelProperties?: Record<string, string>[];
}

const cacheDir = process.argv[2] ?? join(tmpdir(), 'maple-routes-cache');
const outFile = new URL('../src/game/skillBook.classic.ts', import.meta.url);
await useCache(cacheDir);

const LINE_JOBS = { warrior: 100, magician: 200, archer: 300, thief: 400, pirate: 500 } as const;

/**
 * v83 에는 지금 KMS 의 info/type·psd 가 없다. 대신 쓸 때 MP(HP)를 쓰는 스킬만 mpCon·hpCon 이 있어서 그것으로 쓰는 스킬과
 * 패시브를 가른다. 쓰는 스킬 중 damage 가 있거나 mad(마법 공격력)에 맞는 그림·몹 수가 있으면 공격이다. 이 기준과 다른 것만 적는다
 */
const TYPE_OVERRIDES: Record<number, SkillType> = {
  // 대미지 값이 있지만 무기에 거는 버프다(콤보 어택·속성 차지)
  1111002: 'active',
  1211003: 'active',
  1211004: 'active',
  1211005: 'active',
  1211006: 'active',
  1211007: 'active',
  1211008: 'active',
  1221003: 'active',
  1221004: 'active',
  // MP 를 안 쓰는 버프다
  2121004: 'active',
  2221004: 'active',
  2321004: 'active',
  5101005: 'active',
  // 대미지 값이 다른 이름으로 들어 있는 공격이다
  2111003: 'attack',
  3101005: 'attack',
  3221007: 'attack',
  4211006: 'attack',
  // MP 대신 에너지 차지를 쓰는 공격이다
  5111002: 'attack',
  5111004: 'attack',
  5121002: 'attack',
  // 쉐도우 메소. 스킬 데이터가 서버에서 터져(500) 받지 못한다
  4111004: 'attack',
};

const frameCount = (layers: FrameLayer[] | undefined) => (layers ?? []).reduce((sum, layer) => sum + layer.frames.length, 0);

function classify(skill: SkillJson): SkillType {
  const override = TYPE_OVERRIDES[skill.id];
  if (override) return override;
  const props = skill.levelProperties?.at(-1) ?? {};
  if (!('mpCon' in props) && !('hpCon' in props)) return 'passive';
  if ('damage' in props) return 'attack';
  if ('mad' in props && (frameCount(skill.hit) > 0 || 'mobCount' in props)) return 'attack';
  return 'active';
}

/** 스킬북 응답이 서버에서 터지는 직업이 있다(411 은 쉐도우 메소 때문). 그때는 WZ 자식 목록으로 하나씩 받는다 */
async function jobSkills(jobId: number): Promise<{ id: number; data: SkillJson | null }[]> {
  const book = await getJson<{ skills?: SkillJson[] }>(`${apiBase('classic')}/job/${jobId}/skillbook`);
  if (book?.skills) return book.skills.map((data) => ({ id: data.id, data }));
  const node = await getJson<{ children: string[] }>(`${wzBase('classic')}/Skill/${jobId}.img/skill`);
  return Promise.all(
    (node?.children ?? []).map(async (name) => ({
      id: Number(name),
      data: await getJson<SkillJson>(`${apiBase('classic')}/job/skill/${Number(name)}`),
    })),
  );
}

interface Entry {
  id: number;
  name: string;
  type: SkillType;
  noArt: boolean;
  kb?: number;
}

async function entries(jobId: number): Promise<Entry[]> {
  const skills = await jobSkills(jobId);
  const result: Entry[] = [];
  for (const { id, data } of skills.sort((a, b) => a.id - b.id)) {
    const type = data ? classify(data) : (TYPE_OVERRIDES[id] ?? 'passive');
    // 한 장짜리 이펙트는 빈 그림이다(skillBook.ts hasUsableEffect)
    const noArt = type !== 'passive' && (!data || frameCount(data.effect) < 2);
    let kb: number | undefined;
    if (type !== 'passive' && !noArt) {
      const full = await getJson<SkillJson>(`${apiBase('classic')}/job/skill/${id}`);
      if (full) kb = Math.round(JSON.stringify(full).length / 1024);
    }
    result.push({ id, name: (await classicSkillName(id)).name, type, noArt, ...(kb !== undefined ? { kb } : {}) });
  }
  return result;
}

const literal = (entry: Entry) =>
  `{ id: ${entry.id}, name: ${quote(entry.name)}, type: '${entry.type}'${entry.noArt ? ', noArt: true' : ''}${
    entry.kb !== undefined ? `, kb: ${entry.kb}` : ''
  } }`;
const block = (list: Entry[], indent: string) => `[\n${list.map((entry) => `${indent}  ${literal(entry)},`).join('\n')}\n${indent}]`;

const lines: string[] = [
  '// scripts/curate-classic-skills.ts 가 만든 파일이다. 손으로 고치지 말고 스크립트를 다시 돌린다',
  "import type { JobBranchId, JobLineId } from './jobs';",
  "import type { SkillEntry } from './skillBook';",
  '',
  '/** 클래식 1차. 계열이 같이 배운다. GMS 83 스킬북 그대로이고 숨김(invisible)은 v83 에서 마스터리북이 필요한 스킬이라 넣었다 */',
  'export const CLASSIC_FIRST: Record<JobLineId, SkillEntry[]> = {',
];
for (const [line, jobId] of Object.entries(LINE_JOBS)) {
  lines.push(`  ${line}: ${block(await entries(jobId), '  ')},`);
  console.log(line, jobId);
}
lines.push('};', '', '/** 클래식 2·3·4차. 2차 갈래마다 따로다 */', 'export const CLASSIC_BRANCH_BOOKS: Record<JobBranchId, SkillEntry[][]> = {');
for (const branch of Object.values(CLASSIC_JOB_BRANCHES)) {
  const tiers = [];
  for (const jobId of branch.jobIds) tiers.push(block(await entries(jobId), '    '));
  lines.push(`  ${branch.id}: [\n${tiers.map((tier) => `    ${tier},`).join('\n')}\n  ],`);
  console.log(branch.id, branch.jobIds.join('·'));
}
lines.push('};', '');

// 자동 스킬로 정해 둔 것이 그 직업 스킬북에 있는지 본다
const known = new Set([...lines.join('\n').matchAll(/id: (\d+)/g)].map((match) => Number(match[1])));
const autoSkills = [...Object.values(CLASSIC_JOB_LINES).map((line) => line.skill), ...Object.values(CLASSIC_JOB_BRANCHES).flatMap((b) => b.skills)];
autoSkills.filter((id) => !known.has(id)).forEach((id) => console.warn(`자동 스킬 ${id} 가 스킬북에 없다`));

reportFailures();
if (nameNotes.length > 0) {
  console.log('\n한 번 볼 이름');
  nameNotes.forEach((note) => console.log(`  ${note}`));
}
await writeFile(outFile, lines.join('\n'));
console.log(`${outFile.pathname} 에 썼다`);
