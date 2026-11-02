import { describe, expect, it } from 'vitest';
import { type ChatLine, createChatLog } from './chatLog';
import type { ActorLook, ActorPose } from '../scene/scene';
import { createBusTransport, createMemoryBus } from './fakeTransport';
import { type OnlineHost, type OnlineStatus, type SelfLook, cleanPeer, createOnlineSession, mapTopic } from './session';
import type { ChatMessage, JoinResult, OnlineTransport } from './transport';

const PASSWORD = '단풍잎';
const flush = async () => {
  for (let round = 0; round < 10; round += 1) await Promise.resolve();
};

interface Client {
  host: OnlineHost & { active: boolean; pose: ActorPose; me: SelfLook };
  actors: Map<string, { look: ActorLook; pose: ActorPose }>;
  balloons: { id: string | null; text: string }[];
  log: ChatLine[];
  statuses: OnlineStatus[];
  members: string[][];
  notices: string[];
  asked: (JoinResult | null)[];
  session: ReturnType<typeof createOnlineSession>;
  clock: { now: number };
}

function client(transport: OnlineTransport, name: string, answers: (string | null)[] = [PASSWORD]): Client {
  const actors = new Map<string, { look: ActorLook; pose: ActorPose }>();
  const balloons: Client['balloons'] = [];
  const chatLog = createChatLog(100);
  const log = chatLog.lines;
  const statuses: Client['statuses'] = [];
  const members: Client['members'] = [];
  const notices: string[] = [];
  const asked: Client['asked'] = [];
  const clock = { now: 0 };
  const host: Client['host'] = {
    active: true,
    pose: { mapId: 100000000, x: 0, y: 0, facing: 1, action: 'stand' },
    me: { name, era: 'current', look: [2000, 12000], standAction: 'stand1', walkAction: 'walk1', mount: null, chair: null },
    isActive: () => host.active,
    self: () => host.me,
    scene: {
      heroPose: () => host.pose,
      addRemoteActor: (id, look, pose) => actors.set(id, { look, pose }),
      updateRemoteActor(id, change) {
        const actor = actors.get(id);
        if (actor) Object.assign(actor, change);
      },
      removeRemoteActor: (id) => actors.delete(id),
      showBalloon: (id, text) => balloons.push({ id, text }),
    },
  };
  const session = createOnlineSession(
    transport,
    host,
    {
      status: (status) => statuses.push(status),
      members: (names) => members.push(names),
      notice: (text) => notices.push(text),
      message: (message, mine) => chatLog.add(message, mine),
      pending: (message) => chatLog.pending(message),
      failed: (clientId, reason) => chatLog.fail(clientId, reason),
      askPassword: async (failed) => {
        asked.push(failed);
        return answers.shift() ?? null;
      },
    },
    () => clock.now,
  );
  return { host, actors, balloons, log, statuses, members, notices, asked, session, clock };
}

async function pair() {
  const bus = createMemoryBus();
  const a = client(createBusTransport(bus.connect(), { password: PASSWORD, userId: 'a' }), '단풍이');
  const b = client(createBusTransport(bus.connect(), { password: PASSWORD, userId: 'b' }), '주황버섯');
  await a.session.connect();
  await b.session.connect();
  await flush();
  return { a, b };
}

describe('방 비밀번호', () => {
  it('멤버가 아니면 묻고, 맞히면 방에 들어간다', async () => {
    const bus = createMemoryBus();
    const a = client(createBusTransport(bus.connect(), { password: PASSWORD, userId: 'a' }), '단풍이', ['틀림', PASSWORD]);
    await a.session.connect();
    await flush();
    expect(a.asked).toEqual([null, 'wrong']);
    expect(a.session.status).toBe('online');
  });

  it('「나중에」를 누르면 잠긴 채로 둔다', async () => {
    const bus = createMemoryBus();
    const a = client(createBusTransport(bus.connect(), { password: PASSWORD, userId: 'a' }), '단풍이', [null]);
    await a.session.connect();
    expect(a.session.status).toBe('locked');
    expect(a.statuses[a.statuses.length - 1]).toBe('locked');
  });

  it('이미 멤버면 묻지 않는다', async () => {
    const bus = createMemoryBus();
    const a = client(createBusTransport(bus.connect(), { password: PASSWORD, userId: 'a', member: true }), '단풍이', []);
    await a.session.connect();
    await flush();
    expect(a.asked).toEqual([]);
    expect(a.session.status).toBe('online');
  });
});

describe('같은 맵의 친구', () => {
  it('두 사람이 서로를 보고 접속자 이름을 받는다', async () => {
    const { a, b } = await pair();
    expect(a.members[a.members.length - 1]).toEqual(['단풍이', '주황버섯']);
    expect(b.members[b.members.length - 1]).toEqual(['주황버섯', '단풍이']);
    a.session.tick();
    b.session.tick();
    await flush();
    expect(a.actors.get('b')?.look.name).toBe('주황버섯');
    expect(b.actors.get('a')?.look.name).toBe('단풍이');
  });

  it('움직이면 상대 화면의 자리가 따라온다', async () => {
    const { a, b } = await pair();
    a.session.tick();
    b.session.tick();
    await flush();
    a.host.pose = { ...a.host.pose, x: 150, action: 'walk', facing: -1 };
    a.clock.now = 300;
    a.session.tick();
    await flush();
    expect(b.actors.get('a')?.pose).toMatchObject({ x: 150, action: 'walk', facing: -1 });
  });

  it('다른 맵으로 가면 상대 화면에서 사라진다', async () => {
    const { a, b } = await pair();
    a.session.tick();
    b.session.tick();
    await flush();
    a.host.pose = { ...a.host.pose, mapId: 104000000 };
    a.session.tick();
    await flush();
    expect(b.actors.has('a')).toBe(false);
    expect(a.actors.has('b')).toBe(false);
  });

  it('창이 안 보이면 위치를 보내지 않는다', async () => {
    const { a, b } = await pair();
    a.session.tick();
    b.session.tick();
    await flush();
    a.host.active = false;
    a.host.pose = { ...a.host.pose, x: 400 };
    a.clock.now = 1000;
    a.session.tick();
    await flush();
    expect(b.actors.get('a')?.pose.x).toBe(0);
    a.host.active = true;
    a.session.tick();
    await flush();
    expect(b.actors.get('a')?.pose.x).toBe(400);
  });

  it('맵 채널 이름은 시대와 맵 ID 다', () => {
    expect(mapTopic('classic', 100000000)).toBe('map:classic:100000000');
  });
});

describe('채팅', () => {
  it('보낸 글이 두 사람 채팅창에 한 번씩 뜨고 같은 맵이면 말풍선이 뜬다', async () => {
    const { a, b } = await pair();
    a.session.tick();
    b.session.tick();
    await flush();
    expect(await a.session.send('  안녕 ')).toBeNull();
    await flush();
    expect(a.log.map(({ message, mine }) => [message.text, mine])).toEqual([['안녕', true]]);
    expect(b.log.map(({ message, mine }) => [message.text, mine])).toEqual([['안녕', false]]);
    expect(a.balloons).toEqual([{ id: null, text: '안녕' }]);
    expect(b.balloons).toEqual([{ id: 'a', text: '안녕' }]);
  });

  it('다른 맵에 있는 사람 말은 채팅창에만 뜬다', async () => {
    const { a, b } = await pair();
    b.host.pose = { ...b.host.pose, mapId: 104000000 };
    a.session.tick();
    b.session.tick();
    await flush();
    await a.session.send('어디야');
    await flush();
    expect(b.log).toHaveLength(1);
    expect(b.balloons).toEqual([]);
  });

  it('너무 빨리 보내면 서버까지 가지 않고 막는다', async () => {
    const { a } = await pair();
    expect(await a.session.send('하나')).toBeNull();
    expect(await a.session.send('둘')).toMatch(/초 뒤에/);
    a.clock.now = 1000;
    expect(await a.session.send('둘')).toBeNull();
  });

  it('120자를 넘으면 안 보낸다', async () => {
    const { a, b } = await pair();
    expect(await a.session.send('가'.repeat(121))).toMatch(/120자/);
    await flush();
    expect(b.log).toHaveLength(0);
  });

  it('지난 글은 겹치지 않게 한 번만 준다', async () => {
    const { a, b } = await pair();
    await a.session.send('먼저');
    await flush();
    // 채팅창을 처음 열 때 받는 지난 글에 이미 띄운 글은 빠진다
    expect(await b.session.recent()).toEqual([]);
    expect(b.log).toHaveLength(1);
  });

  it('엔터 직후 서버 답을 기다리지 않고 내 줄과 말풍선이 뜬다', async () => {
    const bus = createMemoryBus();
    const slow = createBusTransport(bus.connect(), { password: PASSWORD, userId: 'a', latencyMs: 20 });
    const a = client(slow, '단풍이');
    await a.session.connect();
    await flush();
    const sending = a.session.send('안녕');
    expect(a.log.map((line) => [line.message.text, line.state])).toEqual([['안녕', 'pending']]);
    expect(a.balloons).toEqual([{ id: null, text: '안녕' }]);
    await sending;
    expect(a.log[0].state).toBe('pending');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(a.log.map((line) => [line.message.text, line.state])).toEqual([['안녕', 'sent']]);
    expect(a.log[0].message.id).not.toMatch(/^local:/);
    expect(a.balloons).toHaveLength(1);
  });

  it('방 채널 글이 먼저 와도 줄과 말풍선이 겹치지 않는다', async () => {
    const bus = createMemoryBus();
    const real = createBusTransport(bus.connect(), { password: PASSWORD, userId: 'a' });
    let deliver = (_: ChatMessage) => {};
    const transport: OnlineTransport = {
      ...real,
      openRoom(handlers, name) {
        deliver = handlers.onMessage;
        return real.openRoom(handlers, name);
      },
      sendChat: async (message) => {
        const saved = await real.sendChat(message);
        // 서버는 방 채널로 먼저 내보내고 insert 응답은 늦게 온다
        deliver(saved);
        return saved;
      },
    };
    const a = client(transport, '단풍이');
    await a.session.connect();
    await flush();
    await a.session.send('안녕');
    await flush();
    expect(a.log.map((line) => [line.message.text, line.state])).toEqual([['안녕', 'sent']]);
    expect(a.balloons).toHaveLength(1);
  });

  it('서버가 거절하면 줄을 못 보냄으로 표시하고 다시 보내지 않는다', async () => {
    const bus = createMemoryBus();
    const a = client(createBusTransport(bus.connect(), { password: PASSWORD, userId: 'a', rateLimit: 0 }), '단풍이');
    await a.session.connect();
    await flush();
    expect(await a.session.send('안녕')).toBeNull();
    await flush();
    expect(a.log.map((line) => [line.message.text, line.state, line.reason])).toEqual([['안녕', 'failed', '못 보냄 · 너무 빨라요']]);
    expect(a.log).toHaveLength(1);
  });

  it('연결 전에는 보내지 않는다', async () => {
    const bus = createMemoryBus();
    const a = client(createBusTransport(bus.connect(), { password: PASSWORD, userId: 'a' }), '단풍이', [null]);
    await a.session.connect();
    expect(await a.session.send('안녕')).toBe('연결 안 됨');
  });
});

describe('받은 캐릭터 검사', () => {
  const valid = {
    name: '단풍이',
    era: 'current',
    look: [2000, 12000],
    standAction: 'stand1',
    walkAction: 'walk1',
    mount: null,
    chair: 3010000,
    mapId: 100000000,
    x: 1,
    y: 2,
    facing: 1,
    action: 'walk',
    presence_ref: 'abc',
  };

  it('필요한 값만 남긴다', () => {
    const { presence_ref: _, ...rest } = valid;
    expect(cleanPeer(valid)).toEqual(rest);
  });

  it('그림 주소에 들어가는 동작 이름에 다른 글자가 있으면 버린다', () => {
    expect(cleanPeer({ ...valid, standAction: '../stand' })).toBeNull();
    expect(cleanPeer({ ...valid, action: 'fly' })).toBeNull();
  });

  it('이름이 비었거나 12자를 넘으면 버린다', () => {
    expect(cleanPeer({ ...valid, name: ' ' })).toBeNull();
    expect(cleanPeer({ ...valid, name: '가'.repeat(13) })).toBeNull();
  });

  it('좌표·아이템이 숫자가 아니면 버린다', () => {
    expect(cleanPeer({ ...valid, x: 'NaN' })).toBeNull();
    expect(cleanPeer({ ...valid, look: ['2000'] })).toBeNull();
    expect(cleanPeer(null)).toBeNull();
  });
});
