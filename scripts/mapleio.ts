// 큐레이션 스크립트들이 같이 쓰는 maplestory.io 요청. 개발용 도구다.
// 서버가 느려서 요청은 하나씩 보내고 받은 응답은 캐시 폴더에 남긴다
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type ScriptEra = 'current' | 'classic';

/** src/maple/api.ts DATA_SOURCES 와 같은 값이다. 스크립트는 그 모듈을 바로 못 불러온다(확장자 없는 import) */
export const SOURCES: Record<ScriptEra, { region: string; version: string }> = {
  current: { region: 'KMS', version: '389' },
  classic: { region: 'GMS', version: '83' },
};
export const apiBase = (era: ScriptEra) => `https://maplestory.io/api/${SOURCES[era].region}/${SOURCES[era].version}`;
export const wzBase = (era: ScriptEra) => `https://maplestory.io/api/wz/${SOURCES[era].region}/${SOURCES[era].version}`;

/** `--era classic` 처럼 받은 시대. 없으면 지금 시대다 */
export function eraArg(argv: string[]): ScriptEra {
  const index = argv.indexOf('--era');
  const value = index >= 0 ? argv[index + 1] : 'current';
  if (value !== 'current' && value !== 'classic') throw new Error(`모르는 시대 ${value}`);
  return value;
}

/** `--era` 와 그 값을 뺀 위치 인자 */
export function positionalArgs(argv: string[]): string[] {
  const index = argv.indexOf('--era');
  return argv.filter((_, i) => index < 0 || (i !== index && i !== index + 1));
}

const TIMEOUT_MS = 30_000;
let cacheDir = '';
/** 끝내 못 받은 주소. 없는 것으로 치고 넘어가니, 남으면 캐시를 둔 채 다시 돌린다 */
export const failures: string[] = [];

export async function useCache(dir: string): Promise<void> {
  cacheDir = dir;
  await mkdir(dir, { recursive: true });
}

/**
 * 없는 맵·몹은 404 로 오고, 없는 WZ 노드는 500(「Object reference not set」)으로 온다(v83 에서 특히 많다).
 * 둘 다 없다는 사실로 남기고 다시 받지 않는다. 그 밖의 5xx·끊김만 다시 받는다
 */
export async function getJson<T>(url: string): Promise<T | null> {
  const file = join(cacheDir, url.replace(/^https:\/\/maplestory\.io\/api\//, '').replace(/[^\w.-]+/g, '_') + '.json');
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T | null;
  } catch {
    // 캐시에 없으면 받는다
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      let body: unknown;
      if (response.ok) body = await response.json();
      else if (response.status === 404) body = null;
      else if (response.status === 500 && /Object reference not set/.test(await response.text())) body = null;
      else throw new Error(`${response.status}`);
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

export const wzMapPath = (mapId: number) => {
  const padded = String(mapId).padStart(9, '0');
  return `Map/Map/Map${padded[0]}/${padded}.img`;
};

export const quote = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export function reportFailures(): void {
  if (failures.length === 0) return;
  console.log('\n못 받은 주소 (다시 돌리면 이것만 다시 받는다)');
  failures.forEach((url) => console.log(`  ${url}`));
}
