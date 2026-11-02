import type { Era } from '../maple/api';
import type { ActorAction } from '../scene/scene';

/** 맵 채널에 알리는 내 캐릭터. 이름은 캐릭터 이름뿐이고 나머지는 겉모습·자리다. 좌표는 맵 월드 좌표 */
export interface PeerState {
  name: string;
  era: Era;
  look: number[];
  standAction: string;
  walkAction: string;
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
  /** 방에 접속한 사람 수(나 포함) */
  onCount(count: number): void;
  onMessage(message: ChatMessage): void;
}

export interface RoomLink {
  leave(): void;
}

export type JoinResult = 'ok' | 'wrong' | 'limited';

/** 서버(Supabase)와 테스트용 가짜가 같이 따르는 모양 */
export interface OnlineTransport {
  /** 로그인 화면 없이 익명으로 들어간다. 내 user id */
  signIn(): Promise<string>;
  isMember(): Promise<boolean>;
  join(password: string): Promise<JoinResult>;
  openRoom(handlers: RoomHandlers): RoomLink;
  joinMap(topic: string, handlers: MapHandlers): MapLink;
  /** 서버가 받아 저장한 글. 거절하면 OnlineError */
  sendChat(message: NewChatMessage): Promise<ChatMessage>;
  /** 24시간 안 글을 오래된 것부터 */
  recentChat(): Promise<ChatMessage[]>;
}

export class OnlineError extends Error {
  constructor(
    readonly code: 'rate' | 'limited' | 'denied' | 'failed',
    message: string = code,
  ) {
    super(message);
  }
}
