import { describe, expect, it } from 'vitest';
import { frontRange } from './skills';
import { frameAt } from './textures';

describe('프레임 딜레이 재생', () => {
  // 원작 swingO1 딜레이
  const swing = [300, 150, 350];

  it('지난 시간에 맞는 프레임을 고른다', () => {
    expect(frameAt(swing, 0, false)).toBe(0);
    expect(frameAt(swing, 299, false)).toBe(0);
    expect(frameAt(swing, 300, false)).toBe(1);
    expect(frameAt(swing, 460, false)).toBe(2);
  });

  it('한 번만 도는 동작은 끝나면 -1, 반복 동작은 처음으로 돌아간다', () => {
    expect(frameAt(swing, 800, false)).toBe(-1);
    expect(frameAt(swing, 800, true)).toBe(0);
    expect(frameAt(swing, 1100, true)).toBe(1);
  });
});

describe('스킬 사거리', () => {
  it('공격 범위 박스의 왼쪽 위 X 가 음수면 앞쪽 사거리로 본다', () => {
    expect(frontRange('Point [ X=-285, Y=-145 ]')).toBe(285);
  });

  it('범위가 없거나 캐릭터 뒤쪽에서 시작하면 사거리를 모른다', () => {
    expect(frontRange(undefined)).toBeNull();
    expect(frontRange('Point [ X=0, Y=-90 ]')).toBeNull();
  });
});
