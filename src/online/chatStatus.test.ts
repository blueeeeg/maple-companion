import { describe, expect, it } from 'vitest';
import { chatButtonLabel, dotState, onlineNamesLine } from './chatStatus';

describe('💬 버튼 점', () => {
  it('상태를 초록·호박·회색으로 옮긴다', () => {
    expect(dotState('online')).toBe('online');
    expect(dotState('connecting')).toBe('connecting');
    expect(dotState('offline')).toBe('offline');
    expect(dotState('locked')).toBe('offline');
    expect(dotState('unconfigured')).toBe('offline');
  });

  it('라벨에 상태가 들어간다', () => {
    expect(chatButtonLabel('online')).toBe('채팅 · 연결됨');
    expect(chatButtonLabel('locked')).toBe('채팅 · 입장하기');
    expect(chatButtonLabel('offline')).toBe('채팅 · 연결 안 됨');
    expect(chatButtonLabel('unconfigured')).toBe('채팅 · 연결 안 됨');
    expect(chatButtonLabel('connecting')).toBe('채팅 · 연결 중');
  });
});

describe('접속 중 줄', () => {
  it('이름을 쉼표로 잇는다', () => {
    expect(onlineNamesLine(['단풍이', '주황버섯'])).toBe('접속 중 · 단풍이, 주황버섯');
  });

  it('많으면 앞 몇 명만 두고 외 N명으로 줄인다', () => {
    expect(onlineNamesLine(['a', 'b', 'c', 'd', 'e', 'f'])).toBe('접속 중 · a, b, c, d 외 2명');
    expect(onlineNamesLine(['a', 'b', 'c', 'd'])).toBe('접속 중 · a, b, c, d');
  });

  it('이름이 비면 모험가로 보이고 아무도 없으면 빈 줄이다', () => {
    expect(onlineNamesLine(['', '단풍이'])).toBe('접속 중 · 모험가, 단풍이');
    expect(onlineNamesLine([])).toBe('');
  });
});
