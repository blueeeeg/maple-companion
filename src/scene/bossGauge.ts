import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { BossGaugeTextures } from '../maple/bossMob';

/** HUD 윗줄(26px) 바로 아래 */
const TOP = 29;
const LEFT = 4;
const RIGHT_GAP = 4;
// 원작 MobGage 그림 크기·안쪽 칸 위치(px)
const ICON_FRAME = 37;
/** 아이콘 틀 안쪽 회색 칸은 (6, 6) 에서 26칸 */
const ICON_INNER_OFFSET = 6;
const ICON_INNER = 26;
const BAR_HEIGHT = 20;
const LEFT_CAP = 3;
const RIGHT_CAP = 5;
/** 틀 안쪽은 왼쪽 끝 그림의 2번째 칸부터 오른쪽 끝 그림의 0번째 칸까지, 위아래로는 4~15번째 줄이다. 10px 색 띠를 5번째 줄부터 채운다 */
const INNER_LEFT = 2;
const INNER_RIGHT = 4;
const STRIP_TOP = 5;
const STRIP_HEIGHT = 10;
/** 원작처럼 맞자마자 줄되, 한 대에 한 칸씩 뚝 끊겨 보이지 않게 짧게 미끄러진다 */
const SHRINK_MS = 70;

export interface BossGaugeLayout {
  icon: { x: number; y: number };
  bar: { x: number; y: number; width: number };
  /** 색 띠가 차는 칸. 폭은 HP 가 가득일 때 길이다 */
  strip: { x: number; y: number; width: number };
}

/**
 * 원작은 게이지 틀 윗변을 아이콘 틀 윗변에 맞추고 틀을 아이콘 바로 오른쪽에 붙인다.
 * HP 줄 수 표시(backgrnd5~12)의 원점이 아이콘 틀 기준 (33~36, 18~21) 이라 높이 20 인 틀 바로 밑에 오는 것도 이 배치다
 */
export function bossGaugeLayout(viewWidth: number): BossGaugeLayout {
  const barX = LEFT + ICON_FRAME;
  const barWidth = viewWidth - barX - RIGHT_GAP;
  return {
    icon: { x: LEFT, y: TOP },
    bar: { x: barX, y: TOP, width: barWidth },
    strip: { x: barX + INNER_LEFT, y: TOP + STRIP_TOP, width: barWidth - INNER_LEFT - INNER_RIGHT },
  };
}

/** 남은 HP 칸 폭(px). 도트가 반 칸에 걸리지 않게 정수로 맞추고, 조금이라도 남았으면 한 칸은 보인다 */
export function fillWidth(ratio: number, stripWidth: number): number {
  const clamped = Math.min(1, Math.max(0, ratio));
  if (clamped === 0) return 0;
  return Math.max(1, Math.round(stripWidth * clamped));
}

/** 보이는 비율을 실제 비율 쪽으로 옮긴다. 줄 때만 미끄러지고, 다시 차는 것(새 싸움)은 바로 맞춘다 */
export function easeRatio(shown: number, target: number, dtMs: number): number {
  if (target >= shown) return target;
  const next = target + (shown - target) * Math.exp(-dtMs / SHRINK_MS);
  return next - target < 0.001 ? target : next;
}

/** 회색 칸 가운데에 둘 위치. 홀수 크기 아이콘이 반 칸에 걸려 흐려지지 않게 정수로 내린다 */
export function iconOffset(size: number): number {
  return ICON_INNER_OFFSET + Math.floor((ICON_INNER - size) / 2);
}

export interface BossGauge {
  readonly node: Container;
  /**
   * textures 를 못 받았으면 단색 게이지로 대신 그린다. fallbackIcon 은 원작 아이콘이 없는 보스에 쓸 그림.
   * 싸우는 중에 다시 불러 그림만 바꿔 끼워도 HP 비율은 그대로다
   */
  show(textures: BossGaugeTextures | null, fallbackIcon: Texture): void;
  /** 0~1 */
  setRatio(ratio: number): void;
  update(dtMs: number): void;
  hide(): void;
}

export function createBossGauge(viewWidth: number): BossGauge {
  const node = new Container();
  node.visible = false;
  node.eventMode = 'none';
  const { icon: iconAt, bar, strip } = bossGaugeLayout(viewWidth);
  let fill: Sprite | Graphics | null = null;
  let target = 1;
  let shown = 1;

  const sprite = (texture: Texture, x: number, y: number, width?: number) => {
    const placed = new Sprite(texture);
    placed.position.set(x, y);
    if (width !== undefined) placed.width = width;
    node.addChild(placed);
    return placed;
  };

  function placeIcon(texture: Texture, fitted: boolean): void {
    const icon = new Sprite(texture);
    // 원작 아이콘은 원본 크기 그대로, 대신 쓰는 보스 그림은 칸에 맞춰 줄인다
    const scale = fitted ? Math.min(1, (ICON_INNER - 2) / Math.max(texture.width, texture.height)) : 1;
    icon.scale.set(scale);
    icon.position.set(
      iconAt.x + iconOffset(Math.round(texture.width * scale)),
      iconAt.y + iconOffset(Math.round(texture.height * scale)),
    );
    node.addChild(icon);
  }

  function applyFill(): void {
    if (!fill) return;
    const width = fillWidth(shown, strip.width);
    fill.width = width;
    fill.visible = width > 0;
  }

  return {
    node,
    show(textures, fallbackIcon) {
      node.removeChildren().forEach((child) => child.destroy());
      if (textures) {
        sprite(textures.iconFrame, iconAt.x, iconAt.y);
        placeIcon(textures.icon ?? fallbackIcon, textures.icon === null);
        sprite(textures.left, bar.x, bar.y);
        sprite(textures.middle, bar.x + LEFT_CAP, bar.y, bar.width - LEFT_CAP - RIGHT_CAP);
        sprite(textures.right, bar.x + bar.width - RIGHT_CAP, bar.y);
        sprite(textures.background, strip.x, strip.y, strip.width);
        fill = sprite(textures.fill, strip.x, strip.y, strip.width);
      } else {
        node.addChild(
          new Graphics()
            .rect(iconAt.x, iconAt.y, ICON_FRAME, ICON_FRAME)
            .fill({ color: 0x222222, alpha: 0.8 })
            .rect(bar.x, bar.y, bar.width, BAR_HEIGHT)
            .fill({ color: 0x222222, alpha: 0.8 }),
        );
        placeIcon(fallbackIcon, true);
        fill = new Graphics().rect(0, 0, strip.width, STRIP_HEIGHT).fill(0xee2200);
        fill.position.set(strip.x, strip.y);
        node.addChild(fill);
      }
      applyFill();
      node.visible = true;
    },
    setRatio(ratio) {
      target = Math.min(1, Math.max(0, ratio));
      shown = easeRatio(shown, target, 0);
      applyFill();
    },
    update(dtMs) {
      if (shown === target) return;
      shown = easeRatio(shown, target, dtMs);
      applyFill();
    },
    hide() {
      node.visible = false;
      node.removeChildren().forEach((child) => child.destroy());
      fill = null;
      target = 1;
      shown = 1;
    },
  };
}
