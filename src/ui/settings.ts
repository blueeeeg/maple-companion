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
import { wzImageUrl } from '../maple/api';
import { applyArt } from './art';

export interface SettingsScreenState {
  settings: Settings;
  /** HUD 의 🔊 버튼과 같은 값(Roster.muted) */
  muted: boolean;
  /** 지금 캐릭터에게 열린 마을. 마을 고정은 이 안에서 고른다 */
  towns: { id: string; name: string }[];
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
  boss: '자주 나오면 한 번에 덜, 드물게 나오면 더 줘서 시간당 보상은 같아요',
  damage: '타격할 때 뜨는 대미지 숫자',
  rotate: '정해 둔 시간마다 최근에 열린 마을 중 하나로 옮겨요',
  pinned: '마을을 고정하면 자동 이동은 쉬어요. 아직 안 열린 캐릭터는 자동으로 돌아요',
  bgm: '음소거는 HUD ⚙️ 메뉴의 「소리 끄기」와 같아요',
  levelUp: `작게는 ${LEVEL_UP_SMALL_SCALE}배예요. 전직 이펙트는 원본 크기 그대로예요`,
  idle: '입력이 없는 채로 이 시간이 지나면 활동 시간이 멈춰요',
};

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
  let hoveredHint: string | null = null;
  const renders: (() => void)[] = [];

  function row(label: string, rowHint: string | (() => string)): HTMLElement {
    const element = document.createElement('div');
    element.className = 'settings-row';
    element.innerHTML = `<span class="settings-label">${label}</span><div class="settings-control"></div>`;
    const showHint = () => {
      hoveredHint = typeof rowHint === 'string' ? rowHint : rowHint();
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
    row('몬스터', () => (current().encounterMinutes === null ? huntHint.monstersOff : HINTS.encounter)),
    withOff(minutes(ENCOUNTER_MINUTE_OPTIONS)),
    () => current().encounterMinutes,
    (encounterMinutes) => edit({ encounterMinutes }),
  );
  segments(
    row('보스', () => (current().bossEvery === null ? huntHint.bossOff : HINTS.boss)),
    withOff(BOSS_EVERY_OPTIONS.map((value) => ({ value, label: `${value}마리` }))),
    () => current().bossEvery,
    (bossEvery) => edit({ bossEvery }),
    () => current().encounterMinutes !== null,
  );
  checkbox(row('데미지', HINTS.damage), '숫자 표시', () => current().damageNumbers, (damageNumbers) => edit({ damageNumbers }));

  const rotateControl = row('마을 이동', () => (current().pinnedTownId ? HINTS.pinned : HINTS.rotate));
  checkbox(rotateControl, '자동', () => current().townRotate, (townRotate) => edit({ townRotate }));
  segments(
    rotateControl,
    minutes(TOWN_ROTATE_MINUTE_OPTIONS),
    () => current().townRotateMinutes,
    (townRotateMinutes) => edit({ townRotateMinutes }),
    () => current().townRotate && current().pinnedTownId === null,
  );

  // 마을은 열 몇 곳이라 한 줄에 다 못 늘어놓아서 ◀ ▶ 로 넘긴다. 맨 앞이 「자동」
  const townControl = row('마을 고정', HINTS.pinned);
  townControl.innerHTML = `
    <div class="settings-stepper">
      <button class="settings-step" type="button" aria-label="이전 마을">◀</button>
      <output class="settings-step-value"></output>
      <button class="settings-step" type="button" aria-label="다음 마을">▶</button>
    </div>`;
  const [townPrevious, townNext] = townControl.querySelectorAll<HTMLButtonElement>('.settings-step');
  const townValue = townControl.querySelector('output')!;
  const townChoices = () => {
    const choices: Choice<string | null>[] = [{ value: null, label: '자동' }, ...towns.map((town) => ({ value: town.id, label: town.name }))];
    // 다른 캐릭터로 고정해 둔, 지금 캐릭터에게는 아직 안 열린 마을도 고른 값으로는 보여 준다
    const pinned = current().pinnedTownId;
    if (pinned !== null && !choices.some((choice) => choice.value === pinned)) {
      choices.push({ value: pinned, label: '안 열린 마을' });
    }
    return choices;
  };
  const stepTown = (delta: number) => {
    const choices = townChoices();
    const index = choices.findIndex((choice) => choice.value === current().pinnedTownId);
    edit({ pinnedTownId: choices[(index + delta + choices.length) % choices.length].value });
    render();
  };
  townPrevious.addEventListener('click', () => stepTown(-1));
  townNext.addEventListener('click', () => stepTown(1));
  renders.push(() => {
    const choice = townChoices().find((each) => each.value === current().pinnedTownId);
    townValue.textContent = choice?.label ?? '자동';
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

  segments(
    row('레벨업', HINTS.levelUp),
    [
      { value: 'original', label: '원본' },
      { value: 'small', label: '작게' },
    ] as Choice<Settings['levelUpEffect']>[],
    () => current().levelUpEffect,
    (levelUpEffect) => edit({ levelUpEffect }),
  );
  segments(
    row('자리 비움', HINTS.idle),
    minutes(IDLE_MINUTE_OPTIONS),
    () => current().idleMinutes,
    (idleMinutes) => edit({ idleMinutes }),
  );

  function renderHint(): void {
    if (!draft) return;
    let text = hoveredHint;
    if (text === null && draft.encounterMinutes === null) text = huntHint.monstersOff;
    else if (text === null && draft.bossEvery === null) text = huntHint.bossOff;
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
