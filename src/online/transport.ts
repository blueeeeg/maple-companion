import type { Era } from '../maple/api';
import type { ActorAction } from '../scene/scene';

/** 맵 채널에 알리는 내 캐릭터. 이름은 캐릭터 이름뿐이고 나머지는 겉모습·자리다. 좌표는 맵 월드 좌표 */
export interface PeerState {
  name: string;
  era: Era;
  look: number[];
  standAction: string;
  walkAction: string;
  /** 공격 동작 이름. 옛 판은 안 보낸다 */
  attackAction?: string;
  mount: number | null;
  chair: number | null;
  mapId: number;
  x: number;
  y: number;
  facing: -1 | 1;
  action: ActorAction;
}

export type PeerMove = Pick<PeerState, 'x' | 'y' | 'facing' | 'action'>;

export interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  era: Era;
  mapId: number;
  text: string;
  /** ISO 시각 */
  createdAt: string;
  /** 보낸 쪽이 정한 값. 먼저 띄운 글과 서버에서 돌아온 글을 짝짓는다. 옛 글엔 없다 */
  clientId?: string;
}

export type NewChatMessage = Pick<ChatMessage, 'name' | 'era' | 'mapId' | 'text'> & { clientId: string };

export type LinkStatus = 'connecting' | 'online' | 'offline';

export interface MapHandlers {
  /** 맵에 있는 사람 전부(나 빼고). 누가 들어오거나 나가거나 겉모습을 바꿀 때마다 온다 */
  onPeers(peers: Map<string, PeerState>): void;
  onMove(userId: string, move: PeerMove): void;
}

export interface MapLink {
  track(state: PeerState): void;
  move(move: PeerMove): void;
  leave(): void;
}

export interface RoomHandlers {
  onStatus(status: LinkStatus): void;
  /** 방에 접속한 사람(나 포함). user id → 캐릭터 이름. 누가 들어오거나 나갈 때마다 온다 */
  onMembers(members: Map<string, string>): void;
  onMessage(message: ChatMessage): void;
}

export interface RoomLink {
  /** 캐릭터를 바꿨을 때 방에 알리는 이름을 고친다 */
  track(name: string): void;
  leave(): void;
}

export type JoinResult = 'ok' | 'wrong' | 'limited';

/** 방 전체에 알리는 일(같이 도전 초대). 받은 값은 모양을 다시 확인해서 쓴다 */
export interface EventLink {
  send(payload: unknown): void;
  leave(): void;
}

export interface BossHandlers {
  onStatus(status: LinkStatus): void;
  /** 채널에 붙어 있는 사람 user id 전부(나 포함) */
  onPeers(ids: string[]): void;
  onEvent(payload: unknown): void;
}

export interface BossLink {
  send(payload: unknown): void;
  leave(): void;
}

/** 서버(Supabase)와 테스트용 가짜가 같이 따르는 모양 */
export interface OnlineTransport {
  /** 로그인 화면 없이 익명으로 들어간다. 내 user id */
  signIn(): Promise<string>;
  isMember(): Promise<boolean>;
  join(password: string): Promise<JoinResult>;
  openRoom(handlers: RoomHandlers, name: string): RoomLink;
  joinMap(topic: string, handlers: MapHandlers): MapLink;
  /** 서버가 받아 저장한 글. 거절하면 OnlineError */
  sendChat(message: NewChatMessage): Promise<ChatMessage>;
  /** 24시간 안 글을 오래된 것부터 */
  recentChat(): Promise<ChatMessage[]>;
  /** room:events. 내가 보낸 것은 나에게 오지 않는다 */
  openEvents(onEvent: (payload: unknown) => void): EventLink;
  /** 같이 도전 채널(boss:{초대 id}). 내가 보낸 것은 나에게 오지 않는다 */
  joinBoss(topic: string, handlers: BossHandlers): BossLink;
}

export class OnlineError extends Error {
  constructor(
    readonly code: 'rate' | 'limited' | 'denied' | 'failed',
    message: string = code,
  ) {
    super(message);
  }
}
