import { describe, expect, it } from 'vitest';
import { bossGaugeLayout, easeRatio, fillWidth, iconOffset } from './bossGauge';

const VIEW_WIDTH = 360;
/** HUD 윗줄 높이(화면 px) */
const HUD_HEIGHT = 26;

describe('보스 게이지 배치', () => {
  const layout = bossGaugeLayout(VIEW_WIDTH);

  it('HUD 아래에서 시작하고 화면 안에 들어간다', () => {
    expect(layout.icon.y).toBeGreaterThanOrEqual(HUD_HEIGHT);
    expect(layout.icon.x).toBeGreaterThanOrEqual(0);
    expect(layout.bar.x + layout.bar.width).toBeLessThanOrEqual(VIEW_WIDTH);
  });

  it('원작처럼 게이지 틀 윗변을 아이콘 틀 윗변에 맞추고 아이콘 바로 오른쪽에 붙인다', () => {
    expect(layout.bar.y).toBe(layout.icon.y);
    expect(layout.bar.x).toBe(layout.icon.x + 37);
  });

  it('색 띠는 틀 안쪽 칸(왼쪽 끝 2칸 뒤, 오른쪽 끝 4칸 앞, 위에서 5번째 줄)에 찬다', () => {
    expect(layout.strip.x).toBe(layout.bar.x + 2);
    expect(layout.strip.y).toBe(layout.bar.y + 5);
    expect(layout.strip.x + layout.strip.width).toBe(layout.bar.x + layout.bar.width - 4);
  });

  it('도트가 반 칸에 걸리지 않게 모든 위치가 정수다', () => {
    const values = [layout.icon, layout.bar, layout.strip].flatMap((part) => Object.values(part));
    expect(values.every(Number.isInteger)).toBe(true);
  });
});

describe('남은 HP 칸 폭', () => {
  it('비율만큼 채우고 정수로 맞춘다', () => {
    expect(fillWidth(1, 308)).toBe(308);
    expect(fillWidth(0.5, 308)).toBe(154);
    expect(fillWidth(1 / 3, 308)).toBe(103);
  });

  it('조금이라도 남았으면 한 칸은 보인다', () => {
    expect(fillWidth(0.001, 308)).toBe(1);
  });

  it('0 이하·1 이상은 잘라 낸다', () => {
    expect(fillWidth(0, 308)).toBe(0);
    expect(fillWidth(-0.2, 308)).toBe(0);
    expect(fillWidth(1.5, 308)).toBe(308);
  });
});

describe('게이지가 줄어드는 모양', () => {
  it('맞으면 바로 뚝 떨어지지 않고 실제 비율 쪽으로 미끄러진다', () => {
    const next = easeRatio(1, 0.9, 16);
    expect(next).toBeLessThan(1);
    expect(next).toBeGreaterThan(0.9);
  });

  it('잠깐 뒤에는 실제 비율에 닿는다', () => {
    let shown = 1;
    for (let frame = 0; frame < 30; frame += 1) shown = easeRatio(shown, 0.9, 16);
    expect(shown).toBe(0.9);
  });

  it('다시 차는 것(새 싸움)은 바로 맞춘다', () => {
    expect(easeRatio(0.2, 1, 16)).toBe(1);
  });

  it('시간이 안 지나면 그대로다', () => {
    expect(easeRatio(0.8, 0.5, 0)).toBe(0.8);
  });
});

describe('아이콘 위치', () => {
  it('회색 칸(6, 26칸) 가운데에 정수 위치로 둔다', () => {
    expect(iconOffset(26)).toBe(6);
    expect(iconOffset(25)).toBe(6);
    expect(iconOffset(24)).toBe(7);
  });

  it('칸보다 큰 아이콘(매그너스 27칸)은 왼쪽 위로 한 칸 넘친다', () => {
    expect(iconOffset(27)).toBe(5);
  });
});
