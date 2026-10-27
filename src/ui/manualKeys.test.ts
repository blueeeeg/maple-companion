import { describe, expect, it } from 'vitest';
import { keyAction } from './manualKeys';

describe('직접 조작 키', () => {
  it('방향키·Space·Alt·A·Esc 를 읽고 나머지는 무시한다', () => {
    expect(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].map(keyAction)).toEqual(['left', 'right', 'up', 'down']);
    expect(['Space', 'AltLeft', 'AltRight'].map(keyAction)).toEqual(['jump', 'jump', 'jump']);
    expect(keyAction('KeyA')).toBe('attack');
    expect(keyAction('Escape')).toBe('exit');
    expect(keyAction('KeyS')).toBeNull();
    expect(keyAction('Enter')).toBeNull();
  });
});
