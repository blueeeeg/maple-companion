import { isChairItem } from '../game/chairs';
import type { JobBranchId, JobLineId, JobPath } from '../game/jobs';
import { cashShopUiUrl, itemIconUrl, wzImageUrl } from '../maple/api';
import { applyArt, cropArt, loadWithRetry, loadedImage } from './art';
import { PRACTICE_BANNER_URL } from './bossWindow';
import { type GlyphBox, isQuickKeyBlue, keyOutBackground, keyOutFaint } from './glyph';
import {
  BRANCH_CHOICE_KEY,
  JOB_CHOICE_KEY,
  type JobChangeHandlers,
  type JobChangeOffer,
  createNpcDialog,
  openAdvancementCongratulation,
  openBranchChoice,
  openJobChange,
  openJobChoice,
} from './npcDialog';

export interface HudState {
  level: number;
  jobTitle: string;
  canChooseJob: boolean;
  /** 2차 갈래를 고를 계열. 고를 것이 없으면 null */
  branchChoice: JobLineId | null;
  ratio: number;
  xpIntoLevel: number;
  xpForLevel: number;
  muted: boolean;
  resting: boolean;
}

export interface HudHandlers {
  onChooseJob(id: JobLineId): void;
  onChooseBranch(id: JobBranchId): void;
  onToggleMute(): void;
  onOpenCharacterSelect(): void;
  onOpenCashShop(): void;
  onOpenSettings(): void;
  onOpenMusic(): void;
  onOpenStat(): void;
  onOpenSkill(): void;
  onOpenBoss(): void;
  onOpenEquip(): void;
}

export interface Hud {
  render(state: HudState): void;
  /** EXP 바 위에 한 줄로 잠깐 띄운다. 새 알림이 오면 이전 것을 바로 바꾼다 */
  notify(text: string): void;
  /** 직업을 묻는 NPC 대화를 연다. 다른 대화가 떠 있으면 그 뒤에 연다 */
  openJobChoice(): void;
  /** 2차 전직 레벨에 그 계열 전직관이 갈래를 묻는다 */
  openBranchChoice(line: JobLineId): void;
  /** 같은 계열의 다른 갈래로 바꾸는 대화 */
  openJobChange(offer: JobChangeOffer, handlers: JobChangeHandlers): void;
  /** 2차 이상 전직 때 그 직업 전직관의 축하 대화를 띄운다. 게임을 멈추지 않는다 */
  congratulate(path: JobPath, tier: number): void;
  /** 떠 있거나 기다리는 NPC 대화를 모두 닫는다 */
  closeDialogs(): void;
  /** NPC 대화가 떠 있거나 알림 줄이 아직 보인다. 이때 알리면 대화에 가리거나 앞 알림을 바로 덮는다 */
  isBusy(): boolean;
  /** 연습전 동안 보스 게이지 아래에 원작 연습 모드 표시를 띄운다. null 이면 내린다 */
  setPractice(bossName: string | null): void;
  /** 얻은 컬렉션 장비를 아이콘과 함께 화면 위쪽에 잠깐 띄운다. 맨 아래 알림 줄과 따로라 정산 알림과 같이 보인다 */
  notifyItems(items: { itemId: number; name: string }[], source: string): void;
}

const NOTICE_MS = 4000;
const ITEM_NOTICE_MS = 6000;

/** StatusBar.img StatKey·SkillKey(28×20)에서 파란 버튼 안쪽만 본다. 바깥 3px 은 버튼 테두리·광택이다 */
const QUICK_KEY_INSIDE = { x: 3, y: 3, width: 22, height: 14 };

/**
 * 빅뱅 전 상태 바의 스탯·스킬 단축 버튼에서 파란 바탕을 빼고 막대그래프·책 그림(16×12, 18×12)만 떼어 낸다.
 * 옆의 캐시샵·⚙️ 버튼처럼 HUD 의 어두운 칸 안에 원본 크기로 넣는다. 받을 때까지는 글자 버튼이다
 */
function quickKeyGlyph(node: string): Promise<string> {
  const url = wzImageUrl(`UI/_Canvas/StatusBar.img/${node}/normal/0`);
  return cropGlyph(url, `quick-key-${Object.values(QUICK_KEY_INSIDE).join(',')}`, (pixels, width) =>
    keyOutBackground(pixels, width, QUICK_KEY_INSIDE, isQuickKeyBlue),
  );
}

/**
 * 원작 메뉴의 「보스」 버튼(StatusBar3.img 커뮤니티 메뉴, 109×26)에서 글자 그림(24×11)만 쓴다.
 * 바탕에 알파 17 의 옅은 점이 깔려 있어서 그보다 진한 픽셀만 남긴다
 */
const BOSS_GLYPH_MIN_ALPHA = 48;
const BOSS_MENU_GLYPH = wzImageUrl('UI/_Canvas/StatusBar3.img/mainBar/submenu/community/button:boss/normal/0');

/** 뗀 그림은 기기에 남긴다. 떼는 법(keyOut)을 바꾸면 version 을 올린다 */
function cropGlyph(
  url: string,
  version: string,
  keyOut: (pixels: Uint8ClampedArray, width: number) => GlyphBox | null,
): Promise<string> {
  return cropArt(url, version, (image) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const box = keyOut(pixels.data, canvas.width);
    if (!box) throw new Error(`${url} 그림이 비었다`);
    context.putImageData(pixels, 0, 0);
    const glyph = document.createElement('canvas');
    glyph.width = box.width;
    glyph.height = box.height;
    glyph.getContext('2d')!.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    return glyph.toDataURL();
  });
}

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
      <button class="hud-stat hud-key" type="button" aria-label="캐릭터 정보" title="캐릭터 정보">스탯</button>
      <button class="hud-skill hud-key" type="button" aria-label="스킬" title="스킬">스킬</button>
      <button class="hud-boss hud-key" type="button" aria-label="보스 도전" title="보스 도전">보스</button>
      <button class="hud-shop" type="button" aria-label="캐시샵" title="캐시샵">🛍</button>
      <button class="hud-menu-button" type="button" aria-label="메뉴" title="메뉴" aria-haspopup="menu" aria-expanded="false">⚙️</button>
    </header>
    <div class="hud-menu" role="menu" hidden>
      <button class="hud-mute" type="button" role="menuitem"></button>
      <button class="hud-equip" type="button" role="menuitem">🛡 장비</button>
      <button class="hud-music" type="button" role="menuitem">🎵 BGM 고르기</button>
      <button class="hud-settings" type="button" role="menuitem">⚙️ 설정</button>
      <button class="hud-characters" type="button" role="menuitem">👤 캐릭터 선택</button>
    </div>
    <div class="exp">
      <div class="exp-fill"></div>
      <span class="exp-text"></span>
    </div>
    <div class="notice" aria-live="polite" hidden></div>
    <div class="hud-item" role="status" hidden>
      <span class="hud-item-icon"></span>
      <span class="hud-item-text"><strong></strong><small></small></span>
    </div>
    <div class="hud-practice" role="status" hidden>
      <span class="hud-practice-banner">PRACTICE MODE</span>
      <span class="hud-practice-text"></span>
    </div>
    `,
  );
  const dialog = createNpcDialog(root);
  const openChoice = () => openJobChoice(dialog, handlers.onChooseJob);
  const openBranch = (line: JobLineId) => openBranchChoice(dialog, line, handlers.onChooseBranch);
  let branchChoice: JobLineId | null = null;

  const pick = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const level = pick('.hud-level');
  const job = pick('.hud-job');
  const advance = pick<HTMLButtonElement>('.hud-advance');
  const rest = pick('.hud-rest');
  const mute = pick<HTMLButtonElement>('.hud-mute');
  const expFill = pick('.exp-fill');
  const expText = pick('.exp-text');
  const notice = pick('.notice');
  let noticeTimer: number | null = null;
  const itemNotice = pick('.hud-item');
  const itemIcon = pick('.hud-item-icon');
  const itemName = pick('.hud-item-text strong');
  const itemSource = pick('.hud-item-text small');
  let itemTimer: number | null = null;

  advance.addEventListener('click', () => (branchChoice ? openBranch(branchChoice) : openChoice()));

  // HUD 가 좁아서(긴 직업 이름·휴식 중·스탯·스킬 버튼이면 이미 꽉 찬다) 소리·BGM·설정·캐릭터 선택은 버튼 하나의 메뉴로 묶는다
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
  menuItem('.hud-equip', handlers.onOpenEquip);
  menuItem('.hud-music', handlers.onOpenMusic);
  menuItem('.hud-settings', handlers.onOpenSettings);
  menuItem('.hud-characters', handlers.onOpenCharacterSelect);
  const stat = pick<HTMLButtonElement>('.hud-stat');
  const skill = pick<HTMLButtonElement>('.hud-skill');
  stat.addEventListener('click', handlers.onOpenStat);
  skill.addEventListener('click', handlers.onOpenSkill);
  ([
    [stat, 'StatKey'],
    [skill, 'SkillKey'],
  ] as const).forEach(([button, node]) =>
    quickKeyGlyph(node).then(
      (src) => button.replaceChildren(loadedImage(src)),
      () => {},
    ),
  );
  const boss = pick<HTMLButtonElement>('.hud-boss');
  boss.addEventListener('click', handlers.onOpenBoss);
  cropGlyph(BOSS_MENU_GLYPH, `boss-glyph-${BOSS_GLYPH_MIN_ALPHA}`, (pixels, width) => keyOutFaint(pixels, width, BOSS_GLYPH_MIN_ALPHA)).then(
    (src) => boss.replaceChildren(loadedImage(src)),
    () => {},
  );
  const practice = pick('.hud-practice');
  const practiceText = pick('.hud-practice-text');
  const shop = pick('.hud-shop');
  shop.addEventListener('click', handlers.onOpenCashShop);
  // 원작 캐시샵의 캐시 동전 그림(13×13)을 받으면 글자 아이콘과 바꾼다
  const coin = cashShopUiUrl('CashItem/0');
  loadWithRetry(coin).then(
    (src) => shop.replaceChildren(loadedImage(src)),
    () => {},
  );

  return {
    render(state) {
      level.textContent = `Lv.${state.level}`;
      job.textContent = state.jobTitle;
      branchChoice = state.branchChoice;
      advance.hidden = !state.canChooseJob && !state.branchChoice;
      // 직업 선택 대화를 띄운 채 다른 캐릭터로 바꾸면 그 캐릭터에는 맞지 않는 대화가 남는다
      if (!state.canChooseJob) dialog.cancel(JOB_CHOICE_KEY);
      if (!state.branchChoice) dialog.cancel(BRANCH_CHOICE_KEY);
      rest.hidden = !state.resting;
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
    openBranchChoice: openBranch,
    openJobChange: (offer, changeHandlers) => openJobChange(dialog, offer, changeHandlers),
    congratulate: (path, tier) => openAdvancementCongratulation(dialog, path, tier),
    closeDialogs: dialog.clear,
    isBusy: () => dialog.isOpen() || !notice.hidden,
    notifyItems(items, source) {
      if (items.length === 0) return;
      const [first] = items;
      itemIcon.replaceChildren(loadedImage(itemIconUrl(first.itemId)));
      itemName.textContent = items.length > 1 ? `${first.name} 외 ${items.length - 1}개 획득!` : `${first.name} 획득!`;
      itemSource.textContent = `${source} · ${isChairItem(first.itemId) ? '장비 창 「의자」에서 앉을 수 있어요' : '장비 창에서 입을 수 있어요'}`;
      itemNotice.hidden = false;
      if (itemTimer !== null) window.clearTimeout(itemTimer);
      itemTimer = window.setTimeout(() => (itemNotice.hidden = true), ITEM_NOTICE_MS);
    },
    setPractice(bossName) {
      practice.hidden = bossName === null;
      if (bossName === null) return;
      applyArt(pick('.hud-practice-banner'), { banner: PRACTICE_BANNER_URL });
      practiceText.textContent = `${bossName} 연습전 · 경험치·메소·처치 기록 없음`;
    },
  };
}
