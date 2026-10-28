import { type Appearance, DEFAULT_APPEARANCE, FACES, GENDERS, type Gender, HAIRS, SKINS, withGender } from '../game/appearance';
import { type CharacterSummary, MAX_CHARACTERS, NAME_MAX_LENGTH, NAME_MIN_LENGTH, nameError } from '../game/characters';
import { describeJob } from '../game/jobs';
import { type Era, characterAnimationUrl, loginBackUrl, loginUiUrl, wzImageUrl } from '../maple/api';
import { applyArt, loadWithRetry, loadedImage } from './art';

export interface CharacterSelectHandlers {
  onStart(id: string): void;
  onCreate(name: string, appearance: Appearance, era: Era): void;
  onDelete(id: string): void;
}

export interface CharacterSelect {
  /** highlightId: 처음에 골라 둘 캐릭터. 캐릭터가 없으면 바로 생성 화면을 연다 */
  show(characters: CharacterSummary[], highlightId: string | null): void;
  hide(): void;
}

type AppearancePart = keyof Appearance;

const PARTS: AppearancePart[] = ['gender', 'hair', 'face', 'skin'];
const PART_LABELS: Record<AppearancePart, string> = { gender: '성별', hair: '헤어', face: '얼굴', skin: '스킨' };
const GENDER_NAMES: Record<Gender, string> = { male: '남자', female: '여자' };
const ERA_HINTS: Record<Era, string> = {
  current: '지금 메이플 마을·몬스터·BGM 으로 자라요',
  classic: '빅뱅 전(v83) 마을·몬스터·BGM 으로 자라요. 만든 뒤에는 못 바꿔요',
};

/** 얼굴·헤어는 성별마다 고를 수 있는 목록이 다르다 */
function partOptions(part: AppearancePart, gender: Gender): readonly (number | Gender)[] {
  if (part === 'gender') return GENDERS;
  if (part === 'hair') return HAIRS[gender];
  if (part === 'face') return FACES[gender];
  return SKINS;
}
/** 원작 캐릭터 생성의 항목 칸. 이름표가 그림에 들어 있다 */
const PART_ROWS: Record<AppearancePart, string> = {
  gender: 'CustomizeChar/3001/avatarSel/gender',
  hair: 'CustomizeChar/2000/avatarSel/1/normal',
  face: 'CustomizeChar/2000/avatarSel/0/normal',
  skin: 'CustomizeChar/3001/avatarSel/skin',
};

// 창이 작아서 원작처럼 선반 두 단을 다 보여 주면 캐릭터가 잘린다. 한 페이지에 선반 한 단(세 명)만 세우고
// 원작 페이지 넘김 버튼으로 넘긴다. 발 높이는 CSS 의 .select-slot·배경 위치와 맞물려 있다
const SLOT_FEET_X = [80, 180, 280];
const SLOTS_PER_PAGE = SLOT_FEET_X.length;
const PAGE_COUNT = Math.ceil(MAX_CHARACTERS / SLOTS_PER_PAGE);

// 페이지 번호 판(CharSelect/pageNew/base)에 두 자리씩 「지금 / 전체」를 찍는 자리(pageNew/numberpos).
// 숫자 그림 대부분은 origin.x 가 -1 이라 1px 오른쪽에 찍힌다(0 만 0)
const PAGE_DIGIT_X = [44, 51, 68, 75];
const PAGE_DIGIT_Y = 6;
const pageDigitShift = (digit: string) => (digit === '0' ? 0 : 1);
const twoDigits = (value: number) => String(value).padStart(2, '0');

interface Frame {
  node: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
}

const frame = (node: string, width: number, height: number, originX: number, originY: number): Frame => ({
  node,
  width,
  height,
  originX,
  originY,
});

// 원작에서 고른 캐릭터 발밑에 도는 빛(CharSelect/character/0)과 뒤에서 퍼지는 빛(CharSelect/effect/1).
// 크기·원점·딜레이는 KMS 389 WZ 값이다. 7번 프레임은 _outlink 가 1번을 가리킨다
const GLOW_DELAY = 130;
const GLOW_FRAMES: Frame[] = [
  frame('CharSelect/character/0/0', 60, 9, 29, 7),
  ...[1, 2, 3, 4, 5, 6, 1].map((index) => frame(`CharSelect/character/0/${index}`, 62, 8, 30, 7)),
];
const BURST_DELAY = 150;
/** CharSelect/pos/avatarPos/effectOffset1 */
const BURST_OFFSET = { x: -5, y: 15 };
const BURST_FRAMES: Frame[] = [
  [167, 166, 84, 183],
  [161, 165, 81, 182],
  [152, 167, 77, 184],
  [151, 168, 74, 185],
  [165, 168, 71, 185],
  [163, 168, 67, 185],
  [181, 167, 88, 184],
  [178, 166, 88, 183],
  [174, 167, 86, 184],
].map(([width, height, originX, originY], index) => frame(`CharSelect/effect/1/${index}`, width, height, originX, originY));
const EMPTY_SLOT = frame('CharSelect/character/1/0', 51, 71, 25, 72);

const buttonArt = (node: string) => ({
  normal: loginUiUrl(`${node}/normal/0`),
  hover: loginUiUrl(`${node}/mouseOver/0`),
  pressed: loginUiUrl(`${node}/pressed/0`),
  disabled: loginUiUrl(`${node}/disabled/0`),
});

// 오른쪽 넘김 버튼의 disabled 는 _outlink 가 normal 을 가리킨다
const PAGE_PREVIOUS_ART = buttonArt('CharSelect/pageL');
const PAGE_NEXT_ART = { ...buttonArt('CharSelect/pageR'), disabled: loginUiUrl('CharSelect/pageR/normal/0') };

// 알림창(Notice)의 취소 버튼은 _outlink 로 이 자리 그림을 가리킨다
const NOTICE_NO = 'Common/Burning/BurningCheckDlg_Tera_Khali/dlgEnable/BtNo';

const LEVEL_GLYPHS = ['lv', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const levelGlyphUrl = (glyph: string) => loginUiUrl(`CharSelect/lv/${glyph}`);
const pageDigitUrl = (digit: string) => loginUiUrl(`CharSelect/pageNew/number/${digit}`);
const PAGE_DIGITS = [...new Set([...Array.from({ length: PAGE_COUNT }, (_, index) => twoDigits(index + 1)), twoDigits(PAGE_COUNT)].join(''))];

const standUrl = (look: number[], era: Era, action = 'stand1') => characterAnimationUrl(look, action, era);

/** 발 위치를 원점으로 프레임마다 원작 origin 에 맞춰 옮겨 그린다. 돌려준 함수로 멈춘다 */
function playFrames(element: HTMLElement, frames: Frame[], delay: number, offset = { x: 0, y: 0 }): () => void {
  let index = 0;
  let timer = 0;
  let stopped = false;
  const draw = (sources: string[]) => {
    const { width, height, originX, originY } = frames[index];
    Object.assign(element.style, {
      left: `${offset.x - originX}px`,
      top: `${offset.y - originY}px`,
      width: `${width}px`,
      height: `${height}px`,
      backgroundImage: `url("${sources[index]}")`,
    });
    index = (index + 1) % frames.length;
  };
  Promise.all(frames.map((each) => loadWithRetry(loginUiUrl(each.node)))).then(
    (sources) => {
      if (stopped) return;
      draw(sources);
      timer = window.setInterval(() => draw(sources), delay);
    },
    () => {},
  );
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}

export function createCharacterSelect(root: HTMLElement, handlers: CharacterSelectHandlers): CharacterSelect {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <section class="select" data-tauri-drag-region hidden>
      <div class="select-frame" data-tauri-drag-region>
        <div class="select-slots" data-tauri-drag-region></div>
        <button class="select-page select-page-previous art-button" type="button" aria-label="이전 페이지">◀</button>
        <button class="select-page select-page-next art-button" type="button" aria-label="다음 페이지">▶</button>
        <button class="select-create art-button" type="button">캐릭터 생성</button>
        <button class="select-delete art-button" type="button">캐릭터 삭제</button>
        <div class="select-info" data-tauri-drag-region>
          <span class="select-info-band is-top"></span>
          <span class="select-info-band is-name"></span>
          <span class="select-info-band is-detail"></span>
          <span class="select-info-band is-bottom"></span>
          <strong class="select-info-name" data-tauri-drag-region></strong>
          <span class="select-info-detail" data-tauri-drag-region>
            <span class="select-info-level"></span>
            <span class="select-info-job"></span>
          </span>
        </div>
        <button class="select-start art-button" type="button">게임 시작</button>
        <div class="select-page-number" data-tauri-drag-region></div>
        <form class="create" data-tauri-drag-region hidden>
          <div class="create-preview" data-tauri-drag-region><img alt="" crossorigin="anonymous" hidden /></div>
          <p class="create-error" aria-live="polite"></p>
          <div class="create-era" role="radiogroup" aria-label="시대">
            <button class="create-era-option" type="button" role="radio" data-era="current">현재 메이플</button>
            <button class="create-era-option" type="button" role="radio" data-era="classic">클래식 (빅뱅 이전)</button>
            <p class="create-era-hint"></p>
          </div>
          <div class="create-fields">
            <span class="create-band is-header"></span>
            <span class="create-band is-paper"></span>
            <span class="create-band is-frame"></span>
            <span class="create-band is-plank"></span>
            <input class="create-name" type="text" maxlength="${NAME_MAX_LENGTH}" placeholder="이름 (${NAME_MIN_LENGTH}~${NAME_MAX_LENGTH}자)" autocomplete="off" spellcheck="false" />
            <div class="create-parts"></div>
            <div class="create-buttons">
              <button class="create-submit art-button" type="submit">만들기</button>
              <button class="create-cancel art-button" type="button">취소</button>
            </div>
          </div>
        </form>
        <div class="select-confirm" hidden>
          <div class="select-confirm-sheet">
            <p class="select-confirm-text"></p>
            <small>삭제한 캐릭터는 되돌릴 수 없어요</small>
            <div class="select-confirm-buttons">
              <button class="select-confirm-delete art-button" type="button">삭제</button>
              <button class="select-confirm-cancel art-button" type="button">취소</button>
            </div>
          </div>
        </div>
      </div>
    </section>
    `,
  );

  const pick = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const screen = pick('.select');
  const slots = pick('.select-slots');
  const info = pick('.select-info');
  const infoName = pick('.select-info-name');
  const infoLevel = pick('.select-info-level');
  const infoJob = pick('.select-info-job');
  const pageNumber = pick('.select-page-number');
  const pagePrevious = pick<HTMLButtonElement>('.select-page-previous');
  const pageNext = pick<HTMLButtonElement>('.select-page-next');
  const start = pick<HTMLButtonElement>('.select-start');
  const create = pick<HTMLButtonElement>('.select-create');
  const remove = pick<HTMLButtonElement>('.select-delete');
  const form = pick<HTMLFormElement>('.create');
  const preview = pick<HTMLImageElement>('.create-preview img');
  const nameInput = pick<HTMLInputElement>('.create-name');
  const parts = pick('.create-parts');
  const error = pick('.create-error');
  const eraOptions = [...root.querySelectorAll<HTMLButtonElement>('.create-era-option')];
  const eraHint = pick('.create-era-hint');
  const submitCreate = pick<HTMLButtonElement>('.create-submit');
  const cancelCreate = pick<HTMLButtonElement>('.create-cancel');
  const confirm = pick('.select-confirm');
  const confirmSheet = pick('.select-confirm-sheet');
  const confirmText = pick('.select-confirm-text');
  const confirmDelete = pick<HTMLButtonElement>('.select-confirm-delete');
  const confirmCancel = pick<HTMLButtonElement>('.select-confirm-cancel');

  let characters: CharacterSummary[] = [];
  let highlightId: string | null = null;
  let page = 0;
  let draft: Appearance = { ...DEFAULT_APPEARANCE };
  let draftEra: Era = 'current';
  let stopEffects: (() => void)[] = [];
  const partIndexes = new Map<AppearancePart, HTMLElement>();
  const partRows = new Map<AppearancePart, HTMLElement>();
  const arrows: [HTMLButtonElement, 'BtLeft' | 'BtRight'][] = [];

  const highlighted = () => characters.find((character) => character.id === highlightId) ?? null;

  function stopSelectEffects() {
    stopEffects.forEach((stop) => stop());
    stopEffects = [];
  }

  function addSprite(feet: HTMLElement, look: number[], era: Era, standAction: string) {
    const url = standUrl(look, era, standAction);
    loadWithRetry(url).then(
      () => {
        if (!feet.isConnected) return;
        // 발이 정중앙이다. translate(-50%) 는 폭이 홀수면 반 픽셀에 걸려 1배 화면에서 픽셀이 뭉개진다
        const sprite = loadedImage(url, (image) => {
          image.style.left = `${-Math.floor(image.naturalWidth / 2)}px`;
          image.style.top = `${-Math.floor(image.naturalHeight / 2)}px`;
        });
        feet.appendChild(sprite);
      },
      () => {},
    );
  }

  function renderSlots() {
    stopSelectEffects();
    slots.replaceChildren(
      ...SLOT_FEET_X.map((feetX, column) => {
        const character = characters[page * SLOTS_PER_PAGE + column];
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.className = 'select-slot';
        slot.style.left = `${feetX}px`;
        slot.innerHTML = `<span class="select-feet"></span><span class="select-name"></span>`;
        const feet = slot.querySelector<HTMLElement>('.select-feet')!;
        const name = slot.querySelector('.select-name')!;
        if (!character) {
          slot.classList.add('is-empty');
          name.textContent = '빈 슬롯';
          slot.title = '캐릭터 생성';
          const ghost = document.createElement('span');
          ghost.className = 'select-ghost';
          Object.assign(ghost.style, {
            left: `${-EMPTY_SLOT.originX}px`,
            top: `${-EMPTY_SLOT.originY}px`,
            width: `${EMPTY_SLOT.width}px`,
            height: `${EMPTY_SLOT.height}px`,
          });
          feet.appendChild(ghost);
          slot.addEventListener('click', openCreate);
          return slot;
        }
        const selected = character.id === highlightId;
        slot.classList.toggle('is-selected', selected);
        if (selected) {
          const burst = document.createElement('span');
          burst.className = 'select-burst';
          const glow = document.createElement('span');
          glow.className = 'select-glow';
          feet.append(burst, glow);
          stopEffects.push(playFrames(burst, BURST_FRAMES, BURST_DELAY, BURST_OFFSET), playFrames(glow, GLOW_FRAMES, GLOW_DELAY));
        }
        addSprite(feet, character.look, character.era, character.standAction);
        name.textContent = character.name;
        if (character.era === 'classic') {
          const badge = document.createElement('span');
          badge.className = 'select-era';
          badge.textContent = '클래식';
          slot.appendChild(badge);
        }
        slot.title = `${character.name} · Lv.${character.level} ${character.jobTitle}${character.era === 'classic' ? ' · 클래식' : ''}`;
        slot.addEventListener('click', () => {
          highlightId = character.id;
          render();
        });
        slot.addEventListener('dblclick', () => handlers.onStart(character.id));
        return slot;
      }),
    );
  }

  function renderInfo() {
    const character = highlighted();
    info.classList.toggle('is-empty', !character);
    infoName.textContent = character?.name ?? '';
    infoJob.textContent = character?.jobTitle ?? '';
    if (!character) {
      infoLevel.replaceChildren();
    } else if (screen.classList.contains('has-level-art')) {
      infoLevel.replaceChildren(
        ...['lv', ...String(character.level)].map((glyph) => loadedImage(levelGlyphUrl(glyph))),
      );
      infoLevel.setAttribute('aria-label', `Lv.${character.level}`);
    } else {
      infoLevel.textContent = `Lv.${character.level}`;
    }
  }

  function renderPageNumber() {
    const current = twoDigits(page + 1);
    const total = twoDigits(PAGE_COUNT);
    pageNumber.setAttribute('aria-label', `${page + 1} / ${PAGE_COUNT} 페이지`);
    if (!pageNumber.classList.contains('has-art')) {
      pageNumber.textContent = `${page + 1} / ${PAGE_COUNT}`;
      return;
    }
    pageNumber.replaceChildren(
      ...[...current, ...total].map((digit, index) => {
        const image = loadedImage(pageDigitUrl(digit));
        image.style.left = `${PAGE_DIGIT_X[index] + pageDigitShift(digit)}px`;
        image.style.top = `${PAGE_DIGIT_Y}px`;
        return image;
      }),
    );
  }

  function render() {
    renderSlots();
    renderInfo();
    renderPageNumber();
    const character = highlighted();
    pagePrevious.disabled = page === 0;
    pageNext.disabled = page === PAGE_COUNT - 1;
    start.disabled = !character;
    remove.disabled = !character;
    create.disabled = characters.length >= MAX_CHARACTERS;
  }

  /** 새 모습을 다 받은 뒤에 바꿔 끼운다. 받는 동안과 실패했을 때는 앞 모습을 그대로 두고, 처음이면 비워 둔다 */
  function renderDraft() {
    const url = standUrl(describeJob(1, null, draft).look, draftEra);
    preview.dataset.want = url;
    loadWithRetry(url).then(
      (src) => {
        if (preview.dataset.want !== url) return;
        preview.onload = () => {
          // 발이 정중앙인 그림이라 반쪽 크기를 정수로 내려 칸 바닥 가운데에 발을 맞춘다
          preview.style.setProperty('--half-width', `${Math.floor(preview.naturalWidth / 2)}px`);
          preview.style.setProperty('--half-height', `${Math.floor(preview.naturalHeight / 2)}px`);
          preview.hidden = false;
        };
        preview.onerror = () => (preview.hidden = true);
        preview.src = src;
      },
      () => {},
    );
    partIndexes.forEach((label, part) => {
      const options = partOptions(part, draft.gender);
      label.textContent =
        part === 'gender' ? GENDER_NAMES[draft.gender] : `${options.indexOf(draft[part]) + 1} / ${options.length}`;
    });
    eraOptions.forEach((option) => {
      const chosen = option.dataset.era === draftEra;
      option.classList.toggle('is-chosen', chosen);
      option.setAttribute('aria-checked', String(chosen));
    });
    eraHint.textContent = ERA_HINTS[draftEra];
  }

  eraOptions.forEach((option) =>
    option.addEventListener('click', () => {
      draftEra = option.dataset.era === 'classic' ? 'classic' : 'current';
      renderDraft();
    }),
  );

  function dressUp() {
    applyArt(screen, { back: loginBackUrl(1), leaves: loginBackUrl(2) }, 'has-back-art');
    applyArt(
      screen,
      {
        'tag-left': loginUiUrl('CharSelect/nameTag/0/0'),
        // 가운데 조각만 _outlink 없이 원래 자리에 들어 있다
        'tag-middle': wzImageUrl('UI/Login.img/CharSelect/nameTag/0/1'),
        'tag-right': loginUiUrl('CharSelect/nameTag/0/2'),
      },
      'has-tag-art',
    );
    applyArt(screen, { ghost: loginUiUrl(EMPTY_SLOT.node) }, 'has-ghost-art');
    applyArt(
      screen,
      Object.fromEntries(LEVEL_GLYPHS.map((glyph) => [`level-${glyph}`, levelGlyphUrl(glyph)])),
      'has-level-art',
      renderInfo,
    );
    applyArt(info, { panel: loginUiUrl('CharSelect/charInfo1') });
    applyArt(
      pageNumber,
      {
        base: loginUiUrl('CharSelect/pageNew/base/0'),
        ...Object.fromEntries(PAGE_DIGITS.map((digit) => [`digit-${digit}`, pageDigitUrl(digit)])),
      },
      'has-art',
      renderPageNumber,
    );
    applyArt(pagePrevious, PAGE_PREVIOUS_ART);
    applyArt(pageNext, PAGE_NEXT_ART);
    applyArt(start, buttonArt('CharSelect/BtSelect'));
    applyArt(create, buttonArt('CharSelect/BtNew'));
    applyArt(remove, buttonArt('CharSelect/BtDelete'));
    applyArt(form, { board: loginUiUrl('NewChar/charSet'), field: loginUiUrl('CustomizeChar/000/charName') });
    applyArt(submitCreate, buttonArt('NewChar/BtYes'));
    applyArt(cancelCreate, buttonArt('NewChar/BtNo'));
    partRows.forEach((row, part) => applyArt(row, { row: loginUiUrl(PART_ROWS[part]) }));
    arrows.forEach(([button, node]) => applyArt(button, buttonArt(`NewChar/${node}`)));
    applyArt(confirmSheet, { paper: loginUiUrl('Notice/backgrnd/0') });
    applyArt(confirmDelete, buttonArt('CharSelect/BtDeleteConfirm'));
    applyArt(confirmCancel, buttonArt(NOTICE_NO));
  }

  PARTS.forEach((part) => {
    const row = document.createElement('div');
    row.className = 'create-part';
    row.innerHTML = `<span></span><button class="art-button" type="button" aria-label="이전">◀</button><output></output><button class="art-button" type="button" aria-label="다음">▶</button>`;
    row.querySelector('span')!.textContent = PART_LABELS[part];
    const [previous, next] = row.querySelectorAll('button');
    const step = (offset: number) => {
      const options = partOptions(part, draft.gender);
      const index = Math.max(0, options.indexOf(draft[part]));
      const value = options[(index + offset + options.length) % options.length];
      draft = part === 'gender' ? withGender(draft, value as Gender) : { ...draft, [part]: value };
      renderDraft();
    };
    previous.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    arrows.push([previous, 'BtLeft'], [next, 'BtRight']);
    partIndexes.set(part, row.querySelector('output')!);
    partRows.set(part, row);
    parts.appendChild(row);
  });

  /** 만드는 동안은 선택 화면의 버튼·캐릭터를 감추고 배경 선반 위에 새 캐릭터만 세운다 */
  function setCreating(open: boolean) {
    form.hidden = !open;
    screen.classList.toggle('is-creating', open);
  }

  function openCreate() {
    if (characters.length >= MAX_CHARACTERS) return;
    draft = { ...DEFAULT_APPEARANCE };
    draftEra = 'current';
    nameInput.value = '';
    error.textContent = '';
    renderDraft();
    setCreating(true);
    nameInput.focus();
  }

  const turnPage = (offset: number) => {
    page = Math.min(PAGE_COUNT - 1, Math.max(0, page + offset));
    render();
  };
  pagePrevious.addEventListener('click', () => turnPage(-1));
  pageNext.addEventListener('click', () => turnPage(1));
  create.addEventListener('click', openCreate);
  cancelCreate.addEventListener('click', () => setCreating(false));
  nameInput.addEventListener('input', () => (error.textContent = ''));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const problem = nameError(nameInput.value, characters.map((character) => character.name));
    if (problem) {
      error.textContent = problem;
      nameInput.focus();
      return;
    }
    setCreating(false);
    handlers.onCreate(nameInput.value.trim(), draft, draftEra);
  });

  start.addEventListener('click', () => {
    if (highlightId) handlers.onStart(highlightId);
  });
  remove.addEventListener('click', () => {
    const character = highlighted();
    if (!character) return;
    confirmText.textContent = `‘${character.name}’ (Lv.${character.level}) 캐릭터를 삭제할까요?`;
    confirm.hidden = false;
  });
  confirmCancel.addEventListener('click', () => (confirm.hidden = true));
  confirm.addEventListener('click', (event) => {
    if (event.target === confirm) confirm.hidden = true;
  });
  confirmDelete.addEventListener('click', () => {
    confirm.hidden = true;
    if (highlightId) handlers.onDelete(highlightId);
  });
  screen.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!confirm.hidden) confirm.hidden = true;
    else if (!form.hidden && characters.length > 0) setCreating(false);
  });

  return {
    show(next, nextHighlightId) {
      characters = next;
      highlightId = next.some((character) => character.id === nextHighlightId) ? nextHighlightId : (next[0]?.id ?? null);
      page = Math.max(0, Math.floor(next.findIndex((character) => character.id === highlightId) / SLOTS_PER_PAGE));
      confirm.hidden = true;
      setCreating(false);
      dressUp();
      render();
      screen.hidden = false;
      if (characters.length === 0) openCreate();
    },
    hide() {
      stopSelectEffects();
      screen.hidden = true;
      confirm.hidden = true;
      setCreating(false);
    },
  };
}
