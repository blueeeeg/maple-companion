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

export interface BossGauge {
  readonly node: Container;
  /** textures 를 못 받았으면 단색 게이지로 대신 그린다. fallbackIcon 은 원작 아이콘이 없는 보스에 쓸 그림 */
  show(textures: BossGaugeTextures | null, fallbackIcon: Texture): void;
  /** 0~1 */
  setRatio(ratio: number): void;
  hide(): void;
}

export function createBossGauge(viewWidth: number): BossGauge {
  const node = new Container();
  node.visible = false;
  node.eventMode = 'none';
  const barX = LEFT + ICON_FRAME + 1;
  const barY = TOP + Math.floor((ICON_FRAME - BAR_HEIGHT) / 2);
  const barWidth = viewWidth - barX - RIGHT_GAP;
  const innerWidth = barWidth - INNER_LEFT - INNER_RIGHT;
  let fill: Sprite | Graphics | null = null;

  const sprite = (texture: Texture, x: number, y: number, width?: number) => {
    const placed = new Sprite(texture);
    placed.position.set(x, y);
    if (width !== undefined) placed.width = width;
    node.addChild(placed);
    return placed;
  };

  function placeIcon(texture: Texture, fitted: boolean): void {
    const icon = new Sprite(texture);
    icon.anchor.set(0.5);
    // 원작 아이콘(25×25)은 그대로, 대신 쓰는 보스 그림은 칸에 맞춰 줄인다
    if (fitted) icon.scale.set(Math.min(1, (ICON_INNER - 2) / Math.max(texture.width, texture.height)));
    icon.position.set(LEFT + ICON_INNER_OFFSET + ICON_INNER / 2, TOP + ICON_INNER_OFFSET + ICON_INNER / 2);
    node.addChild(icon);
  }

  return {
    node,
    show(textures, fallbackIcon) {
      node.removeChildren().forEach((child) => child.destroy());
      if (textures) {
        sprite(textures.iconFrame, LEFT, TOP);
        placeIcon(textures.icon ?? fallbackIcon, textures.icon === null);
        sprite(textures.left, barX, barY);
        sprite(textures.middle, barX + LEFT_CAP, barY, barWidth - LEFT_CAP - RIGHT_CAP);
        sprite(textures.right, barX + barWidth - RIGHT_CAP, barY);
        sprite(textures.background, barX + INNER_LEFT, barY + STRIP_TOP, innerWidth);
        fill = sprite(textures.fill, barX + INNER_LEFT, barY + STRIP_TOP, innerWidth);
      } else {
        node.addChild(
          new Graphics()
            .rect(LEFT, TOP, ICON_FRAME, ICON_FRAME)
            .fill({ color: 0x222222, alpha: 0.8 })
            .rect(barX, barY, barWidth, BAR_HEIGHT)
            .fill({ color: 0x222222, alpha: 0.8 }),
        );
        placeIcon(fallbackIcon, true);
        fill = new Graphics().rect(0, 0, innerWidth, STRIP_HEIGHT).fill(0xee2200);
        fill.position.set(barX + INNER_LEFT, barY + STRIP_TOP);
        node.addChild(fill);
      }
      node.visible = true;
    },
    setRatio(ratio) {
      if (!fill) return;
      const clamped = Math.min(1, Math.max(0, ratio));
      fill.width = Math.round(innerWidth * clamped);
      fill.visible = clamped > 0;
    },
    hide() {
      node.visible = false;
      node.removeChildren().forEach((child) => child.destroy());
      fill = null;
    },
  };
}
