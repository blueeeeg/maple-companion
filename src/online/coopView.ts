import type { CoopViewState } from './coopSession';

export interface CoopViewHandlers {
  onJoin(inviteId: string): void;
  onStartNow(): void;
  onCancel(): void;
}

/** HUD 아래 오른쪽의 작은 판. 초대·대기·같이 싸우는 중을 한 줄로 띄운다 */
export function createCoopView(root: HTMLElement, handlers: CoopViewHandlers): (state: CoopViewState) => void {
  const panel = document.createElement('div');
  panel.className = 'online-coop';
  panel.setAttribute('role', 'status');
  panel.hidden = true;
  root.append(panel);

  const button = (label: string, kind: string, run: () => void) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `online-coop-button is-${kind}`;
    element.textContent = label;
    element.addEventListener('click', run);
    return element;
  };
  const text = (value: string) => {
    const element = document.createElement('span');
    element.className = 'online-coop-text';
    element.textContent = value;
    return element;
  };

  return (state) => {
    panel.hidden = state === null;
    panel.dataset.kind = state?.kind ?? '';
    if (!state) {
      panel.replaceChildren();
      return;
    }
    if (state.kind === 'invite') {
      panel.replaceChildren(
        text(`${state.name}님이 ${state.bossName} 같이 잡자고 해요 · ${state.seconds}초`),
        button('참여', 'join', () => handlers.onJoin(state.id)),
      );
    } else if (state.kind === 'host') {
      panel.replaceChildren(
        text(`${state.bossName} 같이 도전 · ${state.count}명 · ${state.seconds}초 뒤 시작`),
        button('바로 시작', 'start', handlers.onStartNow),
        button('취소', 'cancel', handlers.onCancel),
      );
    } else if (state.kind === 'guest') {
      panel.replaceChildren(text(`${state.hostName}님의 ${state.bossName} 시작을 기다려요`), button('나가기', 'cancel', handlers.onCancel));
    } else {
      panel.replaceChildren(text(`${state.bossName} 같이 싸우는 중 · ${state.count}명`));
    }
  };
}
