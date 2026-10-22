import { describe, expect, it, vi } from 'vitest';
import { retry } from './bossMob';

const noWait = () => Promise.resolve();

describe('retry', () => {
  it('처음에 받으면 다시 받지 않는다', async () => {
    const load = vi.fn(async () => 'ok');
    await expect(retry(load, 3, 100, noWait)).resolves.toBe('ok');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('실패하면 받을 때까지 다시 받는다', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('520')).mockResolvedValueOnce('ok');
    await expect(retry(load, 3, 100, noWait)).resolves.toBe('ok');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('정한 횟수를 다 실패하면 마지막 에러로 실패한다', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('첫째')).mockRejectedValueOnce(new Error('둘째'));
    await expect(retry(load, 2, 100, noWait)).rejects.toThrow('둘째');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('실패할 때마다 조금씩 더 오래 기다린다', async () => {
    const wait = vi.fn(noWait);
    const load = vi.fn().mockRejectedValue(new Error('520'));
    await expect(retry(load, 3, 100, wait)).rejects.toThrow('520');
    expect(wait.mock.calls).toEqual([[100], [200]]);
  });
});
