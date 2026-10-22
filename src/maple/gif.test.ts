import { describe, expect, it } from 'vitest';
import { gifFrameDelays } from './gif';

const frame = (delayCs: number) => [
  // 그래픽 제어 확장: 딜레이는 1/100초 단위
  0x21, 0xf9, 0x04, 0x00, delayCs & 0xff, delayCs >> 8, 0x00, 0x00,
  // 이미지 설명자 1x1, 로컬 색상표 없음
  0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00,
  // LZW 최소 코드 크기와 데이터 블록
  0x02, 0x02, 0x44, 0x01, 0x00,
];

function buildGif(delaysCs: number[]): ArrayBuffer {
  const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0];
  const globalColorTable = [0, 0, 0, 255, 255, 255];
  const bytes = [...header, ...globalColorTable, ...delaysCs.flatMap(frame), 0x3b];
  return new Uint8Array(bytes).buffer;
}

describe('GIF 프레임 딜레이', () => {
  it('프레임마다 원작 딜레이를 ms 로 읽는다', () => {
    expect(gifFrameDelays(buildGif([30, 15, 35]))).toEqual([300, 150, 350]);
  });

  it('딜레이가 비어 있으면 기본값을 쓴다', () => {
    expect(gifFrameDelays(buildGif([0]))).toEqual([100]);
  });
});
