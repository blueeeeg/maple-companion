import { describe, expect, it } from 'vitest';
import { MOVE_INTERVAL_MS, TRACK_REFRESH_MS, createPublisher } from './presence';
import type { PeerMove, PeerState } from './transport';

const STATE: PeerState = {
  name: '단풍이',
  era: 'current',
  look: [2000, 12000, 20000, 30000],
  standAction: 'stand1',
  walkAction: 'walk1',
  mount: null,
  chair: null,
  mapId: 100000000,
  x: 100,
  y: 200,
  facing: 1,
  action: 'stand',
};

function recorder() {
  const tracks: PeerState[] = [];
  const moves: PeerMove[] = [];
  return { tracks, moves, sink: { track: (state: PeerState) => tracks.push(state), move: (move: PeerMove) => moves.push(move) } };
}

describe('내 자리 알리기', () => {
  it('처음에는 겉모습과 자리를 함께 알린다', () => {
    const { tracks, moves, sink } = recorder();
    createPublisher(sink).update(STATE, 0);
    expect(tracks).toEqual([STATE]);
    expect(moves).toEqual([]);
  });

  it('바뀐 것이 없으면 보내지 않는다', () => {
    const { tracks, moves, sink } = recorder();
    const publisher = createPublisher(sink);
    for (let now = 0; now < 3000; now += 100) publisher.update(STATE, now);
    expect(tracks).toHaveLength(1);
    expect(moves).toHaveLength(0);
  });

  it('맵 픽셀 아래로만 움직이면 보내지 않는다', () => {
    const { moves, sink } = recorder();
    const publisher = createPublisher(sink);
    publisher.update(STATE, 0);
    publisher.update({ ...STATE, x: 100.3 }, 1000);
    expect(moves).toHaveLength(0);
  });

  it('계속 움직여도 1초에 5번까지만 보낸다', () => {
    const { moves, sink } = recorder();
    const publisher = createPublisher(sink);
    publisher.update(STATE, 0);
    // 60fps 로 매 프레임 자리가 바뀌어도
    for (let frame = 1; frame <= 60; frame += 1) publisher.update({ ...STATE, x: 100 + frame, action: 'walk' }, (frame * 1000) / 60);
    expect(moves.length).toBeLessThanOrEqual(5);
    expect(moves.length).toBeGreaterThanOrEqual(4);
    expect(MOVE_INTERVAL_MS).toBe(200);
  });

  it('방향·동작만 바뀌어도 알린다', () => {
    const { moves, sink } = recorder();
    const publisher = createPublisher(sink);
    publisher.update(STATE, 0);
    publisher.update({ ...STATE, facing: -1 }, 300);
    publisher.update({ ...STATE, facing: -1, action: 'sit' }, 600);
    expect(moves).toEqual([
      { x: 100, y: 200, facing: -1, action: 'stand' },
      { x: 100, y: 200, facing: -1, action: 'sit' },
    ]);
  });

  it('겉모습이나 맵이 바뀌면 간격을 기다리지 않고 presence 를 새로 알린다', () => {
    const { tracks, sink } = recorder();
    const publisher = createPublisher(sink);
    publisher.update(STATE, 0);
    publisher.update({ ...STATE, look: [...STATE.look, 1302000] }, 10);
    publisher.update({ ...STATE, look: [...STATE.look, 1302000], mapId: 104000000 }, 20);
    expect(tracks.map((each) => [each.look.length, each.mapId])).toEqual([
      [4, 100000000],
      [5, 100000000],
      [5, 104000000],
    ]);
  });

  it('멈춘 뒤에는 늦게 들어온 사람이 볼 자리를 가끔 고쳐 둔다', () => {
    const { tracks, sink } = recorder();
    const publisher = createPublisher(sink);
    publisher.update(STATE, 0);
    publisher.update({ ...STATE, x: 300 }, 300);
    publisher.update({ ...STATE, x: 300 }, 1000);
    expect(tracks).toHaveLength(1);
    publisher.update({ ...STATE, x: 300 }, TRACK_REFRESH_MS + 1);
    expect(tracks).toHaveLength(2);
    expect(tracks[1].x).toBe(300);
  });

  it('채널을 새로 열면 처음부터 다시 알린다', () => {
    const { tracks, sink } = recorder();
    const publisher = createPublisher(sink);
    publisher.update(STATE, 0);
    publisher.reset();
    publisher.update(STATE, 10);
    expect(tracks).toHaveLength(2);
  });
});
