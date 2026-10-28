import {
  BGM_VOLUME_MAX,
  BOSS_EVERY_OPTIONS,
  DEFAULT_SETTINGS,
  ENCOUNTER_MINUTE_OPTIONS,
  IDLE_MINUTE_OPTIONS,
  LEVEL_UP_SMALL_SCALE,
  type Settings,
  TOWN_ROTATE_MINUTE_OPTIONS,
  bossMesoShare,
  hourlyXp,
} from '../game/settings';
import { townFields } from '../game/routes';
import { townsFor } from '../game/towns';
import { type Era, wzImageUrl } from '../maple/api';
import { applyArt } from './art';
import { hasFinalConsonant } from './npcDialog';

export interface SettingsScreenState {
  settings: Settings;
  /** HUD 의 🔊 버튼과 같은 값(Roster.muted) */
  muted: boolean;
  /** 지금 캐릭터에게 열린 마을. 머물 마을은 이 안에서 고른다 */
  towns: { id: string; name: string }[];
  /** 지금 서 있는 마을. 「머물기」를 처음 누르면 이 마을부터 보여 준다 */
  currentTownId?: string | null;
  /** 지금 캐릭터의 시대. 머물 마을 이름·사냥터를 그 시대 목록에서 찾는다 */
  era?: Era;
}

export interface SettingsHandlers {
  /** 「확인」. 바뀐 것이 없어도 부른다. 화면은 받는 쪽이 닫는다 */
  onSave(settings: Settings, muted: boolean): void;
  /** 「취소」·Esc·창 밖 클릭. 고친 것은 버린다 */
  onCancel(): void;
}

export interface SettingsScreen {
  show(state: SettingsScreenState): void;
  hide(): void;
}

// 원작 시스템 옵션 창(UIWindow2.img/SysOpt). 창 틀(283×354)은 위쪽과 아래 띠만 원본 크기로 잘라 230 높이로 잇고,
// 확인·취소(40×16)·슬라이더(HScr8)·체크 상자(CheckBox0, 11×11)도 원본 크기로 쓴다
const ui = (path: string) => wzImageUrl(`UI/_Canvas/${path}`);
const FRAME = ui('UIWindow2.img/SysOpt/backgrnd');
const buttonArt = (path: string) => ({
  normal: ui(`${path}/normal/0`),
  hover: ui(`${path}/mouseOver/0`),
  pressed: ui(`${path}/pressed/0`),
  disabled: ui(`${path}/normal/0`),
});
const SLIDER_ART = {
  'track-start': ui('Basic.img/HScr8/enabled/prev0'),
  'track-middle': ui('Basic.img/HScr8/enabled/base'),
  'track-end': ui('Basic.img/HScr8/enabled/next0'),
  thumb: ui('Basic.img/HScr8/enabled/thumb0'),
  'thumb-hover': ui('Basic.img/HScr8/enabled/thumb1'),
};
const CHECK_ART = { off: ui('Basic.img/CheckBox0/0'), on: ui('Basic.img/CheckBox0/1') };

type Choice<T> = { value: T; label: string };

const minutes = <T extends number>(options: readonly T[]): Choice<T>[] =>
  options.map((value) => ({ value, label: `${value}분` }));
const withOff = <T>(choices: Choice<T>[]): Choice<T | null>[] => [...choices, { value: null, label: '끄기' }];

const percent = (part: number, whole: number) => Math.round((part / whole) * 100);

function huntHints() {
  // 몬스터·보스를 켜 둔 어느 설정이든 같아서 기본값으로 잰다
  const share = hourlyXp(DEFAULT_SETTINGS);
  const total = share.activity + share.monsters + share.bossBonus;
  return {
    monstersOff: `끄면 보스도 안 나와요. 활동 EXP 만 쌓이고 사냥 몫(시간당 EXP ${percent(share.monsters + share.bossBonus, total)}%)·메소는 못 받아요`,
    bossOff: `끄면 보스 몫(시간당 EXP ${percent(share.bossBonus, total)}%·메소 ${Math.round(bossMesoShare() * 100)}%)은 못 받아요`,
  };
}

const HINTS = {
  default: '몬스터·보스 주기를 바꿔도 시간당 EXP·메소는 같아요',
  encounter: '자주 나오면 한 마리 보상이 줄어서 시간당 EXP·메소는 같아요',
  boss: '자주 나오면 한 번에 덜 줘서 시간당 보상은 같아요',
  damage: '타격할 때 뜨는 대미지 숫자',
  bgm: '음소거는 HUD ⚙️ 메뉴의 「소리 끄기」와 같아요',
  levelUp: `작게는 ${LEVEL_UP_SMALL_SCALE}배예요. 전직 이펙트는 원본 크기 그대로예요`,
  idle: '키보드·마우스를 쓰는 동안만 성장해요. 입력 없이 이만큼 지나면 자리 비움으로 보고 멈춰요 · 읽기·회의가 많으면 늘려요',
};

/** 활동 분을 「40분」·「1시간」·「6시간 40분」으로 */
export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

// 보스 차례는 잡은 마리 수로 세지 않고 활동 시간으로 온다. 「몇 마리 잡으면」으로 읽히지 않게 시간을 같이 적는다
export function bossHint(bossEvery: number, encounterMinutes: number | null): string {
  const every = `사냥 ${bossEvery}번마다 1번은 보스예요`;
  if (encounterMinutes === null) return `${every}. 몬스터를 켜야 나와요`;
  return `${every}(활동 약 ${formatMinutes(bossEvery * encounterMinutes)}마다) · ${HINTS.boss}`;
}

export interface TownStay {
  name: string;
  /** 지금 캐릭터에게 열린 마을인지. 설정은 앱 전체에 하나라 다른 캐릭터로 고른 마을이 아직 안 열렸을 수 있다 */
  open: boolean;
  hasFields: boolean;
}

/** 마을 줄의 지금 값대로 캐릭터가 어떻게 움직이는지 한 문장으로. stay 가 null 이면 마을을 돈다 */
export function townHint(rotateMinutes: number, stay: TownStay | null): string {
  const rotate = `${rotateMinutes}분마다 열린 마을을 고루 돌아다녀요`;
  if (stay === null) return rotate;
  const { name } = stay;
  if (!stay.open) return `${name}${hasFinalConsonant(name) ? '은' : '는'} 이 캐릭터에게 아직 안 열려서 ${rotate}`;
  return stay.hasFields ? `${name}${hasFinalConsonant(name) ? '과' : '와'} 그 사냥터에만 있어요` : `${name}에만 있어요`;
}

export function createSettingsScreen(root: HTMLElement, handlers: SettingsHandlers): SettingsScreen {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <section class="settings" hidden>
      <div class="settings-window" role="dialog" aria-label="설정">
        <p class="settings-title" data-tauri-drag-region>설정</p>
        <div class="settings-body">
          <div class="settings-rows"></div>
          <p class="settings-hint" aria-live="polite"></p>
        </div>
        <div class="settings-buttons">
          <button class="settings-ok art-button" type="button">확인</button>
          <button class="settings-cancel art-button" type="button">취소</button>
        </div>
      </div>
    </section>
    `,
  );

  const pick = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const screen = pick('.settings');
  const frame = pick('.settings-window');
  const rows = pick('.settings-rows');
  const hint = pick('.settings-hint');
  const ok = pick<HTMLButtonElement>('.settings-ok');
  const cancel = pick<HTMLButtonElement>('.settings-cancel');
  const huntHint = huntHints();

  let draft: Settings | null = null;
  let muted = false;
  let towns: SettingsScreenState['towns'] = [];
  let era: Era = 'current';
  let currentTownId: string | null = null;
  // 문자열이 아니라 읽는 함수로 둬야 올려 둔 채 값을 바꿀 때 안내도 따라 바뀐다
  let hoveredHint: (() => string) | null = null;
  const renders: (() => void)[] = [];

  function row(label: string, rowHint: string | (() => string)): HTMLElement {
    const element = document.createElement('div');
    element.className = 'settings-row';
    element.innerHTML = `<span class="settings-label">${label}</span><div class="settings-control"></div>`;
    const showHint = () => {
      hoveredHint = typeof rowHint === 'string' ? () => rowHint : rowHint;
      renderHint();
    };
    const clearHint = () => {
      hoveredHint = null;
      renderHint();
    };
    element.addEventListener('pointerenter', showHint);
    element.addEventListener('pointerleave', clearHint);
    element.addEventListener('focusin', showHint);
    element.addEventListener('focusout', clearHint);
    rows.appendChild(element);
    return element.querySelector<HTMLElement>('.settings-control')!;
  }

  /** 고를 수 있는 값을 모두 늘어놓는다. 한 번 눌러 바로 고른다 */
  function segments<T>(control: HTMLElement, choices: Choice<T>[], read: () => T, write: (value: T) => void, enabled = () => true) {
    const group = document.createElement('div');
    group.className = 'settings-segments';
    group.setAttribute('role', 'radiogroup');
    const buttons = choices.map((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'settings-segment';
      button.setAttribute('role', 'radio');
      button.textContent = choice.label;
      button.addEventListener('click', () => {
        write(choice.value);
        render();
      });
      group.appendChild(button);
      return button;
    });
    control.appendChild(group);
    renders.push(() => {
      const current = read();
      const disabled = !enabled();
      choices.forEach((choice, index) => {
        const selected = choice.value === current;
        buttons[index].classList.toggle('is-selected', selected);
        buttons[index].setAttribute('aria-checked', String(selected));
        buttons[index].disabled = disabled;
      });
    });
  }

  function checkbox(control: HTMLElement, label: string, read: () => boolean, write: (value: boolean) => void) {
    const box = document.createElement('label');
    box.className = 'settings-check';
    box.innerHTML = `<input type="checkbox" /><span class="settings-check-box"></span><span>${label}</span>`;
    const input = box.querySelector('input')!;
    input.addEventListener('change', () => {
      write(input.checked);
      render();
    });
    applyArt(box, CHECK_ART);
    control.appendChild(box);
    renders.push(() => (input.checked = read()));
  }

  const edit = (change: Partial<Settings>) => {
    if (draft) draft = { ...draft, ...change };
  };
  const current = () => draft!;

  segments(
    row('몬스터', () => {
      const { encounterMinutes, bossEvery } = current();
      if (encounterMinutes === null) return huntHint.monstersOff;
      if (bossEvery === null) return HINTS.encounter;
      return `${HINTS.encounter} · 보스는 활동 약 ${formatMinutes(encounterMinutes * bossEvery)}마다`;
    }),
    withOff(minutes(ENCOUNTER_MINUTE_OPTIONS)),
    () => current().encounterMinutes,
    (encounterMinutes) => edit({ encounterMinutes }),
  );
  segments(
    row('보스', () => {
      const { bossEvery, encounterMinutes } = current();
      return bossEvery === null ? huntHint.bossOff : bossHint(bossEvery, encounterMinutes);
    }),
    withOff(BOSS_EVERY_OPTIONS.map((value) => ({ value, label: `${value}번마다` }))),
    () => current().bossEvery,
    (bossEvery) => edit({ bossEvery }),
    () => current().encounterMinutes !== null,
  );
  checkbox(row('데미지', HINTS.damage), '숫자 표시', () => current().damageNumbers, (damageNumbers) => edit({ damageNumbers }));

  // 마을을 돌지 한 곳에 머물지는 pinnedTownId 하나로 정한다. 「돌기」를 눌러도 고른 마을은 기억해 두었다가 「머물기」에 다시 보여 준다
  let lastStayTownId: string | null = null;
  const stayTown = (): TownStay | null => {
    const id = current().pinnedTownId;
    if (id === null) return null;
    const open = towns.some((town) => town.id === id);
    return {
      // 다른 시대 캐릭터가 고른, 이 시대에 없는 마을이어도 이름은 보여 준다
      name: [...townsFor(era), ...townsFor(era === 'classic' ? 'current' : 'classic')].find((town) => town.id === id)?.name ?? id,
      open,
      hasFields: townFields({ id, era }).length > 0,
    };
  };
  const currentTownHint = () => townHint(current().townRotateMinutes, stayTown());
  const townControl = row('마을', currentTownHint);
  segments(
    townControl,
    [
      { value: 'rotate', label: '돌기' },
      { value: 'stay', label: '머물기' },
    ] as Choice<'rotate' | 'stay'>[],
    () => (current().pinnedTownId === null ? 'rotate' : 'stay'),
    (mode) => {
      const pinned = current().pinnedTownId;
      if (mode === 'rotate') {
        if (pinned !== null) lastStayTownId = pinned;
        edit({ pinnedTownId: null });
        return;
      }
      if (pinned !== null) return;
      const isOpen = (id: string | null | undefined) => towns.some((town) => town.id === id);
      const firstStay = [lastStayTownId, currentTownId].find(isOpen) ?? towns[towns.length - 1]?.id ?? null;
      edit({ pinnedTownId: firstStay });
    },
  );
  segments(
    townControl,
    minutes(TOWN_ROTATE_MINUTE_OPTIONS),
    () => current().townRotateMinutes,
    (townRotateMinutes) => edit({ townRotateMinutes }),
  );
  const rotateMinutes = townControl.querySelectorAll<HTMLElement>('.settings-segments')[1];

  // 마을은 열 몇 곳이라 한 줄에 다 못 늘어놓아서 ◀ ▶ 로 넘긴다
  townControl.insertAdjacentHTML(
    'beforeend',
    `<div class="settings-stepper">
      <button class="settings-step" type="button" aria-label="이전 마을">◀</button>
      <output class="settings-step-value"></output>
      <button class="settings-step" type="button" aria-label="다음 마을">▶</button>
    </div>`,
  );
  const townStepper = townControl.querySelector<HTMLElement>('.settings-stepper')!;
  const [townPrevious, townNext] = townControl.querySelectorAll<HTMLButtonElement>('.settings-step');
  const townValue = townControl.querySelector('output')!;
  const townChoices = () => {
    const choices = towns.map((town) => ({ value: town.id, label: town.name }));
    // 다른 캐릭터로 골라 둔, 지금 캐릭터에게는 아직 안 열린 마을도 고른 값으로는 보여 준다. 넘기면 목록에서 빠진다
    const stay = stayTown();
    if (stay && !stay.open) choices.push({ value: current().pinnedTownId!, label: `${stay.name}(안 열림)` });
    return choices;
  };
  const stepTown = (delta: number) => {
    const choices = townChoices();
    if (choices.length === 0) return;
    const index = choices.findIndex((choice) => choice.value === current().pinnedTownId);
    edit({ pinnedTownId: choices[(index + delta + choices.length) % choices.length].value });
    render();
  };
  townPrevious.addEventListener('click', () => stepTown(-1));
  townNext.addEventListener('click', () => stepTown(1));
  renders.push(() => {
    const staying = current().pinnedTownId !== null;
    rotateMinutes.hidden = staying;
    townStepper.hidden = !staying;
    townValue.textContent = townChoices().find((choice) => choice.value === current().pinnedTownId)?.label ?? '';
  });

  const bgmControl = row('배경음악', HINTS.bgm);
  bgmControl.insertAdjacentHTML(
    'beforeend',
    `<input class="settings-slider" type="range" min="0" max="${BGM_VOLUME_MAX}" step="5" aria-label="배경음악 음량" />
     <output class="settings-volume"></output>`,
  );
  const slider = bgmControl.querySelector<HTMLInputElement>('.settings-slider')!;
  const volume = bgmControl.querySelector('output')!;
  slider.addEventListener('input', () => {
    edit({ bgmVolume: Number(slider.value) });
    // 소리를 끈 채 음량을 올리면 들으려는 것이라 음소거를 푼다
    if (Number(slider.value) > 0) muted = false;
    render();
  });
  applyArt(slider, SLIDER_ART);
  renders.push(() => {
    slider.value = String(current().bgmVolume);
    slider.style.setProperty('--fill', `${current().bgmVolume}%`);
    volume.textContent = String(current().bgmVolume);
  });
  checkbox(bgmControl, '음소거', () => muted, (next) => (muted = next));

  // 설정 창 높이에 줄이 더 안 들어가서 전직 알림은 레벨업 줄에 붙인다
  const levelUpControl = row('레벨업', HINTS.levelUp);
  segments(
    levelUpControl,
    [
      { value: 'original', label: '원본' },
      { value: 'small', label: '작게' },
    ] as Choice<Settings['levelUpEffect']>[],
    () => current().levelUpEffect,
    (levelUpEffect) => edit({ levelUpEffect }),
  );
  checkbox(levelUpControl, '전직 알림', () => current().jobAlerts, (jobAlerts) => edit({ jobAlerts }));
  segments(
    row('자리 비움', HINTS.idle),
    minutes(IDLE_MINUTE_OPTIONS),
    () => current().idleMinutes,
    (idleMinutes) => edit({ idleMinutes }),
  );

  function renderHint(): void {
    if (!draft) return;
    let text = hoveredHint?.() ?? null;
    if (text === null && draft.encounterMinutes === null) text = huntHint.monstersOff;
    else if (text === null && draft.bossEvery === null) text = huntHint.bossOff;
    else if (text === null && draft.pinnedTownId !== null) text = currentTownHint();
    hint.textContent = text ?? HINTS.default;
  }

  function render(): void {
    if (!draft) return;
    renders.forEach((each) => each());
    renderHint();
  }

  const close = () => handlers.onCancel();
  ok.addEventListener('click', () => {
    if (draft) handlers.onSave(draft, muted);
  });
  cancel.addEventListener('click', close);
  screen.addEventListener('click', (event) => {
    if (event.target === screen) close();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !screen.hidden) close();
  });

  return {
    show(state) {
      draft = { ...state.settings };
      muted = state.muted;
      towns = state.towns;
      era = state.era ?? 'current';
      currentTownId = state.currentTownId ?? null;
      lastStayTownId = null;
      hoveredHint = null;
      render();
      screen.hidden = false;
      applyArt(frame, { frame: FRAME }, 'has-frame-art');
      applyArt(ok, buttonArt('UIWindow2.img/MemoInGame/Get/BtOK'));
      applyArt(cancel, buttonArt('Basic.img/BtCancel4'));
    },
    hide() {
      screen.hidden = true;
      draft = null;
    },
  };
}
