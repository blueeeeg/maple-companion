import { describe, expect, it } from 'vitest';
import { FULL_FPS, IDLE_FPS, type SceneActivity, targetFps } from './framePolicy';

const standing: SceneActivity = {
  running: true,
  stillForMs: 2000,
  fighting: false,
  fading: false,
  cameraSettled: true,
  transientEffects: 0,
  shortestLoopDelayMs: 100,
};

describe('targetFps', () => {
  it('멈춘 화면은 그리지 않는다', () => {
    expect(targetFps({ ...standing, running: false })).toBe(0);
  });

  it('제자리에 서서 포털만 돌면 낮춘다', () => {
    expect(targetFps(standing)).toBe(IDLE_FPS);
  });

  it('윗층 포털에 세워 둔 동안처럼 끝이 없는 정지도 낮춘다', () => {
    expect(targetFps({ ...standing, stillForMs: Infinity, shortestLoopDelayMs: Infinity })).toBe(IDLE_FPS);
  });

  it('걷기 시작하기 한 프레임 전부터 올려서 첫 걸음이 튀지 않는다', () => {
    expect(targetFps({ ...standing, stillForMs: 1000 / IDLE_FPS })).toBe(FULL_FPS);
    expect(targetFps({ ...standing, stillForMs: 0 })).toBe(FULL_FPS);
  });

  it('사냥·페이드·카메라 이동·이펙트가 있으면 그대로 그린다', () => {
    expect(targetFps({ ...standing, fighting: true })).toBe(FULL_FPS);
    expect(targetFps({ ...standing, fading: true })).toBe(FULL_FPS);
    expect(targetFps({ ...standing, cameraSettled: false })).toBe(FULL_FPS);
    expect(targetFps({ ...standing, transientEffects: 1 })).toBe(FULL_FPS);
  });

  it('낮춘 fps 보다 짧은 딜레이의 프레임이 돌면 낮추지 않는다', () => {
    expect(targetFps({ ...standing, shortestLoopDelayMs: 90 })).toBe(FULL_FPS);
  });
});
