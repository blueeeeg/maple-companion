import './styles.css';
import { bgmPlayback, createBgm, likelyBgmMaps, shouldPlayBgm } from './audio/bgm';
import {
  type Character,
  MAX_CHARACTERS,
  activityDelta,
  characterJob,
  characterXp,
  createCharacter,
  creditActivity,
  nameError,
  selectedCharacter,
  summarizeCharacter,
} from './game/characters';
import {
  BOSSES,
  type BossSpec,
  DEFAULT_PACE,
  type HuntPace,
  bossDue,
  bossHits,
  bossMeso,
  bossXp,
  drawFromBag,
  pickBoss,
  reservedBoss,
  resolveHunts,
  settleHunt,
} from './game/bosses';
import { bossTurn, settleBossFight } from './game/bossChallenge';
import { type AlertEvent, describeAlert, firstAlert, shouldAlert } from './game/alerts';
import { buyCashItem, equipCash, unequipCash } from './game/cashShop';
import { encountersDue, pickMonster, retimeHunts, skipHunts } from './game/encounters';
import { advancementTier, describeJob } from './game/jobs';
import { levelInfo } from './game/progression';
import { bossRecord, noteAdvancements } from './game/records';
import { canCast, findSkill, skillDataPrefetchOrder } from './game/skillBook';
import { newCharacterId } from './game/save';
import {
  BGM_VOLUME_MAX,
  DEFAULT_SETTINGS,
  type Settings,
  huntPace,
  idleLimitSeconds,
  levelUpScale,
  pinnedTown,
  townRotateMs,
} from './game/settings';
import { fieldMoveDue, fieldMoves, pickFieldMove, routePortals, townFields } from './game/routes';
import { type RouteField, isPassage } from './game/routeCuration';
import { type MonsterSpec, type Town, drawFromTownBag, pickNextTown, rewardTown, unlockedTowns } from './game/towns';
import { updateNotice } from './game/updates';
import { TRAY_ICON_URL } from './maple/api';
import { warmMaps } from './maple/portal';
import { canDrawSkill, loadSkill, prefetchSkillData } from './maple/skills';
import { SKILL_STORE_CAP_BYTES } from './maple/skillStore';
import { createActivitySource } from './platform/activity';
import { loadGameData, writeRoster, writeSettings } from './platform/gameState';
import { createNotifier } from './platform/notification';
import { desktop } from './platform/tauri';
import { startUpdateChecks } from './platform/updater';
import { createScene } from './scene/scene';
import { frameOffset, viewportFor } from './scene/viewport';
import { type BossWindowState, createBossWindow, prefetchBossWindow } from './ui/bossWindow';
import { type CashShopState, createCashShop } from './ui/cashShop';
import { createCharacterSelect } from './ui/characterSelect';
import { createHud } from './ui/hud';
import { type MusicWindowState, createMusicWindow, prefetchMusicWindow } from './ui/musicWindow';
import { createSettingsScreen } from './ui/settings';
import { type SkillCheck, type SkillWindowState, createSkillWindow, prefetchSkillWindow } from './ui/skillWindow';
import { type StatWindowState, createStatWindow } from './ui/statWindow';

const TICK_MS = 2000;
/** 창을 숨겨 둔 동안의 틱 간격. 사냥 정산은 다시 보일 때 하니 알림·트레이 글자만 조금 늦게 바뀐다 */
const HIDDEN_TICK_MS = 10 * 1000;
/** 스킬창에서 스킬을 쓴 뒤 다음 스킬을 쓰기까지 쉬는 시간 */
const CAST_COOLDOWN_MS = 3000;
/** 고정한 마을 맵을 못 받아 왔을 때 다시 받기까지 쉬는 시간 */
const PINNED_TOWN_RETRY_MS = 30 * 1000;

const root = document.querySelector<HTMLElement>('#app')!;
const stage = document.querySelector<HTMLElement>('#stage')!;

/** DOM 크기를 창 배율에 맞춘다. 360×230 으로 짠 팝업은 --frame-x·y 만큼 옮겨 가운데에 둔다 */
function applyLayoutScale(scale: number): void {
  const { view, zoom } = viewportFor(scale);
  const frame = frameOffset(view);
  const style = document.documentElement.style;
  style.setProperty('--ui-scale', String(zoom));
  style.setProperty('--view-width', `${view.width}px`);
  style.setProperty('--view-height', `${view.height}px`);
  style.setProperty('--frame-x', `${frame.x}px`);
  style.setProperty('--frame-y', `${frame.y}px`);
  // Windows 125%·150% 디스플레이는 UI 100% 여도 실제 픽셀 배율이 정수가 아니다
  document.documentElement.toggleAttribute('data-fractional-scale', !Number.isInteger(zoom * window.devicePixelRatio));
}
// 화면을 그리기 전에 창 크기에 맞춰 둬야 큰 창에서 첫 화면이 360×230 으로 떴다가 커지지 않는다
applyLayoutScale(await desktop.initialScale());

const activity = createActivitySource();
const bgm = createBgm();
const notifier = createNotifier();
desktop.refreshTrayIcon(TRAY_ICON_URL);

// Rust 의 활동 시간은 캐릭터 구분 없는 앱 전체 누적값이라, 이번 실행의 첫 값은 늘어난 몫을 재는 기준으로만 쓴다
const firstSnapshot = await activity.snapshot();
let lastGlobalActiveSeconds = firstSnapshot.activeSeconds;
const gameData = await loadGameData(firstSnapshot.activeSeconds);
const roster = gameData.roster;
writeRoster(roster);
let settings = gameData.settings;

let screen: 'map' | 'select' | 'shop' | 'settings' | 'stat' | 'skill' | 'boss' | 'music' =selectedCharacter(roster) ? 'map' : 'select';
let town: Town | null = null;
let townLoading = false;
let townChangedAt = Date.now();
/** 마을에서 포털로 걸어 들어간 사냥터. 마을 맵에 있으면 null */
let field: RouteField | null = null;
/** 지금 맵(마을·사냥터)에 들어온 시각과 거기서 잡은 몬스터 수. 사냥터로 옮길 때를 정한다 */
let arrivedAt = Date.now();
let huntsHere = 0;
/** 이번 마을에서 맵을 못 받아 온 사냥터. 다른 마을로 가면 다시 시도한다 */
const skippedFields = new Set<number>();
let lastLevel: { characterId: string; level: number } | null = null;
let lastTrayStatus = '';
/** 트레이 메뉴에서 받을 수 있는 새 버전 */
let availableUpdate: string | null = null;
let panelVisible = true;
/** 보스나 보스 맵을 못 받아 온 사냥 번호. 그 차례는 보통 몬스터로 치르고, 모인 보스 몫은 남아 다음 사냥에 다시 보스를 부른다 */
let bossSkippedAt = -1;
/** 지금 싸우는 보스가 어떤 싸움인지. 보스 맵에 들어가 마을로 돌아올 때까지 남는다 */
let bossFight: BossFight['kind'] | null = null;
let lastCastAt = -Infinity;
/** 스킬창 아이콘을 미리 받아 둔 직업·차수 */
let prefetchedSkillBook = '';
/** 개발용. `?boss=8860000` 이면 그 보스, `?boss=1` 이면 레벨에 맞는 보스와 바로 한 번 싸운다. 사냥 횟수에는 안 센다 */
let forcedBoss = import.meta.env.DEV ? new URLSearchParams(location.search).get('boss') : null;
/** 이번 실행에 OS 알림으로 알린 일. 전직은 레벨이 오르는 순간에만 알려서 다시 켜도 같은 일이 또 오지 않는다 */
const sentAlerts = new Set<string>();

const isShown = () => panelVisible && document.visibilityState === 'visible';
const summaries = () => roster.characters.map(summarizeCharacter);

const hud = createHud(root, {
  onChooseJob(id) {
    const character = selectedCharacter(roster);
    if (!character) return;
    character.jobLine = id;
    writeRoster(roster);
    void tick().then(() => scene.celebrate('전직!'));
  },
  onToggleMute() {
    // 설정에서 음량을 0 으로 내려 둔 채 소리를 켜면 들리지 않으니 기본 음량으로 되돌린다
    if (!isMuted()) roster.muted = true;
    else {
      roster.muted = false;
      if (settings.bgmVolume === 0) applySettings({ ...settings, bgmVolume: DEFAULT_SETTINGS.bgmVolume });
    }
    writeRoster(roster);
    syncRunning();
    void tick();
  },
  onOpenCharacterSelect: openCharacterSelect,
  onOpenCashShop: openCashShop,
  onOpenSettings: openSettings,
  onOpenMusic: openMusic,
  onOpenStat: openStat,
  onOpenSkill: openSkill,
  onOpenBoss: openBoss,
});

const characterSelect = createCharacterSelect(root, {
  onStart(id) {
    roster.selectedId = id;
    writeRoster(roster);
    screen = 'map';
    characterSelect.hide();
    syncRunning();
    void tick();
  },
  onCreate(name, appearance) {
    const takenNames = roster.characters.map((character) => character.name);
    if (roster.characters.length >= MAX_CHARACTERS || nameError(name, takenNames)) return;
    const character = createCharacter(newCharacterId(), name, appearance);
    roster.characters.push(character);
    writeRoster(roster);
    characterSelect.show(summaries(), character.id);
  },
  onDelete(id) {
    roster.characters = roster.characters.filter((character) => character.id !== id);
    if (roster.selectedId === id) roster.selectedId = null;
    writeRoster(roster);
    characterSelect.show(summaries(), roster.selectedId);
  },
});

/** 캐시샵에서 고른 캐릭터를 바꾼 뒤 저장하고 상점 화면을 다시 그린다 */
function changeWardrobe(change: (character: Character) => void): void {
  const character = selectedCharacter(roster);
  if (!character) return;
  change(character);
  writeRoster(roster);
  cashShop.update(cashShopState(character));
}

const cashShop = createCashShop(root, {
  onBuy(itemId) {
    changeWardrobe((character) => {
      if (buyCashItem(character, itemId)) character.cashEquipped = equipCash(character.cashEquipped, itemId);
    });
  },
  onEquip(itemId) {
    changeWardrobe((character) => {
      if (character.wardrobe.includes(itemId)) character.cashEquipped = equipCash(character.cashEquipped, itemId);
    });
  },
  onUnequip(slot) {
    changeWardrobe((character) => (character.cashEquipped = unequipCash(character.cashEquipped, slot)));
  },
  onClose() {
    screen = 'map';
    cashShop.hide();
    syncRunning();
    void tick();
  },
});

const settingsScreen = createSettingsScreen(root, {
  onSave(next, muted) {
    applySettings(next);
    roster.muted = muted;
    writeRoster(roster);
    closeSettings();
  },
  onCancel: closeSettings,
});

const statWindow = createStatWindow(root, { onClose: closeInfoWindow });
const skillWindow = createSkillWindow(root, { onChoose: chooseHuntSkill, onCast: castSkill, onClose: closeInfoWindow });
const bossWindow = createBossWindow(root, { onReserve: reserveBoss, onChallenge: challengeBoss, onClose: closeInfoWindow });
const musicWindow = createMusicWindow(root, {
  onPlay: (track) => applyMusic({ bgmMode: 'repeat', bgmTrack: track }),
  onToggleFavorite(track) {
    const favorites = settings.bgmFavorites.includes(track)
      ? settings.bgmFavorites.filter((each) => each !== track)
      : [...settings.bgmFavorites, track];
    applyMusic({ bgmFavorites: favorites });
  },
  onMode(mode) {
    // 고른 곡 없이 「한 곡 반복」 을 누르면 지금 곡을 반복한다
    const track = mode === 'repeat' ? (settings.bgmTrack ?? bgm.nowPlaying().track) : settings.bgmTrack;
    if (mode === 'repeat' && !track) return;
    applyMusic({ bgmMode: mode, bgmTrack: track });
  },
  onClose: closeMusic,
});
bgm.onChange(() => {
  if (screen === 'music') musicWindow.update(musicState());
});

const scene = await createScene(stage, {
  onKill: handleKill,
  onSkillUnusable(skillId, name) {
    const character = selectedCharacter(roster);
    if (!character || character.huntSkillId !== skillId) return;
    character.huntSkillId = null;
    writeRoster(roster);
    hud.notify(`${name} · 그릴 이펙트가 없어 자동 스킬로 싸워요`);
  },
});

const isMuted = () => roster.muted || settings.bgmVolume === 0;

/** 바뀐 설정을 저장하고 화면·소리·활동 집계에 건다. 앱을 켤 때도 한 번 부른다 */
function applySettings(next: Settings): void {
  const before = settings;
  settings = next;
  writeSettings(settings);
  const pace = huntPace(settings);
  // 몬스터 주기가 바뀌면 캐릭터마다 쌓인 진행이 새 주기로 한꺼번에 몰리지 않게 다시 맞춘다. 설정은 모든 캐릭터에 걸린다
  if (pace && pace.encounterSeconds !== huntPace(before)?.encounterSeconds) {
    roster.characters.forEach((character) => retimeHunts(character, pace.encounterSeconds));
    writeRoster(roster);
  }
  // 새로 고정한 마을로는 다음 틱에 바로 옮긴다
  if (settings.pinnedTownId !== null && settings.pinnedTownId !== before.pinnedTownId) townChangedAt = 0;
  scene.setDamageNumbers(settings.damageNumbers);
  scene.setLevelUpScale(levelUpScale(settings));
  bgm.setVolume(settings.bgmVolume / BGM_VOLUME_MAX);
  bgm.setPlayback(bgmPlayback(settings));
  activity.setIdleLimit(idleLimitSeconds(settings));
}

/** 캐시샵처럼 맵·BGM 을 멈추고 창 안에 설정을 띄운다. 트레이 메뉴 「설정」 과 HUD 버튼이 연다 */
function openSettings(): void {
  const character = selectedCharacter(roster);
  if (!character || screen !== 'map') return;
  screen = 'settings';
  syncRunning();
  const { level } = levelInfo(characterXp(character));
  settingsScreen.show({
    settings,
    muted: roster.muted,
    towns: unlockedTowns(level).map(({ id, name }) => ({ id, name })),
    currentTownId: town?.id ?? null,
  });
}

function closeSettings(): void {
  screen = 'map';
  settingsScreen.hide();
  syncRunning();
  void tick();
}

function musicState(): MusicWindowState {
  return { mode: settings.bgmMode, favorites: settings.bgmFavorites, nowPlaying: bgm.nowPlaying(), muted: isMuted() };
}

/** BGM 고르기 창에서 고친 것은 확인 없이 바로 저장하고 튼다. 들어 보며 고르는 창이다 */
function applyMusic(change: Partial<Settings>): void {
  applySettings({ ...settings, ...change });
  musicWindow.update(musicState());
}

/** 다른 정보창처럼 맵은 멈추지만 BGM 은 그대로 튼다. HUD ⚙️ 메뉴 「BGM 고르기」가 연다 */
function openMusic(): void {
  if (!selectedCharacter(roster) || screen !== 'map') return;
  screen = 'music';
  syncRunning();
  musicWindow.show(musicState());
}

function closeMusic(): void {
  screen = 'map';
  musicWindow.hide();
  syncRunning();
  void tick();
}

function openCharacterSelect(): void {
  screen = 'select';
  // 다른 캐릭터로 들어가면 앞 캐릭터의 전직 대화가 남지 않게 한다
  hud.closeDialogs();
  syncRunning();
  characterSelect.show(summaries(), roster.selectedId);
}

function cashShopState(character: Character): CashShopState {
  const { level } = levelInfo(characterXp(character));
  return {
    gender: character.appearance.gender,
    jobLook: describeJob(level, character.jobLine, character.appearance).look,
    meso: character.meso,
    wardrobe: character.wardrobe,
    equipped: character.cashEquipped,
  };
}

/** 캐릭터 선택 화면처럼 맵·BGM 을 멈추고 창 안에 상점을 띄운다 */
function openCashShop(): void {
  const character = selectedCharacter(roster);
  if (!character || screen !== 'map') return;
  screen = 'shop';
  syncRunning();
  cashShop.show(cashShopState(character));
}

function statState(character: Character): StatWindowState {
  const info = levelInfo(characterXp(character));
  const job = characterJob(character, info.level);
  return {
    name: character.name,
    level: info.level,
    jobTitle: job.title,
    tier: job.tier,
    xpIntoLevel: info.xpIntoLevel,
    xpForLevel: info.xpForLevel,
    ratio: info.ratio,
    activeSeconds: character.activeSeconds,
    hunts: character.encountersResolved,
    bosses: bossRecord(character.monsterBook),
    meso: character.meso,
    advancedAt: character.advancedAt,
    look: job.look,
  };
}

function skillState(character: Character): SkillWindowState {
  const job = characterJob(character, levelInfo(characterXp(character)).level);
  return { jobLine: character.jobLine, tier: job.tier, huntSkillId: character.huntSkillId };
}

/** 캐시샵처럼 맵·BGM 을 멈추고 창 안에 캐릭터 정보창·스킬창·보스 도전 창을 띄운다. HUD 의 스탯·스킬·보스 버튼이 연다 */
function openInfoWindow(kind: 'stat' | 'skill' | 'boss'): void {
  const character = selectedCharacter(roster);
  if (!character || screen !== 'map') return;
  screen = kind;
  syncRunning();
  if (kind === 'stat') statWindow.show(statState(character));
  else if (kind === 'skill') skillWindow.show(skillState(character));
  else bossWindow.show(bossState(character));
}

function openStat(): void {
  openInfoWindow('stat');
}

function openSkill(): void {
  openInfoWindow('skill');
}

function openBoss(): void {
  openInfoWindow('boss');
}

/** 보스와 싸울 수 없는 까닭. 창이 떠 있는 동안 맵이 멈춰 있어 싸우던 몬스터는 창을 닫아야 끝난다 */
function challengeBlocked(): string | null {
  if (bossFight !== null) return '보스와 싸우는 중이에요';
  if (scene.inEncounter) return '몬스터와 싸우는 중이에요. 창을 닫고 잡은 뒤에 도전할 수 있어요';
  if (townLoading) return '맵을 옮기는 중이에요. 잠시 뒤 다시 도전해 주세요';
  if (!town) return '맵을 불러오는 중이에요';
  return null;
}

function bossState(character: Character): BossWindowState {
  return {
    level: levelInfo(characterXp(character)).level,
    monsterBook: character.monsterBook,
    reservedBossId: character.reservedBossId,
    turn: bossTurn(character, huntPace(settings)),
    blocked: challengeBlocked(),
  };
}

/** 다음 보스 차례에 나올 보스를 정한다. 보상은 어느 보스든 같다 */
function reserveBoss(bossId: number | null): void {
  const character = selectedCharacter(roster);
  if (!character) return;
  const boss = BOSSES.find((each) => each.id === bossId);
  if (boss && boss.minLevel > levelInfo(characterXp(character)).level) return;
  character.reservedBossId = boss ? boss.id : null;
  writeRoster(roster);
  bossWindow.update(bossState(character));
}

/**
 * 보스 도전 창의 「지금 도전」. 보스 차례가 와 있으면 그 차례를 써서 보통 보스처럼 싸우고, 아니면 보상 없는 연습전이다.
 * 연습전은 보스 몫·사냥 시계를 건드리지 않는다
 */
function challengeBoss(bossId: number, practice: boolean): string | null {
  const character = selectedCharacter(roster);
  const boss = BOSSES.find((each) => each.id === bossId);
  if (!character || !boss) return '보스를 찾지 못했어요';
  if (boss.minLevel > levelInfo(characterXp(character)).level) return `Lv.${boss.minLevel}부터 도전할 수 있어요`;
  const blocked = challengeBlocked();
  if (blocked) return blocked;
  const ready = bossTurn(character, huntPace(settings)).kind === 'ready';
  // 창을 연 사이 차례가 바뀌었으면 연습전을 진짜 싸움으로 바꾸지 않고 창에서 다시 고르게 한다
  if (!practice && !ready) return '보스 차례가 아니에요. 연습전으로 도전할 수 있어요';
  fightBoss(boss, { kind: practice ? 'practice' : 'challenge' });
  closeInfoWindow();
  if (practice) hud.notify(`연습전 · ${boss.name} · 경험치·메소·처치 기록이 없어요`);
  return null;
}

function closeInfoWindow(): void {
  screen = 'map';
  statWindow.hide();
  skillWindow.hide();
  bossWindow.hide();
  syncRunning();
  void tick();
}

/**
 * 스킬창에서 고른 사냥 스킬을 맵에 그릴 수 있는지 받아 보고 저장한다. 겉모습만 바뀌고 보상은 같다.
 * 받은 스킬은 맵이 같은 것을 다시 받지 않게 남는다
 */
async function chooseHuntSkill(skillId: number | null): Promise<SkillCheck> {
  const character = selectedCharacter(roster);
  if (!character) return 'failed';
  if (skillId !== null) {
    const job = characterJob(character, levelInfo(characterXp(character)).level);
    try {
      if (!canDrawSkill(await loadSkill(skillId, job.fallbackRange))) return 'noArt';
    } catch {
      return 'failed';
    }
    // 받는 동안 창을 닫고 다른 캐릭터로 바꿨으면 저장하지 않는다
    if (selectedCharacter(roster) !== character) return 'failed';
  }
  character.huntSkillId = skillId;
  writeRoster(roster);
  skillWindow.update(skillState(character));
  return 'ok';
}

/**
 * 스킬창의 「쓰기」. 누르는 즉시 창을 닫고 받아 둔 동작으로 쓰기 시작한다. 창이 떠 있는 동안은 맵이 멈춰 있어 창 너머로는
 * 안 보여서다. 이펙트는 기기에 남긴 데이터나 받는 대로 얹는다. 겉모습뿐이라 사냥·보상과 상관없고, 연달아 눌러 이펙트가
 * 쌓이지 않게 잠깐 쉰다
 */
async function castSkill(skillId: number): Promise<SkillCheck> {
  const character = selectedCharacter(roster);
  if (!character) return 'failed';
  const { tier } = characterJob(character, levelInfo(characterXp(character)).level);
  if (!canCast(character.jobLine, tier, skillId)) return 'failed';
  if (performance.now() - lastCastAt < CAST_COOLDOWN_MS) return 'cooldown';
  lastCastAt = performance.now();
  closeInfoWindow();
  const name = findSkill(character.jobLine, skillId)?.name ?? '스킬';
  void scene.castSkill(skillId).then((result) => {
    if (result === 'noArt') hud.notify(`${name} · 그릴 이펙트가 없어 동작만 했어요`);
    else if (result === 'failed') hud.notify(`${name} 이펙트를 받지 못했어요. 다시 누르면 다시 받아요`);
    else if (result === 'late') hud.notify(`${name} 이펙트를 받는 데 오래 걸려 이번엔 동작만 했어요. 다음엔 바로 나와요`);
    else if (result === 'notReady') hud.notify('맵을 불러오는 중이라 쓰지 못했어요');
  });
  return 'ok';
}

/** 싸우는 도중에 몬스터를 껐으면 그 한 마리는 기본 주기로 친다 */
const currentPace = (): HuntPace => huntPace(settings) ?? DEFAULT_PACE;

function handleKill(monster: MonsterSpec): number {
  const character = selectedCharacter(roster);
  if (!character || !town) return 0;
  const { level } = levelInfo(characterXp(character));
  const { xp, meso } = settleHunt(character, currentPace(), rewardTown(level), false);
  character.killXp += xp;
  character.meso += meso;
  character.monsterBook[monster.name] = (character.monsterBook[monster.name] ?? 0) + 1;
  huntsHere += 1;
  writeRoster(roster);
  void tick();
  return meso;
}

/**
 * turn: 사냥 차례로 나온 보스, challenge: 보스 도전 창에서 보스 차례를 써서 부른 보스(둘 다 보통 보스로 정산),
 * practice: 보상 없는 연습전, dev: 개발용으로 불러낸 보스(사냥 진행을 건드리지 않고 보스 한 번 몫만 준다)
 */
type BossFight = { kind: 'turn'; encounterNumber: number } | { kind: 'challenge' | 'practice' | 'dev' };

function handleBossKill(boss: BossSpec, fight: BossFight): number {
  const character = selectedCharacter(roster);
  if (!character || !town) return 0;
  const pace = currentPace();
  const { level: bossLevel } = levelInfo(characterXp(character));
  const reward = rewardTown(bossLevel);
  if (fight.kind === 'practice') {
    settleBossFight(character, pace, reward, boss, true);
    hud.notify(`연습전 끝 · ${boss.name} · 경험치·메소·처치 기록 없음`);
    return 0;
  }
  let xp: number;
  let meso: number;
  if (fight.kind === 'dev') {
    xp = bossXp(pace);
    meso = bossMeso(reward, Math.random, pace);
    character.killXp += xp;
    character.meso += meso;
    character.monsterBook[boss.name] = (character.monsterBook[boss.name] ?? 0) + 1;
  } else ({ xp, meso } = settleBossFight(character, pace, reward, boss, false));
  writeRoster(roster);
  hud.notify(`보스 ${boss.name} 처치 · EXP +${Math.round(xp).toLocaleString()} · 메소 +${meso.toLocaleString()}`);
  void tick();
  return meso;
}

function fightBoss(boss: BossSpec, fight: BossFight): void {
  const practice = fight.kind === 'practice';
  bossFight = fight.kind;
  if (practice) hud.setPractice(boss.name);
  const done = () => {
    bossFight = null;
    hud.setPractice(null);
  };
  scene
    .startBossFight(boss, bossHits(), {
      // 숨겨진 동안 치른 보스는 장면 없이 정산되니 보스 곡으로 바꾸지 않는다
      onArrive: () => {
        if (isShown()) bgm.setMap(boss.mapId);
      },
      onDefeat: () => handleBossKill(boss, fight),
      onReturn: () => {
        // 사냥터에서 부른 보스는 그 사냥터로 돌아온다
        if (field) bgm.setMap(field.mapId);
        else if (town) bgm.setTown(town);
      },
    })
    .then(done, () => {
      done();
      // 도전 창에서 고른 보스를 못 불렀으면 보스 차례는 그대로 두고 다음 차례에 다시 나온다
      if (fight.kind === 'turn') bossSkippedAt = fight.encounterNumber;
      hud.notify(`보스 ${boss.name} 맵을 불러오지 못했어요`);
    });
}

let tickTimer = 0;
let tickShown: boolean | null = null;
function scheduleTick(): void {
  window.clearTimeout(tickTimer);
  tickShown = isShown();
  tickTimer = window.setTimeout(() => void tick().finally(scheduleTick), tickShown ? TICK_MS : HIDDEN_TICK_MS);
}

function syncRunning(): void {
  const running = isShown() && screen === 'map';
  scene.setRunning(running);
  // 숨긴 창에서 HUD 의 무한 CSS 애니메이션이 합성기를 깨우지 않게 멈춘다
  document.documentElement.toggleAttribute('data-hidden', !isShown());
  if (tickShown !== null && tickShown !== isShown()) scheduleTick();
  // 정보창·스킬창도 캐시샵처럼 맵을 멈추는 창이라 BGM 도 캐시샵과 같이 다룬다
  const bgmScreen = screen === 'stat' || screen === 'skill' || screen === 'boss' ? 'shop' : screen;
  bgm.setEnabled(shouldPlayBgm({ muted: roster.muted, volume: settings.bgmVolume, screen: bgmScreen, windowVisible: isShown() }));
}

function moveTo(next: Town): void {
  if (townLoading) return;
  townLoading = true;
  townChangedAt = Date.now();
  scene
    .setTown(next)
    .then(() => {
      town = next;
      field = null;
      arrivedAt = Date.now();
      huntsHere = 0;
      skippedFields.clear();
      bgm.setTown(next);
      scene.setRoutePortals(routePortals(next, townFields(next)));
      warmMaps(townFields(next).map((each) => each.mapId));
    })
    .catch(() => hud.notify(`${next.name} 맵을 불러오지 못했어요`))
    .finally(() => (townLoading = false));
}

/** 마을 맵과 그 마을 사냥터 사이를 포털로 걸어서 옮긴다. 마을 자동 이동·고정은 마을 단위라 사냥터에 있어도 그대로 돈다 */
function travelField(current: Town): void {
  const moves = fieldMoves(current.mapId, townFields(current), field?.mapId ?? current.mapId);
  const move = pickFieldMove(moves, skippedFields);
  // 갈 곳이 없거나 못 갔어도 다음 차례까지 다시 고르지 않는다
  arrivedAt = Date.now();
  huntsHere = 0;
  if (!move) return;
  townLoading = true;
  // 통로 맵은 사냥 없이 지나가며 포털을 이어 탄다. 중간에 못 가면 그때 있는 맵에 남는다
  move.hops
    .reduce(
      (previous, hop) =>
        previous.then(() =>
          scene.travel(hop.toMapId, hop.field?.name ?? current.name, hop.exit, hop.arrival).then(
            () => {
              field = hop.field;
              arrivedAt = Date.now();
              if (field) bgm.setMap(field.mapId);
              else bgm.setTown(current);
            },
            (error: unknown) => {
              // 돌아가는 길은 이미 다녀온 맵이라 막지 않는다
              if (hop.field && hop.field.fromMapId === (field?.mapId ?? current.mapId)) skippedFields.add(hop.toMapId);
              throw error;
            },
          ),
        ),
      Promise.resolve(),
    )
    .catch(() => {})
    .finally(() => (townLoading = false));
}

function alertUser(event: AlertEvent): void {
  const alert = describeAlert(event);
  if (!shouldAlert(settings, { shown: isShown(), focused: document.hasFocus() })) return;
  if (firstAlert(sentAlerts, alert.key)) notifier.notify(alert.title, alert.body);
}

function handleLevelUp(character: Character, from: number, to: number): void {
  scene.celebrate('LEVEL UP!');
  const who = { characterId: character.id, characterName: character.name };

  // 직업을 아직 안 골랐으면 1차 전직 레벨이 된 그때 한 번만 직업을 묻는다. 닫아도 HUD 의 「전직 가능!」 버튼이 남는다
  if (!character.jobLine && advancementTier(from) === 0 && advancementTier(to) > 0) {
    hud.openJobChoice();
    alertUser({ kind: 'job-choice', ...who, level: to });
  }
  if (character.jobLine && advancementTier(to) > advancementTier(from)) {
    const job = describeJob(to, character.jobLine, character.appearance);
    scene.celebrate(`${job.tier}차 전직!`);
    hud.notify(`전직 완료: ${job.title}`);
    hud.congratulate(character.jobLine, job.tier);
    alertUser({ kind: 'advancement', ...who, tier: job.tier, jobTitle: job.title });
  }

  const opened = unlockedTowns(to).filter((candidate) => candidate.minLevel > from);
  if (opened.length > 0) {
    hud.notify(`새 마을: ${opened.map((candidate) => candidate.name).join(', ')}`);
    // 열린 마을에 머물기로 했으면 새 마을로도 옮기지 않는다
    if (isShown() && !scene.inEncounter && pinnedTown(settings, to) === null) moveTo(opened[opened.length - 1]);
  }
}

function settleMissedHunts(character: Character, count: number, level: number, pace: HuntPace): void {
  if (!town || count <= 0) return;
  // 밀린 차례 중 보스 차례는 보스로 정산한다. 레벨에 맞는 보스가 없으면 보통 몬스터로 친다
  // 메소 보상은 표시 마을이 아닌 레벨 기준 최고 마을로 계산한다
  const result = resolveHunts(character, pace, level, rewardTown(level), count, Math.random, character.reservedBossId);
  if (result.reservationUsed) character.reservedBossId = null;
  character.killXp += result.xp;
  character.meso += result.meso;
  Object.entries(result.kills).forEach(([name, kills]) => {
    character.monsterBook[name] = (character.monsterBook[name] ?? 0) + kills;
  });
  writeRoster(roster);
  const bosses = Object.entries(result.bosses);
  const bossCount = bosses.reduce((sum, [, kills]) => sum + kills, 0);
  const bossText = bosses.map(([name, kills]) => ` · 보스 ${name}${kills > 1 ? ` ${kills}번` : ''} 처치`).join('');
  hud.notify(
    `비운 사이 ${count - bossCount}마리 사냥${bossText} · EXP +${Math.round(result.xp).toLocaleString()} · 메소 +${result.meso.toLocaleString()}`,
  );
}

async function tick(): Promise<void> {
  const snapshot = await activity.snapshot();
  // 캐릭터 선택 화면에 있는 동안에도 마지막으로 플레이한 캐릭터에 쌓인다
  const delta = activityDelta(lastGlobalActiveSeconds, snapshot.activeSeconds);
  if (creditActivity(roster, delta)) {
    // 몬스터를 꺼 둔 동안의 활동 시간은 사냥으로 치지 않는다. 다시 켜도 그동안의 몬스터가 한꺼번에 나오지 않는다
    if (!huntPace(settings)) skipHunts(selectedCharacter(roster)!, delta);
    writeRoster(roster);
  }
  lastGlobalActiveSeconds = snapshot.activeSeconds;

  const character = selectedCharacter(roster);
  if (!character) return;
  const info = levelInfo(characterXp(character));
  // 마을이 열리거나 캐릭터를 바꾸면 목록이 바뀐다. 같은 목록이면 bgm 이 무시한다
  // 지금 마을의 사냥터는 몇 분 안에 들어가서 먼저 받는다
  bgm.prefetch([...(town ? townFields(town).map((each) => each.mapId) : []), ...likelyBgmMaps(info.level, character.townBag)]);

  const job = characterJob(character, info.level);
  // 전직 날짜는 화면과 상관없이 그 차수가 된 틱에 적는다. 직업을 늦게 골랐으면 고른 틱이 그 날이다
  if (noteAdvancements(character.advancedAt, job.tier, Date.now()).length > 0) writeRoster(roster);
  // 스킬창을 열 때 아이콘을 기다리지 않게 켤 때와 직업·차수가 바뀔 때 뒤에서 받아 둔다
  const skillBookKey = `${character.jobLine}|${job.tier}`;
  if (skillBookKey !== prefetchedSkillBook) {
    prefetchedSkillBook = skillBookKey;
    const { jobLine } = character;
    // 아이콘을 다 받은 뒤에 스킬창에서 쓰거나 사냥에 쓸(자동 포함) 스킬 데이터를 작은 것부터 하나씩 받아 기기에 남긴다
    void prefetchSkillWindow(jobLine, job.tier).then(() =>
      prefetchSkillData(skillDataPrefetchOrder(jobLine, job.tier, job.skillId, SKILL_STORE_CAP_BYTES / 1024)),
    );
  }
  // 알림을 놓치거나 꺼 둬도 창을 열기 전에 메뉴바에서 기다리는 전직이 보이게 한다
  const trayStatus = job.canChooseJob ? `Lv.${info.level} · 전직 가능!` : `Lv.${info.level}`;
  if (trayStatus !== lastTrayStatus) {
    desktop.setTrayStatus(trayStatus);
    lastTrayStatus = trayStatus;
  }

  // 열어 둔 정보창은 함께한 시간·경험치가 늘어나는 대로 고친다
  if (screen === 'stat') statWindow.update(statState(character));
  if (screen === 'skill') skillWindow.update(skillState(character));
  if (screen === 'boss') bossWindow.update(bossState(character));
  if (screen !== 'map') return;

  if (lastLevel?.characterId === character.id && info.level > lastLevel.level) {
    handleLevelUp(character, lastLevel.level, info.level);
  }
  lastLevel = { characterId: character.id, level: info.level };

  scene.setJob(job);
  scene.setName(character.name);
  hud.render({
    level: info.level,
    jobTitle: job.title,
    canChooseJob: job.canChooseJob,
    ratio: info.ratio,
    xpIntoLevel: info.xpIntoLevel,
    xpForLevel: info.xpForLevel,
    muted: isMuted(),
    resting: snapshot.idleSeconds >= snapshot.idleLimitSeconds,
  });

  const pinned = pinnedTown(settings, info.level);
  if (!town) {
    moveTo(pinned ?? pickNextTown(info.level, null));
    return;
  }
  // 다른 캐릭터로 바꿔 들어오면 아직 레벨이 모자란 마을에 서 있을 수 있다
  if (town.minLevel > info.level && !scene.inEncounter) {
    moveTo(pinned ?? pickNextTown(info.level, town.id));
    return;
  }
  // 창이 안 보이는 동안은 정산을 미뤘다가 다시 보일 때 한 번에 알려준다
  if (!isShown()) return;

  if (!scene.inEncounter) {
    if (pinned) {
      if (pinned.id !== town.id && Date.now() - townChangedAt > PINNED_TOWN_RETRY_MS) moveTo(pinned);
    } else if (Date.now() - townChangedAt > townRotateMs(settings)) {
      const drawn = drawFromTownBag(character.townBag, character.lastTownId, info.level);
      if (drawn) {
        character.townBag = drawn.bag;
        character.lastTownId = drawn.lastTownId;
        writeRoster(roster);
        moveTo(drawn.town);
      }
    }
  }

  // 통로 맵에 남았으면(이어 가다 못 갔으면) 머물지 않고 바로 옮긴다
  const inPassage = field !== null && isPassage(field);
  if (!scene.inEncounter && !townLoading && (inPassage || fieldMoveDue({ hunts: huntsHere, sinceArrivalMs: Date.now() - arrivedAt }))) {
    travelField(town);
  }

  if (forcedBoss && !scene.inEncounter && !townLoading) {
    const wanted = forcedBoss;
    forcedBoss = null;
    fightBoss(BOSSES.find((boss) => String(boss.id) === wanted) ?? pickBoss(info.level) ?? BOSSES[0], { kind: 'dev' });
    return;
  }

  const pace = huntPace(settings);
  if (!pace) return;
  // 지금 싸우는 몬스터는 아직 정산 전이라 남은 사냥 수에 들어 있다
  const waiting = encountersDue(character, pace.encounterSeconds) - (scene.inEncounter ? 1 : 0);
  if (waiting > 1) settleMissedHunts(character, waiting - 1, info.level, pace);
  if (waiting >= 1 && !scene.inEncounter && !townLoading) {
    const next = character.encountersResolved + 1;
    let boss: BossSpec | null = null;
    if (bossDue(character, pace) && next !== bossSkippedAt) {
      const reserved = reservedBoss(info.level, character.reservedBossId);
      if (reserved) {
        boss = reserved;
      } else {
        const drawn = drawFromBag(character.bossBag, character.lastBossId, info.level);
        if (drawn) {
          character.bossBag = drawn.bag;
          character.lastBossId = drawn.lastBossId;
          writeRoster(roster);
          boss = drawn.boss;
        }
      }
    }
    if (boss) fightBoss(boss, { kind: 'turn', encounterNumber: next });
    else {
      // 사냥터에서는 그 맵의 실제 몬스터가 나온다. 보상은 마을 기준 그대로다
      const monster = pickMonster(field && !isPassage(field) ? { ...town, monsters: field.monsters } : town);
      scene.startEncounter(monster, 3 + Math.floor(Math.random() * 3));
    }
  }
}

desktop.onVisibilityChange((visible) => {
  panelVisible = visible;
  syncRunning();
  if (visible) void tick();
});
desktop.onModeChange((mode) => (document.body.dataset.mode = mode));
desktop.onOpenSettings(openSettings);
// 직업 고르기 대화를 닫아 버린 뒤에 알림을 눌렀어도 다시 묻는다. 이미 떠 있으면 대화창이 무시한다
notifier.onOpen(() => {
  // 업데이트 버튼은 트레이 메뉴에 있어서 창에서는 거기로 안내만 한다
  if (availableUpdate) hud.notify(updateNotice(availableUpdate).body);
  const character = selectedCharacter(roster);
  if (!character || screen !== 'map') return;
  if (characterJob(character, levelInfo(characterXp(character)).level).canChooseJob) hud.openJobChoice();
});
startUpdateChecks({
  onFound(version, firstTime) {
    availableUpdate = version;
    // 전직 알림 설정과 따로 늘 알린다. 새 버전마다 한 번뿐이다
    if (!firstTime) return;
    const notice = updateNotice(version);
    notifier.notify(notice.title, notice.body);
  },
  onStarted: () => hud.notify('업데이트 받는 중… 끝나면 저절로 다시 켜져요'),
  onFailed() {
    // Rust 가 메뉴바 글자에 띄운 진행 표시를 다음 틱에 원래 글자로 되돌린다
    lastTrayStatus = '';
    hud.notify('업데이트하지 못했어요. 트레이 메뉴에서 다시 눌러 주세요');
  },
});
const applyScale = (scale: number) => {
  applyLayoutScale(scale);
  scene.setDisplayScale(scale);
};
desktop.onScaleChange(applyScale);
document.addEventListener('visibilitychange', () => {
  syncRunning();
  if (isShown()) void tick();
});

document.body.dataset.mode = await desktop.initialMode();
applyScale(await desktop.initialScale());
applySettings(settings);
if (screen === 'select') openCharacterSelect();
syncRunning();
await tick();
scheduleTick();
// 보스 도전 창의 아이콘 열네 개를 창을 열기 전에 뒤에서 받아 둔다
prefetchBossWindow();
prefetchMusicWindow();
