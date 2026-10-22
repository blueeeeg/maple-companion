import type { JobLineId } from '../game/jobs';
import { MESO_HUD_ICON_URL, cashShopUiUrl } from '../maple/api';
import { loadWithRetry, loadedImage } from './art';
import { JOB_CHOICE_KEY, createNpcDialog, openAdvancementCongratulation, openJobChoice } from './npcDialog';

export interface HudState {
  level: number;
  jobTitle: string;
  canChooseJob: boolean;
  ratio: number;
  xpIntoLevel: number;
  xpForLevel: number;
  meso: number;
  muted: boolean;
  resting: boolean;
}

export interface HudHandlers {
  onChooseJob(id: JobLineId): void;
  onToggleMute(): void;
  onOpenCharacterSelect(): void;
  onOpenCashShop(): void;
  onOpenSettings(): void;
}

export interface Hud {
  render(state: HudState): void;
  /** EXP 바 위에 한 줄로 잠깐 띄운다. 새 알림이 오면 이전 것을 바로 바꾼다 */
  notify(text: string): void;
  /** 직업을 묻는 NPC 대화를 연다. 다른 대화가 떠 있으면 그 뒤에 연다 */
  openJobChoice(): void;
  /** 2차 이상 전직 때 그 직업 전직관의 축하 대화를 띄운다. 게임을 멈추지 않는다 */
  congratulate(jobLine: JobLineId, tier: number): void;
  /** 떠 있거나 기다리는 NPC 대화를 모두 닫는다 */
  closeDialogs(): void;
}

const NOTICE_MS = 4000;

export function createHud(root: HTMLElement, handlers: HudHandlers): Hud {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <header class="hud" data-tauri-drag-region>
      <span class="hud-level" data-tauri-drag-region></span>
      <span class="hud-job" data-tauri-drag-region></span>
      <button class="hud-advance" type="button" hidden>전직 가능!</button>
      <span class="hud-rest" data-tauri-drag-region hidden>zZ 휴식 중</span>
      <span class="hud-spacer" data-tauri-drag-region></span>
      <span class="hud-meso" data-tauri-drag-region aria-label="메소"><span class="hud-meso-amount"></span></span>
      <button class="hud-shop" type="button" aria-label="캐시샵" title="캐시샵">🛍</button>
      <button class="hud-menu-button" type="button" aria-label="메뉴" title="메뉴" aria-haspopup="menu" aria-expanded="false">⚙️</button>
    </header>
    <div class="hud-menu" role="menu" hidden>
      <button class="hud-mute" type="button" role="menuitem"></button>
      <button class="hud-settings" type="button" role="menuitem">⚙️ 설정</button>
      <button class="hud-characters" type="button" role="menuitem">👤 캐릭터 선택</button>
    </div>
    <div class="exp">
      <div class="exp-fill"></div>
      <span class="exp-text"></span>
    </div>
    <div class="notice" aria-live="polite" hidden></div>
    `,
  );
  const dialog = createNpcDialog(root);
  const openChoice = () => openJobChoice(dialog, handlers.onChooseJob);

  const pick = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const level = pick('.hud-level');
  const job = pick('.hud-job');
  const advance = pick<HTMLButtonElement>('.hud-advance');
  const rest = pick('.hud-rest');
  const meso = pick('.hud-meso-amount');
  const mute = pick<HTMLButtonElement>('.hud-mute');
  const expFill = pick('.exp-fill');
  const expText = pick('.exp-text');
  const notice = pick('.notice');
  let noticeTimer: number | null = null;

  advance.addEventListener('click', openChoice);

  // HUD 가 좁아서(긴 직업 이름·휴식 중·큰 메소면 이미 꽉 찬다) 소리·설정·캐릭터 선택은 버튼 하나의 메뉴로 묶는다
  const menuButton = pick<HTMLButtonElement>('.hud-menu-button');
  const menu = pick('.hud-menu');
  const setMenuOpen = (open: boolean) => {
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
  };
  menuButton.addEventListener('click', () => setMenuOpen(Boolean(menu.hidden)));
  window.addEventListener('pointerdown', (event) => {
    const target = event.target as Node;
    if (!menu.hidden && !menu.contains(target) && !menuButton.contains(target)) setMenuOpen(false);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenuOpen(false);
  });
  const menuItem = (selector: string, action: () => void) =>
    pick(selector).addEventListener('click', () => {
      setMenuOpen(false);
      action();
    });
  menuItem('.hud-mute', handlers.onToggleMute);
  menuItem('.hud-settings', handlers.onOpenSettings);
  menuItem('.hud-characters', handlers.onOpenCharacterSelect);
  // 아이콘을 못 받으면 깨진 그림 대신 금액만 남는다
  pick('.hud-meso').prepend(loadedImage(MESO_HUD_ICON_URL));
  const shop = pick('.hud-shop');
  shop.addEventListener('click', handlers.onOpenCashShop);
  // 원작 캐시샵의 캐시 동전 그림(13×13)을 받으면 글자 아이콘과 바꾼다
  const coin = cashShopUiUrl('CashItem/0');
  loadWithRetry(coin).then(
    () => shop.replaceChildren(loadedImage(coin)),
    () => {},
  );

  return {
    render(state) {
      level.textContent = `Lv.${state.level}`;
      job.textContent = state.jobTitle;
      advance.hidden = !state.canChooseJob;
      // 직업 선택 대화를 띄운 채 다른 캐릭터로 바꾸면 그 캐릭터에는 맞지 않는 대화가 남는다
      if (!state.canChooseJob) dialog.cancel(JOB_CHOICE_KEY);
      rest.hidden = !state.resting;
      meso.textContent = state.meso.toLocaleString();
      mute.textContent = state.muted ? '🔊 소리 켜기' : '🔇 소리 끄기';
      expFill.style.width = `${(state.ratio * 100).toFixed(2)}%`;
      expText.textContent =
        state.xpForLevel > 0
          ? `EXP ${Math.floor(state.xpIntoLevel).toLocaleString()} / ${state.xpForLevel.toLocaleString()} [${(state.ratio * 100).toFixed(2)}%]`
          : 'MAX';
    },
    notify(text) {
      notice.textContent = text;
      notice.hidden = false;
      if (noticeTimer !== null) window.clearTimeout(noticeTimer);
      noticeTimer = window.setTimeout(() => (notice.hidden = true), NOTICE_MS);
    },
    openJobChoice: openChoice,
    congratulate: (jobLine, tier) => openAdvancementCongratulation(dialog, jobLine, tier),
    closeDialogs: dialog.clear,
  };
}
