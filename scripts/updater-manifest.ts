// 온라인 특수판의 업데이트 목록(latest-online.json)을 릴리스에 올라간 .sig 로 만든다. CI(release.yml)가 부른다.
// node --experimental-strip-types scripts/updater-manifest.ts <.sig 폴더> <출력 JSON> <prefix>
// 환경 변수 GITHUB_REPOSITORY·GITHUB_REF_NAME 으로 주소를 만든다.
// tauri-action 의 latest.json 은 보통 판만 담는다. 온라인 판까지 넣으면 보통 판 사용자가 온라인 판으로 업데이트돼서 따로 만든다
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Platform {
  signature: string;
  url: string;
}

export interface Manifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, Platform>;
}

/** tauri-action 이 latest.json 에 넣는 키와 같다. 유니버설 하나로 두 아키텍처를 받고, Windows 기본은 NSIS 다 */
const PLATFORMS: [suffix: string, keys: string[]][] = [
  ['.app.tar.gz', ['darwin-aarch64', 'darwin-x86_64', 'darwin-aarch64-app', 'darwin-x86_64-app']],
  ['-setup.exe', ['windows-x86_64', 'windows-x86_64-nsis']],
  ['.msi', ['windows-x86_64-msi']],
];

/** sigs 는 릴리스 자산 이름(.sig 포함) → 파일 내용. prefix 로 시작하지 않는 자산은 다른 판이라 넣지 않는다 */
export function buildManifest(opts: {
  repo: string;
  tag: string;
  prefix: string;
  sigs: Record<string, string>;
  pubDate: string;
}): Manifest {
  const platforms: Record<string, Platform> = {};
  for (const [name, signature] of Object.entries(opts.sigs)) {
    if (!name.startsWith(opts.prefix) || !name.endsWith('.sig')) continue;
    const asset = name.slice(0, -'.sig'.length);
    const keys = PLATFORMS.find(([suffix]) => asset.endsWith(suffix))?.[1] ?? [];
    for (const key of keys) {
      platforms[key] = { signature, url: `https://github.com/${opts.repo}/releases/download/${opts.tag}/${asset}` };
    }
  }
  return { version: opts.tag.replace(/^v/, ''), notes: '', pub_date: opts.pubDate, platforms };
}

async function main(dir: string, out: string, prefix: string): Promise<void> {
  const { GITHUB_REPOSITORY: repo, GITHUB_REF_NAME: tag } = process.env;
  if (!repo || !tag) throw new Error('GITHUB_REPOSITORY·GITHUB_REF_NAME 이 없다');
  const names = (await readdir(dir)).filter((name) => name.endsWith('.sig'));
  const sigs = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await readFile(join(dir, name), 'utf8')])));
  const manifest = buildManifest({ repo, tag, prefix, sigs, pubDate: new Date().toISOString() });
  const found = Object.keys(manifest.platforms);
  if (found.length === 0) throw new Error(`${prefix} 로 시작하는 .sig 가 없다`);
  await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[updater-manifest] ${out}: ${found.join(', ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [dir, out, prefix] = process.argv.slice(2);
  main(dir, out, prefix).catch((error) => {
    console.error(`[updater-manifest] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
