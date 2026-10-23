import type { Point } from '../maple/ground';
import type { Size } from './camera';

/** 화면을 짠 기준 크기. 팝업·캐릭터 선택은 이 크기 그대로 그린다 */
export const BASE_VIEW: Size = { width: 360, height: 230 };

export interface Viewport {
  /** 게임 화면·DOM 레이어가 쓰는 논리 크기(CSS px) */
  view: Size;
  /** view 를 화면에 몇 배로 늘려 보여 줄지(--ui-scale) */
  zoom: number;
}

/**
 * 창 배율(트레이 「창 크기」)에서 화면 크기. 1 이상은 캐릭터·UI 크기를 그대로 두고 맵을 넓게 보여 준다.
 * 1 아래는 360×230 을 통째로 줄인다. 창 크기는 Rust 가 반올림해서 정하니 같은 방식으로 반올림한다
 */
export function viewportFor(scale: number): Viewport {
  if (!(scale >= 1)) return { view: BASE_VIEW, zoom: scale > 0 ? scale : 1 };
  return { view: { width: Math.round(BASE_VIEW.width * scale), height: Math.round(BASE_VIEW.height * scale) }, zoom: 1 };
}

/** 기준 크기로 짠 창을 view 가운데에 둘 왼쪽 위. 정수로 내려야 글자가 기기 픽셀에 붙는다 */
export function frameOffset(view: Size): Point {
  return {
    x: Math.max(0, Math.floor((view.width - BASE_VIEW.width) / 2)),
    y: Math.max(0, Math.floor((view.height - BASE_VIEW.height) / 2)),
  };
}
