import { describe, expect, it, vi } from 'vitest';
import { noticeFor } from './notification';

// 실제 모듈은 불러올 때 window 를 본다
vi.mock('./tauri', () => ({ isTauri: false }));

describe('알림 상태 안내', () => {
  it('거절했거나 배너를 꺼 두었으면 꺼진 것으로 알린다', () => {
    expect(noticeFor({ status: 'denied', alerts: null }, false)).toBe('off');
    expect(noticeFor({ status: 'denied', alerts: true }, false)).toBe('off');
    expect(noticeFor({ status: 'authorized', alerts: false }, false)).toBe('off');
    expect(noticeFor({ status: 'provisional', alerts: false }, false)).toBe('off');
  });

  it('허용했고 배너가 뜨거나 배너 여부를 모르면 아무것도 띄우지 않는다', () => {
    expect(noticeFor({ status: 'authorized', alerts: true }, false)).toBe('ok');
    expect(noticeFor({ status: 'authorized', alerts: null }, false)).toBe('ok');
    expect(noticeFor({ status: 'ephemeral', alerts: true }, false)).toBe('ok');
  });

  it('아직 안 물었으면 물을 차례라 띄우지 않고, 묻기에 실패했으면 모르는 것으로 본다', () => {
    expect(noticeFor({ status: 'notDetermined', alerts: null }, false)).toBe('ok');
    expect(noticeFor({ status: 'notDetermined', alerts: null }, true)).toBe('unknown');
  });

  it('상태를 못 읽으면 모르는 것으로 본다', () => {
    expect(noticeFor({ status: 'unknown', alerts: null }, false)).toBe('unknown');
  });
});
