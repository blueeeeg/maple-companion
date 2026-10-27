import type { MapMob } from '../maple/api';
import type { Point } from '../maple/ground';

// 직접 조작 모드에서 맵의 실제 몬스터 자리(맵 정보 mobs)에 몬스터를 세우고, 잡히면 그 자리에 다시 나오게 한다. 그리기와 따로 둔다

export type MapLife = MapMob;

/** 한 맵에 세우는 몬스터 수 상한. 원작 맵은 30마리 넘는 곳도 있어 그리는 부담을 막는다 */
export const FIELD_MOB_CAP = 24;
/** 몬스터 한 마리를 잡는 데 드는 타격 수(최소·최대). 자동 사냥(3~5)보다 적게 둬 여러 마리를 쓸어 담는 맛을 낸다 */
export const FIELD_MOB_HITS = [2, 3] as const;
/** 스킬 데이터에 대상 수가 없을 때 한 번에 때리는 몬스터 수 */
export const DEFAULT_MOB_COUNT = 3;
/** 스킬 범위 상자의 위아래. 발 기준으로 위로 ABOVE, 아래로 BELOW 안의 몬스터만 맞는다 */
export const HIT_ABOVE = 80;
export const HIT_BELOW = 30;
/** 캐릭터 등 뒤로도 이만큼은 맞는다. 몸에 겹친 몬스터를 못 때리지 않게 한다 */
export const HIT_BEHIND = 15;

/** 숨은 몬스터는 빼고, 상한보다 많으면 맵 전체에 고르게 남긴다 */
export function spawnPoints(mobs: MapLife[], cap = FIELD_MOB_CAP): MapLife[] {
  const visible = mobs.filter((mob) => !mob.hidden);
  if (visible.length <= cap) return visible;
  return Array.from({ length: cap }, (_, index) => visible[Math.floor((index * visible.length) / cap)]);
}

/**
 * 몬스터 자리마다 살아 있는지와 잡힌 시각. 잡힌 자리는 respawnMs 가 지나면 다시 나온다.
 * 시각은 화면이 돌아간 시간이라 창을 숨긴 동안에는 흐르지 않는다
 */
export function createRespawnTable(count: number) {
  const killedAt: (number | null)[] = Array.from({ length: count }, () => null);
  return {
    alive: (index: number) => killedAt[index] === null,
    kill(index: number, nowMs: number): void {
      killedAt[index] = nowMs;
    },
    /** 다시 나올 자리를 살려 두고 그 번호를 돌려준다 */
    revive(nowMs: number, respawnMs: number): number[] {
      const due: number[] = [];
      killedAt.forEach((at, index) => {
        if (at !== null && nowMs - at >= respawnMs) {
          killedAt[index] = null;
          due.push(index);
        }
      });
      return due;
    },
  };
}

export interface Patrol {
  x: number;
  minX: number;
  maxX: number;
  direction: -1 | 1;
  moving: boolean;
  /** 지금 걷기·서기를 이만큼 더 한다 */
  leftMs: number;
}

/** 순찰 범위는 원작 walkArea 와 몬스터가 선 발판이 겹치는 곳이다 */
export function createPatrol(life: MapLife, platform: { minX: number; maxX: number }, random = Math.random): Patrol {
  const minX = Math.max(platform.minX, life.walkAreaX1 ?? -Infinity);
  const maxX = Math.min(platform.maxX, life.walkAreaX2 ?? Infinity);
  const low = Math.min(minX, life.x);
  const high = Math.max(maxX, life.x);
  return { x: life.x, minX: low, maxX: high, direction: random() < 0.5 ? -1 : 1, moving: false, leftMs: random() * 2000 };
}

const MOVE_MS = [1500, 4000] as const;
const STAND_MS = [800, 2500] as const;

/** 걷다가 서기를 섞어 오가고, 범위 끝에서 돌아선다 */
export function stepPatrol(patrol: Patrol, dtMs: number, speed: number, random = Math.random): void {
  patrol.leftMs -= dtMs;
  if (patrol.leftMs <= 0) {
    patrol.moving = !patrol.moving;
    const [low, high] = patrol.moving ? MOVE_MS : STAND_MS;
    patrol.leftMs = low + random() * (high - low);
    if (patrol.moving && random() < 0.5) patrol.direction = patrol.direction === 1 ? -1 : 1;
  }
  if (!patrol.moving || patrol.maxX - patrol.minX < 1) return;
  const next = patrol.x + (patrol.direction * speed * dtMs) / 1000;
  if (next <= patrol.minX || next >= patrol.maxX) {
    patrol.x = Math.min(patrol.maxX, Math.max(patrol.minX, next));
    patrol.direction = patrol.direction === 1 ? -1 : 1;
    return;
  }
  patrol.x = next;
}

/** 캐릭터가 보는 쪽 range 안, 위아래 범위 안의 몬스터를 가까운 순으로 count 마리 고른다. 돌려주는 것은 targets 의 번호다 */
export function pickTargets(hero: Point & { facing: -1 | 1 }, targets: Point[], range: number, count: number): number[] {
  return targets
    .map((target, index) => ({ index, ahead: (target.x - hero.x) * hero.facing, rise: hero.y - target.y }))
    .filter(({ ahead, rise }) => ahead >= -HIT_BEHIND && ahead <= range && rise <= HIT_ABOVE && rise >= -HIT_BELOW)
    .sort((a, b) => Math.abs(a.ahead) - Math.abs(b.ahead))
    .slice(0, Math.max(1, count))
    .map(({ index }) => index);
}

export function fieldMobHits(random = Math.random): number {
  const [low, high] = FIELD_MOB_HITS;
  return low + Math.floor(random() * (high - low + 1));
}
