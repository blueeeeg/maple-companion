import { describe, expect, it } from 'vitest';
import { BOSSES } from '../game/bosses';
import type { Era } from '../maple/api';
import type { CoopBossLink } from '../scene/scene';
import { INVITE_MS, hitCap } from './coop';
import { type Coop, type CoopHost, type CoopViewState, createCoop } from './coopSession';
import { createBusTransport, createMemoryBus } from './fakeTransport';

const HITS = 20;
const last = <T>(list: T[]): T | undefined => list[list.length - 1];
const mano = BOSSES[0];
const flush = async () => {
  for (let round = 0; round < 20; round += 1) await Promise.resolve();
};

interface Fighter {
  bossId: number;
  maxHp: number;
  link: CoopBossLink | null;
  end(): void;
}

function world() {
  const bus = createMemoryBus();
  const clock = { now: 0 };
  const clients: { coop: Coop }[] = [];

  function join(userId: string, me: { era?: Era; level?: number } = {}) {
    const fights: Fighter[] = [];
    const notes: string[] = [];
    const hp: [number, number][] = [];
    const damages: number[][] = [];
    const state = { problem: null as string | null, waiting: null as string | null, ended: 0, view: null as CoopViewState };
    const host: CoopHost = {
      me: () => ({ name: userId, era: me.era ?? 'current', level: me.level ?? 200 }),
      check: () => state.problem,
      fight(bossId, maxHp, link) {
        let end = () => {};
        const done = new Promise<void>((resolve) => (end = resolve));
        fights.push({ bossId, maxHp, link, end });
        return done;
      },
      setWaiting: (reason) => (state.waiting = reason),
      notify: (text) => notes.push(text),
      scene: {
        setBossHp: (left, max) => hp.push([left, max]),
        showBossDamage: (numbers) => damages.push(numbers),
        endCoop: () => (state.ended += 1),
      },
    };
    const transport = createBusTransport(bus.connect(), { password: 'x', userId, member: true });
    const coop = createCoop(transport, host, (view) => (state.view = view), () => clock.now, () => HITS);
    coop.setUser(userId);
    const client = { userId, coop, fights, notes, hp, damages, state };
    clients.push(client);
    return client;
  }

  /** 시계를 옮기고 모두 한 번씩 틱을 돈다 */
  async function advance(ms: number) {
    clock.now += ms;
    await flush();
    clients.forEach(({ coop }) => coop.tick());
    await flush();
  }

  return { join, advance, clock, flush };
}

/** host 가 초대하고 guests 가 들어와 30초 뒤 함께 시작한다 */
async function fight(hostId: string, guestIds: string[]) {
  const w = world();
  const host = w.join(hostId);
  const guests = guestIds.map((id) => w.join(id));
  await w.flush();
  expect(host.coop.invite(mano.id)).toBeNull();
  await w.flush();
  guests.forEach((guest) => {
    expect(guest.state.view?.kind).toBe('invite');
    guest.coop.join((guest.state.view as { id: string }).id);
  });
  await w.flush();
  expect(host.state.view).toMatchObject({ kind: 'host', count: guestIds.length + 1 });
  await w.advance(INVITE_MS);
  return { w, host, guests };
}

describe('같이 도전 초대 창', () => {
  it('같은 시대·레벨이 되는 사람에게만 30초 동안 보이고, 끝나면 들어갈 수 없다', async () => {
    const w = world();
    const host = w.join('host');
    const guest = w.join('guest');
    const classic = w.join('classic', { era: 'classic' });
    const low = w.join('low', { level: mano.minLevel - 1 });
    await w.flush();
    expect(host.coop.invite(mano.id)).toBeNull();
    expect(host.state.waiting).not.toBeNull();
    await w.flush();
    expect(guest.state.view).toMatchObject({ kind: 'invite', name: 'host', bossName: mano.name, seconds: 30 });
    expect(classic.state.view).toBeNull();
    expect(low.state.view).toBeNull();
    await w.advance(INVITE_MS - 1000);
    expect(guest.state.view).toMatchObject({ kind: 'invite', seconds: 1 });
    await w.advance(1000);
    expect(guest.state.view).toBeNull();
    guest.coop.join('0b6f3c2e-8a51-4d55-9a47-3f1e2d9c7b10');
    expect(guest.notes).toContain('끝난 초대예요');
    // 아무도 안 들어왔으면 방장은 혼자 진짜 싸움을 한다
    expect(host.fights).toEqual([expect.objectContaining({ bossId: mano.id, maxHp: HITS, link: null })]);
    expect(host.state.waiting).toBeNull();
  });

  it('보스 차례가 아니거나 직접 조작 중이면 초대도 참여도 막는다', async () => {
    const w = world();
    const host = w.join('host');
    const guest = w.join('guest');
    host.state.problem = '보스 차례가 아니에요';
    expect(host.coop.invite(mano.id)).toBe('보스 차례가 아니에요');
    host.state.problem = null;
    expect(host.coop.invite(mano.id)).toBeNull();
    await w.flush();
    guest.state.problem = '직접 조작 중에는 도전할 수 없어요';
    guest.coop.join((guest.state.view as { id: string }).id);
    expect(guest.notes).toContain('직접 조작 중에는 도전할 수 없어요');
    expect(guest.state.view?.kind).toBe('invite');
  });

  it('방장이 취소하면 들어온 사람도 기다리기를 그만둔다', async () => {
    const w = world();
    const host = w.join('host');
    const guest = w.join('guest');
    host.coop.invite(mano.id);
    await w.flush();
    guest.coop.join((guest.state.view as { id: string }).id);
    await w.flush();
    expect(guest.state.view?.kind).toBe('guest');
    host.coop.cancel();
    await w.flush();
    expect(guest.state.view).toBeNull();
    expect(guest.state.waiting).toBeNull();
    expect(host.fights).toHaveLength(0);
    expect(guest.fights).toHaveLength(0);
  });
});

describe('같이 싸우기', () => {
  it('모두 같은 보스·HP 로 들어가고, 방장이 때린 몫을 모아 HP 를 알린다', async () => {
    const { w, host, guests } = await fight('host', ['guest']);
    const [guest] = guests;
    const max = HITS * 2;
    expect(host.fights[0]).toMatchObject({ bossId: mano.id, maxHp: max });
    expect(guest.fights[0]).toMatchObject({ bossId: mano.id, maxHp: max });
    expect(host.state.view).toMatchObject({ kind: 'fight', count: 2 });

    guest.fights[0].link!.onHit(2, [1234], true);
    await w.advance(200);
    expect(host.damages).toContainEqual([1234]);
    await w.advance(100);
    expect(last(guest.hp)).toEqual([max - 2, max]);

    host.fights[0].link!.onHit(1, [77], false);
    expect(last(host.hp)).toEqual([max - 3, max]);
    await w.advance(200);
    expect(guest.damages).toContainEqual([77]);
    expect(last(guest.hp)).toEqual([max - 3, max]);
  });

  it('남이 보낸 큰 대미지는 한 번 몫으로 자르고, 보스 HP 가 0 이 되면 모두 쓰러뜨린다', async () => {
    const { w, host, guests } = await fight('host', ['guest']);
    const [guest] = guests;
    const max = HITS * 2;
    guest.fights[0].link!.onHit(9999, [1], false);
    await w.advance(200);
    await w.advance(100);
    expect(last(host.hp)).toEqual([max - hitCap(max), max]);
    for (let round = 0; round < 10; round += 1) {
      guest.fights[0].link!.onHit(hitCap(max), [1], false);
      await w.advance(1000);
    }
    expect(last(host.hp)).toEqual([0, max]);
    expect(last(guest.hp)).toEqual([0, max]);
  });

  it('방장이 나가면 남은 사람 가운데 id 가 가장 작은 사람이 마지막 HP 로 이어 맡는다', async () => {
    const { w, host, guests } = await fight('m-host', ['b-guest', 'x-guest']);
    const [b, x] = guests;
    const max = HITS * 3;
    x.fights[0].link!.onHit(2, [5], false);
    await w.advance(200);
    await w.advance(100);
    expect(last(b.hp)).toEqual([max - 2, max]);

    host.coop.setUser(null);
    await w.advance(100);
    expect(b.notes.some((note) => note.includes('이어 맡아요'))).toBe(true);
    expect(x.state.ended).toBe(0);

    x.fights[0].link!.onHit(2, [6], false);
    await w.advance(200);
    await w.advance(100);
    expect(last(b.hp)).toEqual([max - 4, max]);
    expect(last(x.hp)).toEqual([max - 4, max]);
  });

  it('다른 사람이 모두 나가면 혼자 싸움으로 이어 간다', async () => {
    const { w, host, guests } = await fight('host', ['guest']);
    const [guest] = guests;
    guest.coop.setUser(null);
    await w.advance(100);
    expect(guest.state.ended).toBe(1);
    expect(host.state.ended).toBe(1);
    expect(host.state.view).toBeNull();
  });

  it('보스를 잡고 마을로 돌아오면 채널을 떠난다', async () => {
    const { w, host, guests } = await fight('host', ['guest']);
    host.fights[0].end();
    guests[0].fights[0].end();
    await w.advance(100);
    expect(host.state.view).toBeNull();
    expect(guests[0].state.view).toBeNull();
    expect(host.state.ended + guests[0].state.ended).toBe(0);
  });
});
