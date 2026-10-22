import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapBgmUrl } from '../maple/api';
import { BGM_RETRY_MS, createBgm, shouldPlayBgm } from './bgm';

/** 받은 주소와 재생 여부만 남기는 audio. 오류는 테스트가 직접 낸다 */
class FakeAudio extends EventTarget {
  loads: string[] = [];
  paused = true;
  loop = false;
  volume = 1;
  private current = '';

  get src() {
    return this.current;
  }
  set src(url: string) {
    this.current = url;
    this.loads.push(url);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  fail() {
    this.dispatchEvent(new Event('error'));
  }
}

const HENESYS = 100000000;
const ELLINIA = 101000000;

function setup() {
  const audio = new FakeAudio();
  const bgm = createBgm(audio as unknown as HTMLAudioElement, new EventTarget());
  return { audio, bgm };
}

describe('BGM', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('곡을 못 받으면 잠시 뒤 같은 곡을 다시 받아 튼다', () => {
    const { audio, bgm } = setup();
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    audio.fail();

    vi.advanceTimersByTime(BGM_RETRY_MS - 1);
    expect(audio.loads).toEqual([mapBgmUrl(HENESYS)]);
    vi.advanceTimersByTime(1);
    expect(audio.loads).toEqual([mapBgmUrl(HENESYS), mapBgmUrl(HENESYS)]);
    expect(audio.paused).toBe(false);
  });

  it('다시 받아도 또 실패하면 계속 다시 받는다', () => {
    const { audio, bgm } = setup();
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    audio.fail();
    vi.advanceTimersByTime(BGM_RETRY_MS);
    audio.fail();
    vi.advanceTimersByTime(BGM_RETRY_MS);
    expect(audio.loads).toHaveLength(3);
  });

  it('다시 받기 전에 다른 맵으로 옮기면 실패한 곡을 다시 받지 않는다', () => {
    const { audio, bgm } = setup();
    bgm.setEnabled(true);
    bgm.setMap(HENESYS);
    audio.fail();
    bgm.setMap(ELLINIA);
    vi.advanceTimersByTime(BGM_RETRY_MS);
    expect(audio.loads).toEqual([mapBgmUrl(HENESYS), mapBgmUrl(ELLINIA)]);
  });

  it('소리를 꺼 둔 동안 다시 받으면 틀지 않는다', () => {
    const { audio, bgm } = setup();
    bgm.setMap(HENESYS);
    audio.fail();
    vi.advanceTimersByTime(BGM_RETRY_MS);
    expect(audio.loads).toHaveLength(2);
    expect(audio.paused).toBe(true);
  });
});

describe('shouldPlayBgm', () => {
  const base = { muted: false, volume: 0.5, screen: 'map' as const, windowVisible: true };
  it('지도 화면에서 소리가 켜져 있으면 재생한다', () => expect(shouldPlayBgm(base)).toBe(true));
  it('창이 숨겨져도 재생한다', () => expect(shouldPlayBgm({ ...base, windowVisible: false })).toBe(true));
  it('음소거나 음량 0 이면 멈춘다', () => {
    expect(shouldPlayBgm({ ...base, muted: true })).toBe(false);
    expect(shouldPlayBgm({ ...base, volume: 0 })).toBe(false);
  });
  it('지도 밖 화면에서는 멈춘다', () => {
    for (const screen of ['select', 'shop', 'settings'] as const) expect(shouldPlayBgm({ ...base, screen })).toBe(false);
  });
});
