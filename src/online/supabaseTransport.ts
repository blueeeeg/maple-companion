import { type RealtimeChannel, createClient } from '@supabase/supabase-js';
import type { Era } from '../maple/api';
import type { OnlineConfig } from './config';
import { type ChatMessage, type LinkStatus, OnlineError, type OnlineTransport, type PeerMove, type PeerState } from './transport';

interface ChatRow {
  id: number | string;
  user_id: string;
  name: string;
  era: Era;
  map_id: number;
  text: string;
  created_at: string;
  client_id?: string | null;
}

const CHAT_COLUMNS = 'id, user_id, name, era, map_id, text, created_at, client_id';

const fromRow = (row: ChatRow): ChatMessage => ({
  id: String(row.id),
  userId: row.user_id,
  name: row.name,
  era: row.era,
  mapId: row.map_id,
  text: row.text,
  createdAt: row.created_at,
  clientId: row.client_id ?? undefined,
});

/** 같은 사람이 탭을 여러 개 열면 presence 에 여러 개가 남는다. 마지막 것만 쓴다 */
function lastOfEach<T>(state: Record<string, T[]>): Map<string, T> {
  return new Map(Object.entries(state).flatMap(([key, list]) => (list.length > 0 ? [[key, list[list.length - 1]] as const] : [])));
}

/**
 * Supabase 연결. 익명 로그인 → join_room RPC 로 멤버 → 비공개 채널(Realtime Authorization).
 * anon 키만 쓴다. 권한은 모두 서버 RLS 가 정한다(supabase/migrations)
 */
export function createSupabaseTransport(config: OnlineConfig): OnlineTransport {
  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'maple-companion:online-auth' },
  });
  let userId = '';

  const fail = (error: { message: string }): never => {
    if (error.message.includes('rate_limited')) throw new OnlineError('rate', error.message);
    if (error.message.includes('not_member') || error.message.includes('row-level security')) throw new OnlineError('denied', error.message);
    if (error.message.includes('too_many_attempts')) throw new OnlineError('limited', error.message);
    throw new OnlineError('failed', error.message);
  };

  function channelStatus(status: string): LinkStatus {
    if (status === 'SUBSCRIBED') return 'online';
    return status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED' ? 'offline' : 'connecting';
  }

  return {
    async signIn() {
      const { data } = await client.auth.getSession();
      let user = data.session?.user ?? null;
      if (!user) {
        const signed = await client.auth.signInAnonymously();
        if (signed.error) fail(signed.error);
        user = signed.data.user;
      }
      if (!user) throw new OnlineError('failed', '익명 로그인 결과가 비었다');
      userId = user.id;
      // 비공개 채널은 이 토큰으로 RLS 를 거친다
      await client.realtime.setAuth();
      return userId;
    },
    async isMember() {
      const { data, error } = await client.from('members').select('user_id').eq('user_id', userId).maybeSingle();
      if (error) fail(error);
      return data !== null;
    },
    async join(password) {
      const { data, error } = await client.rpc('join_room', { password });
      if (error) {
        if (error.message.includes('not_member') || error.message.includes('row-level security')) throw new OnlineError('denied', error.message);
    if (error.message.includes('too_many_attempts')) return 'limited';
        fail(error);
      }
      return data === true ? 'ok' : 'wrong';
    },
    openRoom(handlers, name) {
      let tracked = name;
      let online = false;
      const channel: RealtimeChannel = client.channel('room:chat', {
        config: { private: true, presence: { key: userId, enabled: true } },
      });
      channel
        .on('presence', { event: 'sync' }, () => {
          const members = lastOfEach(channel.presenceState<{ name?: string }>());
          handlers.onMembers(new Map([...members].map(([id, state]) => [id, typeof state.name === 'string' ? state.name : ''])));
        })
        .on('broadcast', { event: 'message' }, ({ payload }) => handlers.onMessage(fromRow(payload as ChatRow)))
        .subscribe((status, error) => {
          if (error) console.warn('[online] 방 채널', status, error);
          const link = channelStatus(status);
          handlers.onStatus(link);
          online = link === 'online';
          if (online) void channel.track({ at: new Date().toISOString(), name: tracked });
        });
      return {
        track(next) {
          tracked = next;
          if (online) void channel.track({ at: new Date().toISOString(), name: next });
        },
        leave: () => void client.removeChannel(channel),
      };
    },
    joinMap(topic, handlers) {
      const channel = client.channel(topic, { config: { private: true, presence: { key: userId, enabled: true } } });
      let subscribed = false;
      let pending: PeerState | null = null;
      channel
        .on('presence', { event: 'sync' }, () => {
          const peers = lastOfEach(channel.presenceState<PeerState>());
          peers.delete(userId);
          handlers.onPeers(peers as Map<string, PeerState>);
        })
        .on('broadcast', { event: 'move' }, ({ payload }) => {
          const { id, ...move } = payload as PeerMove & { id: string };
          if (id !== userId) handlers.onMove(id, move);
        })
        .subscribe((status, error) => {
          if (error) console.warn('[online] 맵 채널', topic, status, error);
          subscribed = status === 'SUBSCRIBED';
          if (subscribed && pending) void channel.track(pending);
        });
      return {
        track(state) {
          pending = state;
          if (subscribed) void channel.track(state);
        },
        move(move) {
          if (pending) Object.assign(pending, move);
          if (subscribed) void channel.send({ type: 'broadcast', event: 'move', payload: { id: userId, ...move } });
        },
        leave: () => void client.removeChannel(channel),
      };
    },
    async sendChat({ name, era, mapId, text, clientId }) {
      const { data, error } = await client
        .from('chat_messages')
        .insert({ name, era, map_id: mapId, text, client_id: clientId })
        .select(CHAT_COLUMNS)
        .single();
      if (error) fail(error);
      return fromRow(data as ChatRow);
    },
    async recentChat() {
      const { data, error } = await client.rpc('recent_chat');
      if (error) fail(error);
      return ((data ?? []) as ChatRow[]).map(fromRow).reverse();
    },
    openEvents(onEvent) {
      const channel = client.channel('room:events', { config: { private: true } });
      let subscribed = false;
      channel
        .on('broadcast', { event: 'event' }, ({ payload }) => onEvent(payload))
        .subscribe((status, error) => {
          if (error) console.warn('[online] 알림 채널', status, error);
          subscribed = status === 'SUBSCRIBED';
        });
      return {
        send(payload) {
          if (subscribed) void channel.send({ type: 'broadcast', event: 'event', payload });
        },
        leave: () => void client.removeChannel(channel),
      };
    },
    joinBoss(topic, handlers) {
      const channel = client.channel(topic, { config: { private: true, presence: { key: userId, enabled: true } } });
      let subscribed = false;
      channel
        .on('presence', { event: 'sync' }, () => handlers.onPeers(Object.keys(channel.presenceState())))
        .on('broadcast', { event: 'event' }, ({ payload }) => handlers.onEvent(payload))
        .subscribe((status, error) => {
          if (error) console.warn('[online] 보스 채널', topic, status, error);
          subscribed = status === 'SUBSCRIBED';
          handlers.onStatus(channelStatus(status));
          if (subscribed) void channel.track({ at: new Date().toISOString() });
        });
      return {
        send(payload) {
          if (subscribed) void channel.send({ type: 'broadcast', event: 'event', payload });
        },
        leave: () => void client.removeChannel(channel),
      };
    },
  };
}
