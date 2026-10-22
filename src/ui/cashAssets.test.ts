import { describe, expect, it } from 'vitest';
import { PRIORITY, createQueue } from './cashAssets';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
};
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('받기 줄', () => {
  it('한 번에 limit 개까지만 돌린다', async () => {
    const queue = createQueue(2);
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    gates.forEach((gate, index) =>
      queue(() => {
        started.push(index);
        return gate.promise;
      }),
    );
    await flush();
    expect(started).toEqual([0, 1]);
    gates[0].resolve();
    await flush();
    expect(started).toEqual([0, 1, 2]);
  });

  it('기다리는 것은 우선순위가 큰 것부터, 같으면 먼저 온 것부터 꺼낸다', async () => {
    const queue = createQueue(1);
    const gate = deferred();
    const order: string[] = [];
    const job = (name: string) => () => {
      order.push(name);
      return Promise.resolve();
    };
    queue(() => gate.promise);
    const all = Promise.all([
      queue(job('다음 페이지'), PRIORITY.prefetch),
      queue(job('이 페이지 1'), PRIORITY.page),
      queue(job('미리보기'), PRIORITY.preview),
      queue(job('이 페이지 2'), PRIORITY.page),
    ]);
    gate.resolve();
    await all;
    expect(order).toEqual(['미리보기', '이 페이지 1', '이 페이지 2', '다음 페이지']);
  });

  it('실패한 일도 자리를 비워 다음 일을 돌린다', async () => {
    const queue = createQueue(1);
    const failed = queue(() => Promise.reject(new Error('503')));
    const next = queue(() => Promise.resolve('ok'));
    await expect(failed).rejects.toThrow('503');
    await expect(next).resolves.toBe('ok');
  });
});
