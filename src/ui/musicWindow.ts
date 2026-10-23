import type { BgmNowPlaying } from '../audio/bgm';
import { BGM_TRACKS, type BgmFilter, type BgmTrack, filterTracks, findTrack, trackLabel } from '../audio/bgmTracks';
import type { BgmMode } from '../game/settings';
import { wzImageUrl } from '../maple/api';
import { applyArt, loadWithRetry } from './art';

export interface MusicWindowState {
  mode: BgmMode;
  favorites: string[];
  nowPlaying: BgmNowPlaying;
  muted: boolean;
}

export interface MusicWindowHandlers {
  /** ▶. 그 곡을 「한 곡 반복」 으로 튼다 */
  onPlay(track: string): void;
  onToggleFavorite(track: string): void;
  onMode(mode: BgmMode): void;
  onClose(): void;
}

export interface MusicWindow {
  show(state: MusicWindowState): void;
  update(state: MusicWindowState): void;
  hide(): void;
}

// 원작 의자 BGM 고르기 창(UIWindow6.img/BgmChairUI, 214×249)을 352×226 으로 잘라 붙인다. 가로는 제목 글자 오른쪽의
// 무늬만 있는 열 구간(64~201)을 한 번 더 끼우고, 세로는 목록 판 가운데 줄 구간(150~172)을 뺀다
const COLUMNS: [from: number, width: number][] = [
  [0, 107],
  [64, 138],
  [107, 107],
];
const ROWS: [from: number, height: number][] = [
  [0, 150],
  [173, 76],
];

const chair = (path: string) => wzImageUrl(`UI/_Canvas/UIWindow6.img/BgmChairUI/${path}`);
const FRAME_ART = { frame: chair('backgrnd') };
const buttonArt = (node: string) => ({
  normal: chair(`${node}/normal/0`),
  hover: chair(`${node}/mouseOver/0`),
  pressed: chair(`${node}/pressed/0`),
  disabled: chair(`${node}/disabled/0`),
});
const CLOSE_ART = buttonArt('button:close');
/** 목록 칸(183×32, 오른쪽에 ▶). 지금 곡 칸은 원작의 재생 중 애니메이션(파란 칸에 막대 9장)을 돌린다 */
const ROW_ART = {
  ...buttonArt('button:bgm0'),
  ...Object.fromEntries(Array.from({ length: 9 }, (_, frame) => [`play${frame}`, chair(`animation:play0/${frame}`)])),
};
const scroll = (node: string) => wzImageUrl(`UI/_Canvas/Basic.img/VScr107/enabled/${node}`);
/** VScr107 은 위·아래 버튼의 마우스 올림 그림이 보통 그림을 가리키는 링크뿐이라 보통 그림만 쓴다 */
const SCROLL_ART = {
  base: scroll('base'),
  prev: scroll('prev0'),
  next: scroll('next0'),
  thumb: scroll('thumb0'),
  'thumb-hover': scroll('thumb1'),
};

/** 목록 칸 높이. styles.css .music-list 와 같다 */
const ROW_PITCH = 32;
/** VScr107 위·아래 버튼(6×8)과 손잡이(6×29) */
const ARROW_HEIGHT = 8;
const THUMB_HEIGHT = 29;

const MODES: { mode: BgmMode; label: string }[] = [
  { mode: 'map', label: '맵 따라가기' },
  { mode: 'repeat', label: '한 곡 반복' },
  { mode: 'shuffle', label: '즐겨찾기 무작위' },
];
const FILTERS: { filter: BgmFilter; label: string; title: string }[] = [
  { filter: 'all', label: '전체', title: '원작 BGM 전부' },
  { filter: 'favorites', label: '★', title: '즐겨찾기한 곡' },
  { filter: 'maps', label: '맵 곡', title: '이 앱의 마을·사냥터·보스 맵 곡' },
];

/** 고른 방식대로 지금 무엇을 트는지. 즐겨찾기가 없는 「즐겨찾기 무작위」 는 맵 따라가기로 튼다고 알린다 */
export function musicHint(state: Pick<MusicWindowState, 'mode' | 'favorites' | 'muted'>, playingLabel: string | null): { text: string; problem: boolean } {
  const muted = state.muted ? ' · 소리를 꺼 둬서 들리지 않아요(⚙️ 메뉴 「소리 켜기」)' : '';
  if (state.mode === 'shuffle' && state.favorites.length === 0) {
    return { text: `즐겨찾기한 곡이 없어 맵 따라가기로 틀어요. ★ 로 곡을 담아 주세요${muted}`, problem: true };
  }
  if (state.mode === 'shuffle') {
    return { text: `즐겨찾기 ${state.favorites.length}곡을 무작위로 틀어요. 한 곡이 끝나면 다른 곡으로 넘어가요${muted}`, problem: state.muted };
  }
  if (state.mode === 'repeat') {
    return { text: `${playingLabel ?? '고른 곡'}만 반복해요. 맵을 옮겨도 그대로예요${muted}`, problem: state.muted };
  }
  return { text: `맵을 옮기면 그 맵 곡으로 바뀌어요. ▶ 를 누르면 그 곡만 반복해요${muted}`, problem: state.muted };
}

export function createMusicWindow(root: HTMLElement, handlers: MusicWindowHandlers): MusicWindow {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <section class="info-screen music-screen" hidden>
      <div class="music-window" role="dialog" aria-label="BGM 고르기">
        <div class="music-art" aria-hidden="true"></div>
        <p class="music-title" data-tauri-drag-region>PLAYLIST</p>
        <p class="music-now" aria-live="polite" data-tauri-drag-region></p>
        <button class="music-close art-button" type="button" aria-label="닫기">✕</button>
        <div class="music-modes" role="radiogroup" aria-label="트는 방식"></div>
        <div class="music-list" role="listbox" aria-label="원작 BGM"></div>
        <div class="music-scroll" aria-hidden="true">
          <button class="music-scroll-prev" type="button" tabindex="-1"></button>
          <span class="music-scroll-thumb"></span>
          <button class="music-scroll-next" type="button" tabindex="-1"></button>
        </div>
        <div class="music-side">
          <input class="music-search" type="search" placeholder="곡·맵 이름 찾기" aria-label="곡·맵 이름 찾기" spellcheck="false" />
          <div class="music-filters" role="radiogroup" aria-label="목록"></div>
          <p class="music-count"></p>
          <p class="music-hint"></p>
        </div>
      </div>
    </section>
    `,
  );

  const pick = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const screen = pick('.music-screen');
  const frame = pick('.music-window');
  const art = pick('.music-art');
  const now = pick('.music-now');
  const close = pick<HTMLButtonElement>('.music-close');
  const modes = pick('.music-modes');
  const list = pick('.music-list');
  const scrollBar = pick('.music-scroll');
  const thumb = pick('.music-scroll-thumb');
  const search = pick<HTMLInputElement>('.music-search');
  const filters = pick('.music-filters');
  const count = pick('.music-count');
  const hint = pick('.music-hint');

  COLUMNS.reduce((left, [fromX, width]) => {
    ROWS.reduce((top, [fromY, height]) => {
      const strip = document.createElement('span');
      strip.className = 'music-strip';
      strip.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;background-position:-${fromX}px -${fromY}px`;
      art.appendChild(strip);
      return top + height;
    }, 0);
    return left + width;
  }, 0);

  let state: MusicWindowState | null = null;
  let filter: BgmFilter = 'all';
  let shown: BgmTrack[] = [];
  /** 지금 그린 목록의 곡 → 칸. 지금 곡·즐겨찾기만 바뀌면 칸을 다시 만들지 않고 표시만 고친다 */
  const rows = new Map<string, HTMLElement>();

  const modeButtons = MODES.map(({ mode, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'music-mode';
    button.setAttribute('role', 'radio');
    button.textContent = label;
    button.addEventListener('click', () => handlers.onMode(mode));
    modes.appendChild(button);
    return { mode, button };
  });

  const filterButtons = FILTERS.map(({ filter: kind, label, title }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'music-filter';
    button.setAttribute('role', 'radio');
    button.textContent = label;
    button.title = title;
    button.addEventListener('click', () => {
      filter = kind;
      renderList(true);
    });
    filters.appendChild(button);
    return { kind, button };
  });

  function trackRow(track: BgmTrack): HTMLElement {
    const row = document.createElement('div');
    row.className = 'music-row';
    row.setAttribute('role', 'option');
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'music-play';
    const label = document.createElement('span');
    label.className = 'music-row-label';
    label.textContent = trackLabel(track.path);
    const sub = document.createElement('span');
    sub.className = 'music-row-sub';
    sub.textContent = [track.folder, ...track.maps.slice(1)].join(' · ');
    play.append(label, sub);
    play.title = `${[track.path, ...track.maps].join(' · ')}\n누르면 이 곡만 반복해요`;
    play.addEventListener('click', () => handlers.onPlay(track.path));
    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'music-fav';
    star.textContent = '★';
    star.addEventListener('click', () => handlers.onToggleFavorite(track.path));
    row.append(play, star);
    return row;
  }

  function renderMarks() {
    if (!state) return;
    const favorites = new Set(state.favorites);
    const playing = state.nowPlaying.track;
    rows.forEach((row, path) => {
      const isPlaying = path === playing;
      const isFavorite = favorites.has(path);
      row.classList.toggle('is-playing', isPlaying);
      row.classList.toggle('is-loading', isPlaying && state!.nowPlaying.loading);
      row.setAttribute('aria-selected', String(isPlaying));
      const star = row.querySelector<HTMLButtonElement>('.music-fav')!;
      star.classList.toggle('is-on', isFavorite);
      star.setAttribute('aria-pressed', String(isFavorite));
      star.setAttribute('aria-label', `${trackLabel(path)} 즐겨찾기${isFavorite ? ' 빼기' : ''}`);
    });
  }

  function renderList(resetScroll: boolean) {
    if (!state) return;
    shown = filterTracks(BGM_TRACKS, search.value, filter, state.favorites);
    rows.clear();
    list.replaceChildren(
      ...shown.map((track) => {
        const row = trackRow(track);
        rows.set(track.path, row);
        return row;
      }),
    );
    if (resetScroll) list.scrollTop = 0;
    filterButtons.forEach(({ kind, button }) => button.setAttribute('aria-checked', String(kind === filter)));
    const empty = filter === 'favorites' ? '★ 로 담은 곡이 아직 없어요' : '찾는 곡이 없어요';
    count.textContent = shown.length === 0 ? empty : `${BGM_TRACKS.length}곡 중 ${shown.length}곡`;
    renderMarks();
    renderScroll();
  }

  function renderState() {
    if (!state) return;
    const playing = state.nowPlaying.track;
    const label = playing ? trackLabel(playing) : null;
    now.textContent = label ? `♪ ${label}${state.nowPlaying.loading ? ' · 받는 중' : ''}` : '♪ 맵을 불러오는 중';
    now.title = playing ? [playing, ...(findTrack(playing)?.maps ?? [])].join(' · ') : '';
    modeButtons.forEach(({ mode, button }) => {
      button.setAttribute('aria-checked', String(mode === state!.mode));
      // 고른 곡이 없으면 지금 곡을 반복한다. 지금 곡도 없으면 고를 수 없다
      if (mode === 'repeat') button.disabled = state!.mode !== 'repeat' && playing === null;
    });
    const advice = musicHint(state, label);
    hint.textContent = advice.text;
    hint.classList.toggle('is-problem', advice.problem);
    renderMarks();
  }

  function renderScroll() {
    const overflow = list.scrollHeight - list.clientHeight;
    scrollBar.classList.toggle('is-idle', overflow <= 0);
    const track = list.clientHeight - ARROW_HEIGHT * 2 - THUMB_HEIGHT;
    const ratio = overflow > 0 ? list.scrollTop / overflow : 0;
    thumb.style.top = `${ARROW_HEIGHT + Math.round(track * ratio)}px`;
  }

  /** 지금 곡이 보이게 칸 단위로 내린다. scrollIntoView 는 잘라 둔 #app 까지 밀어 올려서 쓰지 않는다 */
  function revealPlaying() {
    const playing = state?.nowPlaying.track;
    const row = playing ? rows.get(playing) : undefined;
    if (!row) return;
    const visibleRows = Math.max(1, Math.floor(list.clientHeight / ROW_PITCH));
    list.scrollTop = Math.max(0, row.offsetTop - list.offsetTop - Math.floor((visibleRows - 1) / 2) * ROW_PITCH);
    renderScroll();
  }

  // 스크롤바: 원작처럼 위·아래 버튼은 한 줄씩, 손잡이는 끌어서 옮긴다. 휠은 목록이 칸 단위로 맞춘다(scroll-snap)
  const step = (by: number) => list.scrollBy({ top: by * ROW_PITCH });
  pick('.music-scroll-prev').addEventListener('click', () => step(-1));
  pick('.music-scroll-next').addEventListener('click', () => step(1));
  list.addEventListener('scroll', renderScroll, { passive: true });
  thumb.addEventListener('pointerdown', (event) => {
    const startY = event.clientY;
    const startTop = list.scrollTop;
    const overflow = list.scrollHeight - list.clientHeight;
    const track = list.clientHeight - ARROW_HEIGHT * 2 - THUMB_HEIGHT;
    // 창 배율(zoom)만큼 포인터가 더 움직인다
    const zoom = list.getBoundingClientRect().height / list.clientHeight || 1;
    thumb.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      list.style.scrollSnapType = 'none';
      list.scrollTop = startTop + ((moveEvent.clientY - startY) / zoom / Math.max(1, track)) * overflow;
    };
    const end = () => {
      list.style.scrollSnapType = '';
      thumb.removeEventListener('pointermove', move);
      thumb.removeEventListener('pointerup', end);
      thumb.removeEventListener('pointercancel', end);
    };
    thumb.addEventListener('pointermove', move);
    thumb.addEventListener('pointerup', end);
    thumb.addEventListener('pointercancel', end);
  });

  search.addEventListener('input', () => renderList(true));
  close.addEventListener('click', handlers.onClose);
  screen.addEventListener('click', (event) => {
    if (event.target === screen) handlers.onClose();
  });
  window.addEventListener('keydown', (event) => {
    if (screen.hidden || event.key !== 'Escape') return;
    // 찾는 글자가 있으면 먼저 지운다
    if (document.activeElement === search && search.value) {
      search.value = '';
      renderList(true);
      return;
    }
    handlers.onClose();
  });

  function dressUp() {
    applyArt(frame, FRAME_ART, 'has-frame-art');
    applyArt(close, CLOSE_ART);
    applyArt(list, ROW_ART);
    applyArt(scrollBar, SCROLL_ART);
  }

  return {
    show(next) {
      state = next;
      dressUp();
      screen.hidden = false;
      renderList(true);
      renderState();
      revealPlaying();
      search.focus();
    },
    update(next) {
      const favoritesChanged = state?.favorites.join('\n') !== next.favorites.join('\n');
      state = next;
      if (screen.hidden) return;
      // 즐겨찾기 목록을 보는 중에 ★ 를 빼면 그 칸이 목록에서 빠진다
      if (favoritesChanged && filter === 'favorites') renderList(false);
      renderState();
    },
    hide() {
      screen.hidden = true;
    },
  };
}

/** 창 그림을 뒤에서 받아 둔다. 창을 열 때 그림을 기다리지 않게 한다 */
export function prefetchMusicWindow(): void {
  [...Object.values(FRAME_ART), ...Object.values(CLOSE_ART), ...Object.values(ROW_ART), ...Object.values(SCROLL_ART)].forEach(
    (url) => void loadWithRetry(url).catch(() => {}),
  );
}
