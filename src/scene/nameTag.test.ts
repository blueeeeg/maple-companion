import { describe, expect, it } from 'vitest';
import { NAME_MAX_LENGTH } from '../game/characters';
import { EXP_BAR_HEIGHT, NAME_TAG_GAP, NAME_TAG_HEIGHT, nameTagBox, nameTagLabel, nameTagPosition } from './nameTag';

const VIEW = { width: 360, height: 230 };

describe('이름표 글자', () => {
  it('이름을 그대로 쓴다', () => {
    expect(nameTagLabel('모험가')).toBe('모험가');
  });

  it('앞뒤 공백은 뺀다', () => {
    expect(nameTagLabel('  모험가 ')).toBe('모험가');
  });

  it('비었거나 없으면 이름표를 숨긴다', () => {
    expect(nameTagLabel('')).toBeNull();
    expect(nameTagLabel('   ')).toBeNull();
    expect(nameTagLabel(null)).toBeNull();
    expect(nameTagLabel(undefined)).toBeNull();
  });

  it('규칙 안의 가장 긴 이름은 자르지 않는다', () => {
    const name = '가'.repeat(NAME_MAX_LENGTH);
    expect(nameTagLabel(name)).toBe(name);
  });

  it('규칙보다 긴 예전 이름은 잘라 말줄임표를 붙인다', () => {
    expect(nameTagLabel('가'.repeat(NAME_MAX_LENGTH + 5))).toBe(`${'가'.repeat(NAME_MAX_LENGTH)}…`);
  });
});

describe('이름표 상자', () => {
  it('글자 폭을 올림하고 양옆 여백을 더한다', () => {
    const box = nameTagBox({ width: 30.4, height: 13 });
    expect(box.width).toBe(31 + box.textX * 2);
    expect(box.height).toBe(NAME_TAG_HEIGHT);
  });

  it('글자를 세로 가운데 정수 위치에 둔다', () => {
    const box = nameTagBox({ width: 30, height: 12 });
    expect(Number.isInteger(box.textY)).toBe(true);
    expect(box.textY).toBe(1);
  });
});

describe('이름표 위치', () => {
  const box = { width: 40, height: NAME_TAG_HEIGHT };

  it('발 바로 아래 가운데에 둔다', () => {
    expect(nameTagPosition({ x: 180, y: 150 }, box, VIEW, 1)).toEqual({ x: 160, y: 150 + NAME_TAG_GAP });
  });

  it('화면 아래 경험치 바와 겹치지 않는다', () => {
    const at = nameTagPosition({ x: 180, y: VIEW.height - 5 }, box, VIEW, 1);
    expect(at.y + box.height).toBeLessThanOrEqual(VIEW.height - EXP_BAR_HEIGHT);
  });

  it('화면 좌우 끝을 넘지 않는다', () => {
    expect(nameTagPosition({ x: 3, y: 150 }, box, VIEW, 1).x).toBeGreaterThanOrEqual(0);
    const right = nameTagPosition({ x: VIEW.width - 3, y: 150 }, box, VIEW, 1);
    expect(right.x + box.width).toBeLessThanOrEqual(VIEW.width);
  });

  it('기기 픽셀에 맞춘다', () => {
    const at = nameTagPosition({ x: 180.37, y: 150.81 }, { width: 41, height: NAME_TAG_HEIGHT }, VIEW, 2);
    expect(Number.isInteger(at.x * 2)).toBe(true);
    expect(Number.isInteger(at.y * 2)).toBe(true);
  });
});
