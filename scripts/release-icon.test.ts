import { crc32, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { type Rgba, buildCanvas, decodePng, encodePng, loadSource } from './release-icon.ts';

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];
const CLEAR = [0, 0, 0, 0];

function image(width: number, height: number, fill = CLEAR): Rgba {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(fill, i);
  return { width, height, data };
}
const put = (img: Rgba, x: number, y: number, color: number[]) => img.data.set(color, (y * img.width + x) * 4);
/** 필터 0 줄로 PNG 를 손으로 짠다. encodePng 는 RGBA 만 쓰므로 다른 색 종류를 시험할 때 쓴다 */
function rawPng(width: number, height: number, depth: number, color: number, rows: number[][], extra: [string, number[]][] = []) {
  const chunk = (type: string, body: Buffer) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, 'latin1');
    body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([depth, color, 0, 0, 0], 8);
  const raw = Buffer.from(rows.flatMap((row) => [0, ...row]));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...extra.map(([type, body]) => chunk(type, Buffer.from(body))),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const at = (img: Rgba, x: number, y: number) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

describe('release icon', () => {
  // src-tauri/src/app_icon.rs 의 sprite_is_trimmed_scaled_by_integer_and_centered 와 같은 경우다
  it('trims, scales by an integer and centers like app_icon.rs', () => {
    const source = image(10, 10);
    put(source, 4, 2, RED);
    put(source, 5, 2, BLUE);
    put(source, 6, 2, RED);
    for (let x = 4; x < 7; x++) put(source, x, 3, BLUE);
    const canvas = buildCanvas(source, 100, 80)!;
    expect([canvas.width, canvas.height]).toEqual([100, 100]);
    expect(at(canvas, 10, 24)).toEqual(CLEAR);
    expect(at(canvas, 11, 23)).toEqual(CLEAR);
    expect(at(canvas, 11, 24)).toEqual(RED);
    expect(at(canvas, 36, 49)).toEqual(RED);
    expect(at(canvas, 37, 24)).toEqual(BLUE);
    expect(at(canvas, 63, 49)).toEqual(RED);
    expect(at(canvas, 88, 75)).toEqual(BLUE);
    expect(at(canvas, 89, 75)).toEqual(CLEAR);
    expect(at(canvas, 88, 76)).toEqual(CLEAR);
  });

  it('rejects an empty or oversized picture', () => {
    expect(buildCanvas(image(30, 30), 100, 80)).toBeNull();
    expect(buildCanvas(image(120, 120, RED), 100, 80)).toBeNull();
  });

  it('uses the base64 PNG from the secret before SOURCE_URL', async () => {
    const source = image(2, 2, BLUE);
    put(source, 1, 1, CLEAR);
    const base64 = encodePng(source).toString('base64');
    expect(decodePng(await loadSource(`${base64}\n`))).toEqual(source);
  });

  it('falls through to SOURCE_URL when the secret is empty, and fails while that is empty too', async () => {
    await expect(loadSource('')).rejects.toThrow('모두 비어 있다');
    await expect(loadSource(undefined)).rejects.toThrow('모두 비어 있다');
  });

  it('reads RGB and palette PNGs as RGBA', () => {
    const rgb = decodePng(rawPng(2, 1, 8, 2, [[255, 0, 0, 0, 0, 255]], [['tRNS', [0, 0, 0, 0, 0, 255]]]));
    expect(at(rgb, 0, 0)).toEqual(RED);
    expect(at(rgb, 1, 0)).toEqual([0, 0, 255, 0]);
    // 4비트 팔레트 3픽셀: 1, 0, 1. 0번 색은 tRNS 로 투명
    const plte: [string, number[]][] = [['PLTE', [0, 0, 0, 255, 0, 0]], ['tRNS', [0]]];
    const indexed = decodePng(rawPng(3, 1, 4, 3, [[0x10, 0x10]], plte));
    expect([at(indexed, 0, 0), at(indexed, 1, 0), at(indexed, 2, 0)]).toEqual([RED, CLEAR, RED]);
  });

  it('rejects 16-bit and non-PNG input with a clear message', () => {
    expect(() => decodePng(rawPng(1, 1, 16, 6, [[0, 0, 0, 0, 0, 0, 0, 0]]))).toThrow('읽을 수 없는 PNG 형식');
    expect(() => decodePng(Buffer.from('not a png'))).toThrow('PNG 가 아니다');
  });

  it('round-trips RGBA through PNG', () => {
    const source = image(3, 2);
    put(source, 0, 0, RED);
    put(source, 2, 1, [10, 20, 30, 128]);
    expect(decodePng(encodePng(source))).toEqual(source);
  });
});
