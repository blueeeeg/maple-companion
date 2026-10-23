import { describe, expect, it } from 'vitest';
import { type FrameRecipe, edgeX, fillTiles, rebuildBossFrame, stripPieces, stripWidth } from './buttonArt';

describe('원작 버튼 3조각', () => {
  const slice = { capLeft: 4, capRight: 4, fillX: 10, fillWidth: 1 };

  it('왼쪽 끝·글자 없는 가운데 한 칸·오른쪽 끝을 이어 띠를 만든다', () => {
    expect(stripPieces(83, slice)).toEqual([
      { sx: 0, dx: 0, width: 4 },
      { sx: 10, dx: 4, width: 1 },
      { sx: 79, dx: 5, width: 4 },
    ]);
    expect(stripWidth(slice)).toBe(9);
  });

  it('가운데가 끝 조각에 걸치거나 끝끼리 겹치면 쓰지 않는다', () => {
    expect(stripPieces(83, { ...slice, fillX: 2 })).toBeNull();
    expect(stripPieces(83, { ...slice, fillX: 79 })).toBeNull();
    expect(stripPieces(6, { capLeft: 4, capRight: 4, fillX: 4, fillWidth: 1 })).toBeNull();
    expect(stripPieces(83, { ...slice, fillWidth: 0 })).toBeNull();
  });

  it('끝이 0칸이면 그 조각은 빼고 이어 붙인다', () => {
    expect(stripPieces(10, { capLeft: 0, capRight: 2, fillX: 3, fillWidth: 2 })).toEqual([
      { sx: 3, dx: 0, width: 2 },
      { sx: 8, dx: 2, width: 2 },
    ]);
  });

  it('가운데 조각은 끝 사이를 빈틈없이 채우고 마지막 칸은 오른쪽 끝에서 자른다', () => {
    const noise = { capLeft: 4, capRight: 4, fillX: 5, fillWidth: 14 };
    const tiles = fillTiles(83, noise);
    expect(tiles[0]).toEqual({ dx: 4, width: 14 });
    expect(tiles[tiles.length - 1]).toEqual({ dx: 74, width: 5 });
    expect(tiles.reduce((sum, tile) => sum + tile.width, 0)).toBe(83 - 8);
  });

  it('버튼 폭이 끝 두 조각뿐이면 가운데는 없다', () => {
    expect(fillTiles(8, slice)).toEqual([]);
  });
});

describe('보스 목록 빈 틀', () => {
  // 폭 12, 높이 4. 왼쪽 0열은 테두리(T), 1~5열은 밝은 쐐기(L/l 바둑판), 그 오른쪽은 어두운 바탕(D/d 바둑판).
  // 이름(N)이 3~6열 1~2줄에, 초상(P)이 8열부터 있다. 0줄 왼쪽 끝은 둥근 모서리라 투명(_)
  const C = {
    _: [0, 0, 0, 0],
    T: [200, 200, 200, 255],
    L: [120, 120, 120, 255],
    l: [110, 110, 110, 255],
    D: [60, 60, 60, 255],
    d: [50, 50, 50, 255],
    N: [255, 255, 255, 255],
    P: [255, 0, 0, 255],
  };
  type Key = keyof typeof C;
  const rows = ['_TTTTTTTTPPP', 'TLlNNNNdDPPP', 'TlLNNNNDdPPP', 'TLlLdDdDdPPP'];
  const source = new Uint8ClampedArray(rows.flatMap((row) => [...row].flatMap((key) => C[key as Key])));
  const recipe: FrameRecipe = {
    nameHole: { x: 3, y: 1, width: 4, height: 2 },
    edgeTop: [5, 1],
    edgeBottom: [4, 2],
    fillFrom: 8,
    fillX: 7,
    fillWidth: 2,
    cap: 2,
  };
  const keyAt = (pixels: Uint8ClampedArray, x: number, y: number) => {
    const at = (y * 12 + x) * 4;
    const value = [...pixels.subarray(at, at + 4)].join();
    return (Object.keys(C) as Key[]).find((key) => C[key].join() === value);
  };
  const frame = rebuildBossFrame(source, 12, recipe);
  const picture = rows.map((_, y) => Array.from({ length: 12 }, (__, x) => keyAt(frame, x, y)).join(''));

  it('경계는 두 점을 잇는 직선이다', () => {
    expect(edgeX(recipe, 1)).toBe(5);
    expect(edgeX(recipe, 2)).toBe(4);
    expect(edgeX(recipe, 3)).toBe(3);
  });

  it('이름 칸은 경계 왼쪽은 쐐기, 오른쪽은 바탕 무늬로 홀짝을 맞춰 채운다', () => {
    expect(picture[1].slice(0, 9)).toBe('TLlLldDdD');
    expect(picture[2].slice(0, 9)).toBe('TlLldDdDd');
  });

  it('초상 자리는 바탕 띠를 되풀이하고 오른쪽 끝은 왼쪽 끝을 뒤집어 맞춘다', () => {
    expect(picture[0]).toBe('_TTTTTTTTTT_');
    expect(picture[1].slice(8)).toBe('DdDT');
    expect(picture[3].slice(8)).toBe('dDdT');
  });

  it('원본 배열은 고치지 않는다', () => {
    expect(keyAt(source, 4, 1)).toBe('N');
  });
});
