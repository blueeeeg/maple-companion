// 스킬 이펙트 프레임 딜레이가 60ms 라서 15fps 로는 프레임이 빠진다
export const FULL_FPS = 30;
/** 서 있을 때. 늘 도는 포털 프레임(100ms)이 한 장도 빠지지 않는 가장 낮은 값이다 */
export const IDLE_FPS = 10;

export interface SceneActivity {
  running: boolean;
  /** 캐릭터가 이만큼 더 제자리에 서 있는다. 걷기·사냥·스킬 동작 중이면 0 */
  stillForMs: number;
  /** 몬스터·보스와 싸우거나 몬스터를 받는 중 */
  fighting: boolean;
  fading: boolean;
  cameraSettled: boolean;
  /** 포털처럼 늘 도는 것을 뺀, 잠깐 떠 있는 이펙트(대미지 숫자·배너·메소 등) 수 */
  transientEffects: number;
  /** 서 있는 동안에도 도는 애니메이션(캐릭터 서기·포털)의 가장 짧은 프레임 딜레이 */
  shortestLoopDelayMs: number;
}

/** 0 이면 그리지 않는다. 낮춘 fps 로도 원작 딜레이의 프레임이 빠지지 않을 때만 낮춘다 */
export function targetFps(scene: SceneActivity): number {
  if (!scene.running) return 0;
  const idleFrameMs = 1000 / IDLE_FPS;
  const idle =
    scene.stillForMs > idleFrameMs &&
    !scene.fighting &&
    !scene.fading &&
    scene.cameraSettled &&
    scene.transientEffects === 0 &&
    scene.shortestLoopDelayMs >= idleFrameMs;
  return idle ? IDLE_FPS : FULL_FPS;
}
