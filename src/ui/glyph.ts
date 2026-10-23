/** 떼어 낸 그림이 놓인 자리 */
export interface GlyphBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 버튼 그림에서 바탕색을 지우고 그 안의 그림만 남긴다. RGBA 픽셀을 그 자리에서 고치고, 남은 그림의 테두리 상자를 돌려준다.
 * area 밖(버튼 테두리·광택)과 isBackground 인 픽셀은 투명하게 만든다. 남은 것이 없으면 null
 */
export function keyOutBackground(
  pixels: Uint8ClampedArray,
  width: number,
  area: GlyphBox,
  isBackground: (r: number, g: number, b: number) => boolean,
): GlyphBox | null {
  const height = pixels.length / 4 / width;
  let left = Infinity;
  let top = Infinity;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      const inside = x >= area.x && x < area.x + area.width && y >= area.y && y < area.y + area.height;
      if (!inside || pixels[at + 3] < 128 || isBackground(pixels[at], pixels[at + 1], pixels[at + 2])) {
        pixels[at + 3] = 0;
        continue;
      }
      pixels[at + 3] = 255;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** 빅뱅 전 상태 바 단축 버튼(StatusBar.img StatKey·SkillKey)의 파란 바탕. 그림의 하늘색 테두리·청록 막대는 남는다 */
export const isQuickKeyBlue = (r: number, g: number, b: number): boolean => b > r + 40 && b > g + 40;

/**
 * 바탕이 투명한 그림에서 알파가 minAlpha 아래인 픽셀(바탕에 흩뿌린 옅은 점)을 지우고, 남은 그림을 감싸는 상자를 돌려준다.
 * 남은 픽셀의 반투명(글자 그림자 등)은 그대로 둔다. 남은 것이 없으면 null
 */
export function keyOutFaint(pixels: Uint8ClampedArray, width: number, minAlpha: number): GlyphBox | null {
  const height = pixels.length / 4 / width;
  let left = Infinity;
  let top = Infinity;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4 + 3;
      if (pixels[at] < minAlpha) {
        pixels[at] = 0;
        continue;
      }
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
