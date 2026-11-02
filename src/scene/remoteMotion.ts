import type { Point } from '../maple/ground';

/** 상대는 위치를 1초에 5번까지 보낸다. 그 한 간격만큼 늦게 따라가면 받은 두 자리 사이를 이어 그릴 수 있다 */
export const REMOTE_DELAY_MS = 200;
/** 이보다 멀리 옮겼으면(포털·맵 이동) 걸어가지 않고 바로 옮긴다(맵 픽셀) */
export const REMOTE_SNAP_DISTANCE = 400;
const MAX_SAMPLES = 8;

interface Sample extends Point {
  at: number;
}

export interface RemoteMotion {
  /** 받은 자리. now 는 받은 때의 이 기기 시각 */
  push(at: Point, now: number): void;
  /** 그릴 자리 */
  sample(now: number): Point;
  /** 받은 마지막 자리에 닿았다 */
  settled(now: number): boolean;
}

export function createRemoteMotion(start: Point, now: number): RemoteMotion {
  let samples: Sample[] = [{ x: start.x, y: start.y, at: now - REMOTE_DELAY_MS }];
  const point = ({ x, y }: Sample): Point => ({ x, y });
  return {
    push(at, now) {
      const last = samples[samples.length - 1];
      if (Math.hypot(at.x - last.x, at.y - last.y) > REMOTE_SNAP_DISTANCE) {
        samples = [{ x: at.x, y: at.y, at: now - REMOTE_DELAY_MS }];
        return;
      }
      // 한동안 멈춰 있다 다시 움직이면 멈춘 자리에서 한 간격 전에 걷기 시작한 것으로 친다. 아니면 첫걸음이 순간이동한다
      if (now - last.at > REMOTE_DELAY_MS * 1.5) samples.push({ x: last.x, y: last.y, at: now - REMOTE_DELAY_MS });
      samples.push({ x: at.x, y: at.y, at: now });
      if (samples.length > MAX_SAMPLES) samples = samples.slice(-MAX_SAMPLES);
    },
    sample(now) {
      const t = now - REMOTE_DELAY_MS;
      const last = samples[samples.length - 1];
      if (t >= last.at) return point(last);
      if (t <= samples[0].at) return point(samples[0]);
      const next = samples.findIndex((each) => each.at > t);
      const a = samples[next - 1];
      const b = samples[next];
      const ratio = (t - a.at) / (b.at - a.at);
      return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
    },
    settled: (now) => now - REMOTE_DELAY_MS >= samples[samples.length - 1].at,
  };
}
