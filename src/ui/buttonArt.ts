/** 그림에서 잘라 쓸 직사각형 */
export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 원작 버튼을 가로로 늘리는 3조각 자리. 왼쪽·오른쪽 끝(테두리·둥근 모서리)은 그대로 두고,
 * 가운데는 글자가 없는 fillX 부터 fillWidth 칸을 되풀이한다. 무늬가 2칸마다 반복되면 fillWidth 도 그 배수로 둔다
 */
export interface ThreeSlice {
  capLeft: number;
  capRight: number;
  fillX: number;
  fillWidth: number;
}

/** 글자 없는 버튼 띠(왼쪽 끝 + 가운데 한 칸 + 오른쪽 끝)를 만들 때 원본에서 옮길 열. sx 는 원본, dx 는 띠 안 자리 */
export interface StripPiece {
  sx: number;
  dx: number;
  width: number;
}

/** 원본 폭 sourceWidth 의 버튼에서 띠를 이룰 세 조각. 끝끼리 겹치거나 가운데가 끝에 걸치면 글자 없는 띠가 아니라서 null */
export function stripPieces(sourceWidth: number, slice: ThreeSlice): StripPiece[] | null {
  const { capLeft, capRight, fillX, fillWidth } = slice;
  const rightFrom = sourceWidth - capRight;
  const valid =
    capLeft >= 0 && capRight >= 0 && fillWidth >= 1 && capLeft <= rightFrom && fillX >= capLeft && fillX + fillWidth <= rightFrom;
  if (!valid) return null;
  return [
    { sx: 0, dx: 0, width: capLeft },
    { sx: fillX, dx: capLeft, width: fillWidth },
    { sx: rightFrom, dx: capLeft + fillWidth, width: capRight },
  ].filter((piece) => piece.width > 0);
}

/** 띠의 폭. CSS border-image 는 이 띠를 끝 두 조각과 되풀이하는 가운데로 나눠 버튼 폭만큼 깐다 */
export const stripWidth = (slice: ThreeSlice): number => slice.capLeft + slice.fillWidth + slice.capRight;

/**
 * 폭 width 인 버튼을 띠로 덮을 때 가운데 조각이 놓이는 자리. 테스트와 캔버스 미리보기에서 border-image 와 같은 결과를 얻는 데 쓴다.
 * 가운데는 왼쪽 끝 바로 뒤부터 fillWidth 칸씩 깔고 마지막 칸은 오른쪽 끝에서 자른다
 */
export function fillTiles(width: number, slice: ThreeSlice): { dx: number; width: number }[] {
  const from = slice.capLeft;
  const to = width - slice.capRight;
  const tiles: { dx: number; width: number }[] = [];
  for (let dx = from; dx < to; dx += slice.fillWidth) tiles.push({ dx, width: Math.min(slice.fillWidth, to - dx) });
  return tiles;
}

/**
 * 원작 보스 목록 버튼(UIBoss.img BossList btBoss, 135×30)에서 이름·초상을 걷어 낸 빈 틀을 만드는 법.
 * 원작에 빈 틀이 없어서 한 보스의 버튼 그림을 고쳐 쓴다
 */
export interface FrameRecipe {
  /** 이름 글자가 있던 칸. 밝은 쐐기와 어두운 바탕의 경계가 이 칸을 비스듬히 지난다 */
  nameHole: PixelBox;
  /** 경계의 두 점 [x, y]. 그 사이 줄은 직선으로 잇는다 */
  edgeTop: [x: number, y: number];
  edgeBottom: [x: number, y: number];
  /** 이 열부터 오른쪽 끝 앞까지 바탕 띠(fillX 부터 fillWidth 칸)를 되풀이해 초상을 덮는다 */
  fillFrom: number;
  fillX: number;
  fillWidth: number;
  /** 오른쪽 끝 열 수. 왼쪽 끝을 뒤집어 둥근 모서리·테두리를 맞추고 그 안쪽은 바탕 띠로 채운다 */
  cap: number;
}

/** 경계 x. 위아래 점 밖의 줄도 같은 직선으로 늘린다 */
export function edgeX(recipe: Pick<FrameRecipe, 'edgeTop' | 'edgeBottom'>, y: number): number {
  const [topX, topY] = recipe.edgeTop;
  const [bottomX, bottomY] = recipe.edgeBottom;
  return Math.round(topX + ((bottomX - topX) * (y - topY)) / (bottomY - topY));
}

/**
 * 버튼 그림(RGBA, 폭 width)에서 이름·초상을 걷은 빈 틀을 새 배열로 돌려준다. 원본은 고치지 않는다.
 * 무늬가 2칸마다 엇갈리는 바둑판이라 모든 복사는 같은 짝(홀짝)의 열에서 가져온다
 */
export function rebuildBossFrame(source: Uint8ClampedArray, width: number, recipe: FrameRecipe): Uint8ClampedArray {
  const height = source.length / 4 / width;
  const pixels = new Uint8ClampedArray(source);
  const at = (x: number, y: number) => (y * width + x) * 4;
  const copy = (toX: number, y: number, fromX: number) => pixels.set(source.subarray(at(fromX, y), at(fromX, y) + 4), at(toX, y));
  const band = (x: number) => recipe.fillX + ((((x - recipe.fillX) % recipe.fillWidth) + recipe.fillWidth) % recipe.fillWidth);

  // 이름 칸: 경계 왼쪽(밝은 쐐기)은 칸 왼쪽 밖에서, 오른쪽(어두운 바탕)은 칸 오른쪽 밖에서 같은 짝의 픽셀을 가져온다
  const hole = recipe.nameHole;
  const holeRight = hole.x + hole.width;
  for (let y = hole.y; y < hole.y + hole.height; y += 1) {
    const edge = edgeX(recipe, y);
    for (let x = hole.x; x < holeRight; x += 1) {
      const fromX = x < edge ? x - 2 * Math.ceil((x - hole.x + 1) / 2) : x + 2 * Math.ceil((holeRight - x) / 2);
      copy(x, y, fromX);
    }
  }

  const capFrom = width - recipe.cap;
  for (let y = 0; y < height; y += 1) {
    for (let x = recipe.fillFrom; x < capFrom; x += 1) copy(x, y, band(x));
    // 왼쪽 끝을 뒤집는다. 투명한 모서리와 테두리 한 칸은 그대로, 그 안쪽은 바탕 띠
    let border = 0;
    while (border < recipe.cap && source[at(border, y) + 3] === 0) border += 1;
    for (let i = 0; i < recipe.cap; i += 1) {
      const x = width - 1 - i;
      if (i < border) pixels.fill(0, at(x, y), at(x, y) + 4);
      else if (i === border) copy(x, y, i);
      else copy(x, y, band(x));
    }
  }
  return pixels;
}
