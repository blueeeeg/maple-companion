import { BUTTON_SKINS, dressMapleButton } from '../ui/mapleButton';
import type { JoinResult } from './transport';

const FAILED_TEXT: Record<Exclude<JoinResult, 'ok'>, string> = {
  wrong: '비밀번호가 달라요',
  limited: '너무 많이 틀렸어요. 10분 뒤에 다시 해 주세요',
};

/** 방 비밀번호를 한 번 묻는 작은 창. 맞으면 서버가 이 기기의 익명 계정을 멤버로 기억해서 다음부터는 안 묻는다 */
export function createPasswordPrompt(root: HTMLElement): { ask(failed: JoinResult | null): Promise<string | null> } {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <div class="online-prompt" hidden>
      <form class="online-prompt-window" role="dialog" aria-modal="true" aria-labelledby="online-prompt-title">
        <h2 id="online-prompt-title">온라인 입장</h2>
        <p class="online-prompt-text">친구들과 정한 방 비밀번호를 넣어 주세요. 한 번만 넣으면 돼요</p>
        <input class="online-prompt-input" type="password" maxlength="72" autocomplete="off" aria-label="방 비밀번호" />
        <p class="online-prompt-error" role="alert"></p>
        <div class="online-prompt-buttons">
          <button class="online-prompt-later" type="button">나중에</button>
          <button class="online-prompt-enter" type="submit">입장</button>
        </div>
      </form>
    </div>
    `,
  );
  const overlay = root.querySelector<HTMLElement>('.online-prompt')!;
  const form = overlay.querySelector<HTMLFormElement>('form')!;
  const input = overlay.querySelector<HTMLInputElement>('.online-prompt-input')!;
  const error = overlay.querySelector<HTMLElement>('.online-prompt-error')!;
  const later = overlay.querySelector<HTMLButtonElement>('.online-prompt-later')!;
  const enter = overlay.querySelector<HTMLButtonElement>('.online-prompt-enter')!;
  dressMapleButton(later, BUTTON_SKINS.bossGrey);
  dressMapleButton(enter, BUTTON_SKINS.bossGreen);
  let answer: ((password: string | null) => void) | null = null;

  function finish(password: string | null): void {
    overlay.hidden = true;
    input.value = '';
    const resolve = answer;
    answer = null;
    resolve?.(password);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (input.value) finish(input.value);
  });
  later.addEventListener('click', () => finish(null));
  // 비밀번호를 치는 동안 직접 조작 키가 먹지 않게 한다
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') finish(null);
  });

  return {
    ask(failed) {
      // 앞 질문이 떠 있으면 그 질문은 「나중에」로 닫는다
      if (answer) finish(null);
      error.textContent = failed && failed !== 'ok' ? FAILED_TEXT[failed] : '';
      overlay.hidden = false;
      input.focus({ preventScroll: true });
      return new Promise((resolve) => (answer = resolve));
    },
  };
}
