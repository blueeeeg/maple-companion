import { describe, expect, it } from 'vitest';
import { BOSSES } from '../game/bosses';
import { CLASSIC_BOSSES } from '../game/bosses.classic';
import {
  INVITE_MS,
  MAX_DAMAGE_NUMBERS,
  MAX_POINTS_PER_SECOND,
  canSeeInvite,
  cleanBossEvent,
  cleanRoomEvent,
  coopHp,
  createBossHp,
  createHitBatch,
  createHpTicker,
  hitCap,
  inviteFrom,
  pickHost,
} from './coop';

const ID = '0b6f3c2e-8a51-4d55-9a47-3f1e2d9c7b10';
const mano = BOSSES[0];
const pinkBean = BOSSES.find((boss) => boss.name === '핑크빈')!;
const invite = (change: Record<string, unknown> = {}) => ({ t: 'invite', id: ID, host: 'host-1', name: '단풍이', era: 'current', bossId: mano.id, ttl: INVITE_MS, ...change });

describe('같이 도전 초대', () => {
  it('모양이 맞는 초대만 받는다', () => {
    expect(cleanRoomEvent(invite())).toEqual(invite());
    expect(cleanRoomEvent({ t: 'close', id: ID, host: 'host-1' })).toEqual({ t: 'close', id: ID, host: 'host-1' });
    expect(cleanRoomEvent(invite({ id: 'not-a-uuid' }))).toBeNull();
    expect(cleanRoomEvent(invite({ host: '<script>' }))).toBeNull();
    expect(cleanRoomEvent(invite({ era: 'future' }))).toBeNull();
    expect(cleanRoomEvent(invite({ bossId: 1234 }))).toBeNull();
    expect(cleanRoomEvent(invite({ bossId: 2.5 }))).toBeNull();
    expect(cleanRoomEvent(invite({ ttl: INVITE_MS + 1 }))).toBeNull();
    expect(cleanRoomEvent(invite({ name: '가'.repeat(13) }))).toBeNull();
    expect(cleanRoomEvent(invite({ name: ' ' }))).toBeNull();
    expect(cleanRoomEvent(invite({ t: 'party' }))).toBeNull();
    expect(cleanRoomEvent(null)).toBeNull();
    expect(cleanRoomEvent('invite')).toBeNull();
  });

  it('클래식 초대는 그 시대 보스 목록으로 본다', () => {
    const classic = CLASSIC_BOSSES[0];
    expect(cleanRoomEvent(invite({ era: 'classic', bossId: classic.id }))).not.toBeNull();
    if (!BOSSES.some((boss) => boss.id === classic.id)) expect(cleanRoomEvent(invite({ bossId: classic.id }))).toBeNull();
  });

  it('30초 동안 같은 시대·보스 레벨이 되는 다른 사람에게만 보인다', () => {
    const event = cleanRoomEvent(invite({ bossId: pinkBean.id }));
    if (event?.t !== 'invite') throw new Error('초대가 아니다');
    const received = inviteFrom(event, 1000);
    expect(received.expiresAt).toBe(1000 + INVITE_MS);
    const viewer = { userId: 'guest', era: 'current' as const, level: pinkBean.minLevel };
    expect(canSeeInvite(received, viewer, 1000)).toBe(true);
    expect(canSeeInvite(received, viewer, 1000 + INVITE_MS - 1)).toBe(true);
    expect(canSeeInvite(received, viewer, 1000 + INVITE_MS)).toBe(false);
    expect(canSeeInvite(received, { ...viewer, level: pinkBean.minLevel - 1 }, 1000)).toBe(false);
    expect(canSeeInvite(received, { ...viewer, era: 'classic' }, 1000)).toBe(false);
    expect(canSeeInvite(received, { ...viewer, userId: 'host-1' }, 1000)).toBe(false);
    expect(canSeeInvite(received, null, 1000)).toBe(false);
  });

  it('보낸 쪽이 남은 시간을 길게 적어도 30초를 넘기지 않는다', () => {
    const received = inviteFrom({ t: 'invite', id: ID, host: 'h', name: 'a', era: 'current', bossId: mano.id, ttl: 10 * INVITE_MS }, 0);
    expect(received.expiresAt).toBe(INVITE_MS);
  });
});

describe('보스 채널 알림 확인', () => {
  it('시작·때림·HP·처치·취소 모양과 숫자 범위를 본다', () => {
    expect(cleanBossEvent({ t: 'start', from: 'a', bossId: mano.id, era: 'current', max: 40, hp: 40 })).not.toBeNull();
    expect(cleanBossEvent({ t: 'start', from: 'a', bossId: mano.id, era: 'current', max: 40, hp: 41 })).toBeNull();
    expect(cleanBossEvent({ t: 'start', from: 'a', bossId: mano.id, era: 'current', max: 10_001, hp: 1 })).toBeNull();
    expect(cleanBossEvent({ t: 'hit', from: 'a', n: 2, d: [1234, 5678], c: true })).toEqual({ t: 'hit', from: 'a', n: 2, d: [1234, 5678], c: true });
    expect(cleanBossEvent({ t: 'hit', from: 'a', n: -1, d: [], c: false })).toBeNull();
    expect(cleanBossEvent({ t: 'hit', from: 'a', n: 1.5, d: [], c: false })).toBeNull();
    expect(cleanBossEvent({ t: 'hit', from: 'a', n: 1, d: ['9'], c: false })).toBeNull();
    expect(cleanBossEvent({ t: 'hit', from: 'a', n: 1, d: [Infinity], c: false })).toBeNull();
    expect(cleanBossEvent({ t: 'hit', from: 'a', n: 1, d: Array(MAX_DAMAGE_NUMBERS + 1).fill(1), c: false })).toBeNull();
    expect(cleanBossEvent({ t: 'hit', from: 'a', n: 1, d: [], c: 'yes' })).toBeNull();
    expect(cleanBossEvent({ t: 'hp', from: 'a', hp: 0, max: 40 })).toEqual({ t: 'hp', from: 'a', hp: 0, max: 40 });
    expect(cleanBossEvent({ t: 'hp', from: 'a', hp: 50, max: 40 })).toBeNull();
    expect(cleanBossEvent({ t: 'kill', from: 'a', extra: 1 })).toEqual({ t: 'kill', from: 'a' });
    expect(cleanBossEvent({ t: 'cancel', from: 'a' })).toEqual({ t: 'cancel', from: 'a' });
    expect(cleanBossEvent({ t: 'kill', from: 'a b' })).toBeNull();
    expect(cleanBossEvent({ t: 'kill' })).toBeNull();
    expect(cleanBossEvent({ t: 'heal', from: 'a' })).toBeNull();
  });
});

describe('방장이 들고 있는 보스 HP', () => {
  it('여럿이 때린 몫을 모아 깎고 0 아래로 내려가지 않는다', () => {
    const boss = createBossHp(40, 40);
    expect(boss.apply('a', 2, 0)).toBe(2);
    expect(boss.apply('b', 1, 0)).toBe(1);
    expect(boss.hp).toBe(37);
    const low = createBossHp(40, 3);
    expect(low.apply('a', 5, 0)).toBe(3);
    expect(low.hp).toBe(0);
    expect(low.apply('a', 5, 10_000)).toBe(0);
  });

  it('한 번에 너무 큰 대미지와 1초 몫을 넘는 대미지는 버린다', () => {
    expect(hitCap(40)).toBe(MAX_POINTS_PER_SECOND);
    expect(hitCap(18)).toBe(5);
    expect(hitCap(4)).toBe(2);
    const boss = createBossHp(40, 40);
    expect(boss.apply('cheat', 10_000, 0)).toBe(hitCap(40));
    // 통이 비었다. 0.1초 뒤에는 1초 몫의 1/10 만 찼다
    expect(boss.apply('cheat', 10, 100)).toBe(1);
    expect(boss.apply('cheat', Number.NaN, 5000)).toBe(0);
    // 다른 사람 통은 따로다
    expect(boss.apply('honest', 2, 100)).toBe(2);
    // 10초 동안 1초 몫씩 보내면 다 받는다
    const steady = createBossHp(10_000, 10_000);
    let applied = 0;
    for (let second = 0; second < 10; second += 1) applied += steady.apply('a', MAX_POINTS_PER_SECOND, second * 1000);
    expect(applied).toBe(10 * MAX_POINTS_PER_SECOND);
  });

  it('HP 는 1초에 10번까지만 알리고 0 은 바로 알린다', () => {
    const ticker = createHpTicker();
    expect(ticker.due(40, 0)).toBe(true);
    ticker.mark(40, 0);
    expect(ticker.due(40, 500)).toBe(false);
    expect(ticker.due(39, 50)).toBe(false);
    expect(ticker.due(39, 100)).toBe(true);
    ticker.mark(39, 100);
    expect(ticker.due(0, 110)).toBe(true);
    ticker.reset();
    expect(ticker.due(39, 120)).toBe(true);
  });

  it('때린 몫은 모아서 0.2초마다 한 번 보낸다', () => {
    const batch = createHitBatch();
    expect(batch.take(0)).toBeNull();
    batch.add(1, [100], false);
    batch.add(2, [200, 300], true);
    expect(batch.take(0)).toEqual({ n: 3, d: [100, 200, 300], c: true });
    batch.add(1, [1], false);
    expect(batch.take(100)).toBeNull();
    expect(batch.take(200)).toEqual({ n: 1, d: [1], c: false });
    batch.add(0, Array.from({ length: 20 }, (_, index) => index + 1), false);
    expect(batch.take(1000)?.d).toHaveLength(MAX_DAMAGE_NUMBERS);
  });

  it('사람 수만큼 HP 가 늘어 혼자 싸울 때와 비슷하게 걸린다', () => {
    expect(coopHp(20, 1)).toBe(20);
    expect(coopHp(20, 3)).toBe(60);
    expect(coopHp(20, 0)).toBe(20);
  });
});

describe('방장 넘기기', () => {
  it('방장이 남아 있으면 그대로, 나갔으면 남은 사람 가운데 id 가 가장 작은 사람이다', () => {
    expect(pickHost(['m', 'b', 'x'], 'm')).toBe('m');
    expect(pickHost(['x', 'b'], 'm')).toBe('b');
    expect(pickHost(new Set(['x']), 'm')).toBe('x');
    expect(pickHost([], 'm')).toBe('m');
  });
});
