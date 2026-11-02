import type { ChatMessage } from './transport';

export type LineState = 'pending' | 'sent' | 'failed';

export interface ChatLine {
  message: ChatMessage;
  mine: boolean;
  state: LineState;
  /** 못 보냈을 때 줄에 붙일 까닭 */
  reason?: string;
  /** 줄 순서. 서버 글로 바뀌어도 처음 자리를 지킨다(기기 시계가 달라도 줄이 튀지 않게) */
  at: string;
}

/** 창에 보이는 글 목록. 먼저 띄운 내 글과 서버에서 돌아온 글을 한 줄로 맞춘다 */
export function createChatLog(limit: number) {
  const lines: ChatLine[] = [];

  const byClientId = (clientId: string | undefined) =>
    clientId ? lines.find((line) => line.message.clientId === clientId) : undefined;

  function trim(): void {
    lines.sort((a, b) => a.at.localeCompare(b.at));
    lines.splice(0, Math.max(0, lines.length - limit));
  }

  return {
    lines,
    /** 서버가 확정한 글. 먼저 띄운 줄이 있으면 그 줄을 확정으로 바꾸고, 같은 글이 또 오면 버린다 */
    add(message: ChatMessage, mine: boolean): void {
      const line = byClientId(message.clientId);
      if (line) {
        line.message = message;
        line.state = 'sent';
        line.reason = undefined;
      } else if (!lines.some((each) => each.message.id === message.id)) {
        lines.push({ message, mine, state: 'sent', at: message.createdAt });
      }
      trim();
    },
    /** 서버 답을 기다리는 내 글 */
    pending(message: ChatMessage): void {
      lines.push({ message, mine: true, state: 'pending', at: message.createdAt });
      trim();
    },
    /** 못 보낸 글은 그대로 두고 까닭만 붙인다. 이미 확정된 줄은 건드리지 않는다 */
    fail(clientId: string, reason: string): void {
      const line = byClientId(clientId);
      if (line?.state !== 'pending') return;
      line.state = 'failed';
      line.reason = reason;
    },
  };
}
