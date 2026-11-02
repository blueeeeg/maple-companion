import type { PeerMove, PeerState } from './transport';

/** 위치는 1초에 5번까지만 보낸다 */
export const MOVE_INTERVAL_MS = 200;
/** 늦게 들어온 사람이 처음 볼 자리(presence)도 가끔 고쳐 둔다. presence 는 서버 한도가 broadcast 보다 빡빡하다 */
export const TRACK_REFRESH_MS = 5000;

const identityOf = (state: PeerState) =>
  JSON.stringify([state.name, state.era, state.look, state.standAction, state.walkAction, state.mount, state.chair, state.mapId]);

/** 맵 픽셀 아래 자리는 버린다. 같은 자리에 서 있는 동안 소수점만 바뀌어 보내지 않게 한다 */
export const moveOf = (state: PeerMove): PeerMove => ({
  x: Math.round(state.x),
  y: Math.round(state.y),
  facing: state.facing,
  action: state.action,
});

const sameMove = (a: PeerMove, b: PeerMove) => a.x === b.x && a.y === b.y && a.facing === b.facing && a.action === b.action;

export interface PresenceSink {
  track(state: PeerState): void;
  move(move: PeerMove): void;
}

export interface Publisher {
  /** 지금 상태. 바뀐 것만, 간격을 지켜 보낸다 */
  update(state: PeerState, now: number): void;
  /** 채널을 새로 열었으면 처음부터 다시 알린다 */
  reset(): void;
}

export function createPublisher(sink: PresenceSink, intervalMs = MOVE_INTERVAL_MS): Publisher {
  let identity = '';
  let sentMove: PeerMove | null = null;
  let sentAt = -Infinity;
  let trackedMove: PeerMove | null = null;
  let trackedAt = -Infinity;

  return {
    update(state, now) {
      const move = moveOf(state);
      const key = identityOf(state);
      if (key !== identity) {
        identity = key;
        sentMove = trackedMove = move;
        sentAt = trackedAt = now;
        sink.track({ ...state, ...move });
        return;
      }
      if (sentMove && sameMove(sentMove, move)) {
        // 멈춘 뒤에는 presence 의 자리를 마지막 자리로 맞춰 둔다
        if (trackedMove && !sameMove(trackedMove, move) && now - trackedAt >= TRACK_REFRESH_MS) {
          trackedMove = move;
          trackedAt = now;
          sink.track({ ...state, ...move });
        }
        return;
      }
      if (now - sentAt < intervalMs) return;
      sentMove = move;
      sentAt = now;
      sink.move(move);
    },
    reset() {
      identity = '';
      sentMove = trackedMove = null;
      sentAt = trackedAt = -Infinity;
    },
  };
}
