import { NAME_MAX_LENGTH } from '../game/characters';
import type { Point } from '../maple/ground';
import type { Size } from './camera';

/** 글자 양옆 여백(화면 px) */
export const NAME_TAG_PAD_X = 3;
export const NAME_TAG_HEIGHT = 14;
/** 발과 이름표 위끝 사이 */
export const NAME_TAG_GAP = 2;
/** 화면 아래 DOM 경험치 바 높이(styles.css `.exp`). 이름표가 그 밑으로 들어가지 않게 한다 */
export const EXP_BAR_HEIGHT = 14;
const BOTTOM_MARGIN = 2;
const SIDE_MARGIN = 2;

/** 이름표에 쓸 글자. 비었으면 null(이름표를 숨긴다). 예전 저장에 규칙보다 긴 이름이 있어도 이름표가 화면을 덮지 않게 자른다 */
export function nameTagLabel(name: string | null | undefined): string | null {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return null;
  const chars = Array.from(trimmed);
  return chars.length > NAME_MAX_LENGTH ? `${chars.slice(0, NAME_MAX_LENGTH).join('')}…` : trimmed;
}

/** 글자 크기에서 상자 크기와 상자 안 글자 위치. 정수로 맞춰야 글자가 기기 픽셀에 붙는다 */
export function nameTagBox(text: Size): { width: number; height: number; textX: number; textY: number } {
  const width = Math.ceil(text.width) + NAME_TAG_PAD_X * 2;
  return { width, height: NAME_TAG_HEIGHT, textX: NAME_TAG_PAD_X, textY: Math.round((NAME_TAG_HEIGHT - text.height) / 2) };
}

/**
 * 이름표 왼쪽 위(화면 px). 발 바로 아래 가운데에 두되 화면 좌우 끝과 경험치 바를 넘지 않게 밀고,
 * 기기 픽셀에 맞춰 글자가 흐려지지 않게 한다
 */
export function nameTagPosition(feet: Point, box: Size, view: Size, resolution: number): Point {
  const snap = (value: number) => Math.round(value * resolution) / resolution;
  const maxX = view.width - SIDE_MARGIN - box.width;
  const maxY = view.height - EXP_BAR_HEIGHT - BOTTOM_MARGIN - box.height;
  const x = Math.max(SIDE_MARGIN, Math.min(maxX, feet.x - box.width / 2));
  const y = Math.min(maxY, feet.y + NAME_TAG_GAP);
  return { x: snap(x), y: snap(y) };
}
