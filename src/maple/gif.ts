const DEFAULT_DELAY_MS = 100;

function colorTableSize(packed: number): number {
  return packed & 0x80 ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
}

/**
 * 애니메이션 GIF 의 프레임별 딜레이(ms). API 의 GIF 렌더에는 원작 프레임 딜레이가 그대로 들어 있어서
 * 프레임 수와 재생 속도를 여기서 읽는다
 */
export function gifFrameDelays(buffer: ArrayBuffer): number[] {
  const bytes = new Uint8Array(buffer);
  let cursor = 13 + colorTableSize(bytes[10]);
  let pendingDelay = 0;
  const delays: number[] = [];

  const skipSubBlocks = () => {
    while (cursor < bytes.length && bytes[cursor] !== 0) cursor += bytes[cursor] + 1;
    cursor += 1;
  };

  while (cursor < bytes.length) {
    const blockId = bytes[cursor++];
    if (blockId === 0x21) {
      const label = bytes[cursor++];
      if (label === 0xf9) pendingDelay = (bytes[cursor + 2] | (bytes[cursor + 3] << 8)) * 10;
      skipSubBlocks();
    } else if (blockId === 0x2c) {
      const packed = bytes[cursor + 8];
      cursor += 9 + colorTableSize(packed) + 1;
      skipSubBlocks();
      delays.push(pendingDelay || DEFAULT_DELAY_MS);
      pendingDelay = 0;
    } else {
      break;
    }
  }
  return delays;
}
