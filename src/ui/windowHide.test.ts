import { describe, expect, it } from 'vitest';
import { type ShortcutKey, createHintOnce, hideHint, hideKeyAction } from './windowHide';

const key = (change: Partial<ShortcutKey>): ShortcutKey => ({
  code: 'KeyW',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...change,
});

describe('창 숨기기 단축키', () => {
  it('macOS 는 ⌘W, Windows 는 Ctrl+W 만 숨긴다', () => {
    expect(hideKeyAction(key({ metaKey: true }), { mac: true, typing: false })).toBe('hide');
    expect(hideKeyAction(key({ ctrlKey: true }), { mac: true, typing: false })).toBeNull();
    expect(hideKeyAction(key({ ctrlKey: true }), { mac: false, typing: false })).toBe('hide');
    expect(hideKeyAction(key({ metaKey: true }), { mac: false, typing: false })).toBeNull();
  });

  it('W 가 아니거나 다른 조합 키가 같이 눌리면 상관없다', () => {
    expect(hideKeyAction(key({}), { mac: true, typing: false })).toBeNull();
    expect(hideKeyAction(key({ code: 'KeyQ', metaKey: true }), { mac: true, typing: false })).toBeNull();
    expect(hideKeyAction(key({ metaKey: true, shiftKey: true }), { mac: true, typing: false })).toBeNull();
    expect(hideKeyAction(key({ metaKey: true, altKey: true }), { mac: true, typing: false })).toBeNull();
    expect(hideKeyAction(key({ metaKey: true, ctrlKey: true }), { mac: true, typing: false })).toBeNull();
  });

  it('글을 쓰는 중에는 숨기지 않고 키만 막는다', () => {
    expect(hideKeyAction(key({ metaKey: true }), { mac: true, typing: true })).toBe('swallow');
    expect(hideKeyAction(key({ ctrlKey: true }), { mac: false, typing: true })).toBe('swallow');
  });
});

describe('처음 숨길 때 안내', () => {
  const memoryStorage = () => {
    const values = new Map<string, string>();
    return { getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => void values.set(name, value) };
  };

  it('한 번만 띄우고 저장소에 남긴다', () => {
    const storage = memoryStorage();
    const first = createHintOnce(() => storage);
    expect(first()).toBe(true);
    expect(first()).toBe(false);
    // 다음 실행도 저장소를 보고 다시 띄우지 않는다
    expect(createHintOnce(() => storage)()).toBe(false);
  });

  it('저장소가 막혀도 한 번 띄우고 이번 실행 동안은 다시 띄우지 않는다', () => {
    const first = createHintOnce(() => {
      throw new Error('blocked');
    });
    expect(first()).toBe(true);
    expect(first()).toBe(false);
  });

  it('다시 여는 곳을 OS 에 맞게 적는다', () => {
    expect(hideHint(true)).toBe('메뉴바의 버섯 아이콘을 누르면 다시 보여요');
    expect(hideHint(false)).toBe('작업 표시줄 오른쪽 아이콘을 누르면 다시 보여요');
  });
});
