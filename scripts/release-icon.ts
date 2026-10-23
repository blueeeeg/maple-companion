// 릴리스 빌드에만 넣는 앱 아이콘(버섯집)으로 Tauri 아이콘 세트를 만든다. CI(release.yml)가 부른다.
// node --experimental-strip-types scripts/release-icon.ts [그림 PNG]
// 그림은 이 순서로 고른다: 인자로 준 PNG 파일(로컬 확인용) → 환경 변수 RELEASE_ICON_PNG_BASE64(PNG 파일의 base64,
// CI 는 저장소 시크릿으로 넘긴다) → SOURCE_URL 에서 받기
// 넥슨 그림이라 저장소에는 넣지 않는다. 출력 폴더 src-tauri/icons-release 는 .gitignore 에 있다.
// 못 만들면 0 이 아닌 코드로 끝나고, CI 는 기본 아이콘으로 빌드한다
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

/** 버섯집 원본을 받을 주소. 그림은 사용자가 app data 에 둔 custom-tray-icon.png 라 아는 공개 주소가 없어 비워 둔다 */
const SOURCE_URL = '';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src-tauri', 'icons-release');
/** tauri build --config 로 넘길 파일. bundle.icon 배열을 통째로 바꾼다. 경로는 tauri.conf.json 폴더 기준이다 */
const CONFIG_FILE = join(OUT_DIR, 'release-icon.conf.json');
const BUNDLE_ICONS = ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.icns', 'icon.ico'];
/** src-tauri/src/app_icon.rs 의 MAC_CANVAS·MAC_CONTENT 와 같다. macOS 아이콘 격자(1024 중 824)다 */
const CANVAS = 1024;
const CONTENT = 824;
const ATTEMPTS = 4;
const TIMEOUT_MS = 30_000;

export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 색 종류별 채널 수. 0 회색, 2 RGB, 3 팔레트, 4 회색+알파, 6 RGBA */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * 8비트 PNG 를 RGBA 로 푼다. 팔레트는 1·2·4·8비트를 받는다. 16비트와 인터레이스는 받지 않는다.
 * 오류 메시지에 그림 내용을 넣지 않는다(CI 에서 시크릿으로 넘어온다)
 */
export function decodePng(png: Uint8Array): Rgba {
  const bytes = Buffer.from(png);
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('PNG 가 아니다');
  let [width, height, depth, color] = [0, 0, 0, 0];
  let palette = Buffer.alloc(0);
  let transparency = Buffer.alloc(0);
  const idat: Buffer[] = [];
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      [depth, color] = [body[8], body[9]];
      const interlace = body[12];
      const supported = CHANNELS[color] !== undefined && (depth === 8 || (color === 3 && [1, 2, 4].includes(depth)));
      if (!supported || interlace !== 0) {
        throw new Error(`읽을 수 없는 PNG 형식이다(depth ${depth}, color ${color}, interlace ${interlace}). 8비트 RGBA·RGB·팔레트 PNG 로 저장한다`);
      }
    } else if (type === 'PLTE') {
      palette = body;
    } else if (type === 'tRNS') {
      transparency = body;
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }
  if (width === 0 || height === 0) throw new Error('PNG 크기가 없다');
  const raw = inflateSync(Buffer.concat(idat));
  const bitsPerPixel = CHANNELS[color] * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel / 8);
  const lines = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? lines[y * stride + x - bpp] : 0;
      const up = y > 0 ? lines[(y - 1) * stride + x] : 0;
      const upLeft = x >= bpp && y > 0 ? lines[(y - 1) * stride + x - bpp] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0) throw new Error(`모르는 PNG 필터 ${filter}`);
      lines[y * stride + x] = (line[x] + predictor) & 0xff;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = lines.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < width; x++) {
      let rgba: number[];
      if (color === 3) {
        const bit = x * depth;
        const index = (row[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        if (index * 3 + 2 >= palette.length) throw new Error('PNG 팔레트 밖의 색이다');
        rgba = [...palette.subarray(index * 3, index * 3 + 3), index < transparency.length ? transparency[index] : 255];
      } else {
        const px = [...row.subarray(x * CHANNELS[color], (x + 1) * CHANNELS[color])];
        if (color === 6) rgba = px;
        else if (color === 4) rgba = [px[0], px[0], px[0], px[1]];
        else {
          const rgb = color === 2 ? px : [px[0], px[0], px[0]];
          // tRNS 는 16비트 값으로 투명색 하나를 적는다. 8비트 그림이라 아래 바이트만 본다
          const key = color === 2 ? [transparency[1], transparency[3], transparency[5]] : [transparency[1], transparency[1], transparency[1]];
          const clear = transparency.length > 0 && rgb.every((value, i) => value === key[i]);
          rgba = [...rgb, clear ? 0 : 255];
        }
      }
      data.set(rgba, (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

export function encodePng({ width, height, data }: Rgba): Buffer {
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * app_icon.rs 의 build_canvas 와 같은 규칙이다. 투명한 가장자리를 잘라 내고 content 안에 들어가도록 정수배로만 늘려
 * 가운데에 둔다. 픽셀 그림이라 이웃 픽셀을 섞지 않는다. 그림이 없거나 늘리지 않아도 캔버스보다 크면 null
 */
export function buildCanvas(source: Rgba, canvas: number, content: number): Rgba | null {
  const opaque = (x: number, y: number) => source.data[(y * source.width + x) * 4 + 3] > 0;
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  const xs = range(source.width).filter((x) => range(source.height).some((y) => opaque(x, y)));
  const ys = range(source.height).filter((y) => range(source.width).some((x) => opaque(x, y)));
  if (xs.length === 0) return null;
  const [left, right, top, bottom] = [xs[0], xs[xs.length - 1], ys[0], ys[ys.length - 1]];
  const [width, height] = [right - left + 1, bottom - top + 1];
  const scale = Math.max(Math.floor(content / Math.max(width, height)), 1);
  const [scaledW, scaledH] = [width * scale, height * scale];
  if (scaledW > canvas || scaledH > canvas) return null;
  const [offsetX, offsetY] = [Math.floor((canvas - scaledW) / 2), Math.floor((canvas - scaledH) / 2)];
  const data = new Uint8Array(canvas * canvas * 4);
  for (let y = 0; y < scaledH; y++) {
    for (let x = 0; x < scaledW; x++) {
      const from = ((top + Math.floor(y / scale)) * source.width + left + Math.floor(x / scale)) * 4;
      data.set(source.data.subarray(from, from + 4), ((offsetY + y) * canvas + offsetX + x) * 4);
    }
  }
  return { width: canvas, height: canvas, data };
}

/** 서버가 느리고 가끔 5xx 를 내서 몇 번 다시 받는다. 4xx 는 다시 받아도 같으니 바로 실패한다 */
async function fetchSource(): Promise<Uint8Array> {
  if (!SOURCE_URL) throw new Error('RELEASE_ICON_PNG_BASE64 와 SOURCE_URL 이 모두 비어 있다');
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      lastError = new Error(`${response.status} ${SOURCE_URL}`);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < ATTEMPTS) {
      console.warn(`[release-icon] ${attempt}번째 받기 실패(${lastError}), 다시 받는다`);
      await new Promise((resolve) => setTimeout(resolve, 3_000 * attempt));
    }
  }
  throw lastError;
}

/** 시크릿 값이 들어 있으니 내용·길이를 로그에 남기지 않는다. 비어 있으면(시크릿 미등록) SOURCE_URL 로 넘어간다 */
export async function loadSource(base64 = process.env.RELEASE_ICON_PNG_BASE64): Promise<Uint8Array> {
  if (base64?.trim()) return new Uint8Array(Buffer.from(base64.trim(), 'base64'));
  return fetchSource();
}

async function main(localSource?: string): Promise<void> {
  const source = localSource ? await readFile(localSource) : await loadSource();
  const canvas = buildCanvas(decodePng(source), CANVAS, CONTENT);
  if (!canvas) throw new Error('아이콘으로 쓸 그림이 아니다');
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  const sourcePng = join(OUT_DIR, 'source-1024.png');
  await writeFile(sourcePng, encodePng(canvas));
  // pnpm 을 거치지 않고 CLI 를 바로 부른다. Windows 에서 pnpm.cmd 는 셸 없이 못 띄운다
  const cli = join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
  const result = spawnSync(process.execPath, [cli, 'icon', sourcePng, '-o', OUT_DIR], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`tauri icon 이 실패했다(${result.status ?? result.error})`);
  const config = { bundle: { icon: BUNDLE_ICONS.map((name) => `icons-release/${name}`) } };
  await writeFile(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`[release-icon] ${OUT_DIR}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv[2]).catch((error) => {
    console.error(`[release-icon] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
