import './styles.css';
import { createBgm, shouldPlayBgm } from './audio/bgm';
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
  pickBoss,
  resolveHunts,
  settleHunt,
} from './game/bosses';
import { type AlertEvent, describeAlert, firstAlert, shouldAlert } from './game/alerts';
import { buyCashItem, equipCash, unequipCash } from './game/cashShop';
import { encountersDue, pickMonster, retimeHunts, skipHunts } from './game/encounters';
import { advancementTier, describeJob } from './game/jobs';
import { levelInfo } from './game/progression';
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
import { type MonsterSpec, type Town, pickNextTown, unlockedTowns } from './game/towns';
import { TRAY_ICON_URL } from './maple/api';
import { createActivitySource } from './platform/activity';
import { loadGameData, writeRoster, writeSettings } from './platform/gameState';
import { createNotifier } from './platform/notification';
import { desktop } from './platform/tauri';
import { createScene } from './scene/scene';
import { type CashShopState, createCashShop } from './ui/cashShop';
import { createCharacterSelect } from './ui/characterSelect';
import { createHud } from './ui/hud';
import { createSettingsScreen } from './ui/settings';

const TICK_MS = 2000;
/** 고정한 마을 맵을 못 받아 왔을 때 다시 받기까지 쉬는 시간 */
const PINNED_TOWN_RETRY_MS = 30 * 1000;

const root = document.querySelector<HTMLElement>('#app')!;
const stage = document.querySelector<HTMLElement>('#stage')!;

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

let screen: 'map' | 'select' | 'shop' | 'settings' = selectedCharacter(roster) ? 'map' : 'select';
let town: Town | null = null;
let townLoading = false;
let townChangedAt = Date.now();
let lastLevel: { characterId: string; level: number } | null = null;
let lastTrayStatus = '';
let panelVisible = true;
/** 보스나 보스 맵을 못 받아 온 사냥 번호. 그 차례는 보통 몬스터로 치르고, 모인 보스 몫은 남아 다음 사냥에 다시 보스를 부른다 */
let bossSkippedAt = -1;
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

const scene = await createScene(stage, { onKill: handleKill });

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
  });
}

function closeSettings(): void {
  screen = 'map';
  settingsScreen.hide();
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

/** 싸우는 도중에 몬스터를 껐으면 그 한 마리는 기본 주기로 친다 */
const currentPace = (): HuntPace => huntPace(settings) ?? DEFAULT_PACE;

function handleKill(monster: MonsterSpec): number {
  const character = selectedCharacter(roster);
  if (!character || !town) return 0;
  const { xp, meso } = settleHunt(character, currentPace(), town, false);
  character.killXp += xp;
  character.meso += meso;
  character.monsterBook[monster.name] = (character.monsterBook[monster.name] ?? 0) + 1;
  writeRoster(roster);
  void tick();
  return meso;
}

/** counted: 사냥 차례로 센 보스인지. 개발용으로 불러낸 보스는 사냥 횟수에 안 센다 */
function handleBossKill(boss: BossSpec, counted: boolean): number {
  const character = selectedCharacter(roster);
  if (!character || !town) return 0;
  const pace = currentPace();
  // 개발용으로 불러낸 보스는 사냥 진행을 건드리지 않고 보스 한 번 몫만 준다
  const { xp, meso } = counted
    ? settleHunt(character, pace, town, true)
    : { xp: bossXp(pace), meso: bossMeso(town, Math.random, pace) };
  character.killXp += xp;
  character.meso += meso;
  character.monsterBook[boss.name] = (character.monsterBook[boss.name] ?? 0) + 1;
  writeRoster(roster);
  hud.notify(`보스 ${boss.name} 처치 · EXP +${Math.round(xp).toLocaleString()} · 메소 +${meso.toLocaleString()}`);
  void tick();
  return meso;
}

/** encounterNumber: 이 보스가 맡은 사냥 번호. 개발용으로 불러낸 보스는 null */
function fightBoss(boss: BossSpec, encounterNumber: number | null): void {
  scene
    .startBossFight(boss, bossHits(), {
      // 숨겨진 동안 치른 보스는 장면 없이 정산되니 보스 곡으로 바꾸지 않는다
      onArrive: () => {
        if (isShown()) bgm.setMap(boss.mapId);
      },
      onDefeat: () => handleBossKill(boss, encounterNumber !== null),
      onReturn: () => {
        if (town) bgm.setTown(town);
      },
    })
    .catch(() => {
      if (encounterNumber !== null) bossSkippedAt = encounterNumber;
      hud.notify(`보스 ${boss.name} 맵을 불러오지 못했어요`);
    });
}

function syncRunning(): void {
  const running = isShown() && screen === 'map';
  scene.setRunning(running);
  bgm.setEnabled(shouldPlayBgm({ muted: roster.muted, volume: settings.bgmVolume, screen, windowVisible: isShown() }));
}

function moveTo(next: Town): void {
  if (townLoading) return;
  townLoading = true;
  townChangedAt = Date.now();
  scene
    .setTown(next)
    .then(() => {
      town = next;
      bgm.setTown(next);
    })
    .catch(() => hud.notify(`${next.name} 맵을 불러오지 못했어요`))
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
    // 자동 이동을 껐거나 마을을 고정했으면 새 마을로도 옮기지 않는다
    if (isShown() && !scene.inEncounter && townRotateMs(settings) !== null) moveTo(opened[opened.length - 1]);
  }
}

function settleMissedHunts(character: Character, count: number, level: number, pace: HuntPace): void {
  if (!town || count <= 0) return;
  // 밀린 차례 중 보스 차례는 보스로 정산한다. 레벨에 맞는 보스가 없으면 보통 몬스터로 친다
  const result = resolveHunts(character, pace, level, town, count);
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

  const job = characterJob(character, info.level);
  // 알림을 놓치거나 꺼 둬도 창을 열기 전에 메뉴바에서 기다리는 전직이 보이게 한다
  const trayStatus = job.canChooseJob ? `Lv.${info.level} · 전직 가능!` : `Lv.${info.level}`;
  if (trayStatus !== lastTrayStatus) {
    desktop.setTrayStatus(trayStatus);
    lastTrayStatus = trayStatus;
  }

  if (screen !== 'map') return;

  if (lastLevel?.characterId === character.id && info.level > lastLevel.level) {
    handleLevelUp(character, lastLevel.level, info.level);
  }
  lastLevel = { characterId: character.id, level: info.level };

  scene.setJob(job);
  hud.render({
    level: info.level,
    jobTitle: job.title,
    canChooseJob: job.canChooseJob,
    ratio: info.ratio,
    xpIntoLevel: info.xpIntoLevel,
    xpForLevel: info.xpForLevel,
    meso: character.meso,
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

  const rotateMs = townRotateMs(settings);
  if (!scene.inEncounter) {
    if (pinned) {
      if (pinned.id !== town.id && Date.now() - townChangedAt > PINNED_TOWN_RETRY_MS) moveTo(pinned);
    } else if (rotateMs !== null && Date.now() - townChangedAt > rotateMs) {
      moveTo(pickNextTown(info.level, town.id));
    }
  }

  if (forcedBoss && !scene.inEncounter && !townLoading) {
    const wanted = forcedBoss;
    forcedBoss = null;
    fightBoss(BOSSES.find((boss) => String(boss.id) === wanted) ?? pickBoss(info.level) ?? BOSSES[0], null);
    return;
  }

  const pace = huntPace(settings);
  if (!pace) return;
  // 지금 싸우는 몬스터는 아직 정산 전이라 남은 사냥 수에 들어 있다
  const waiting = encountersDue(character, pace.encounterSeconds) - (scene.inEncounter ? 1 : 0);
  if (waiting > 1) settleMissedHunts(character, waiting - 1, info.level, pace);
  if (waiting >= 1 && !scene.inEncounter && !townLoading) {
    const next = character.encountersResolved + 1;
    const boss = bossDue(character, pace) && next !== bossSkippedAt ? pickBoss(info.level) : null;
    if (boss) fightBoss(boss, next);
    else scene.startEncounter(pickMonster(town), 3 + Math.floor(Math.random() * 3));
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
  const character = selectedCharacter(roster);
  if (!character || screen !== 'map') return;
  if (characterJob(character, levelInfo(characterXp(character)).level).canChooseJob) hud.openJobChoice();
});
const applyScale = (scale: number) => {
  document.documentElement.style.setProperty('--ui-scale', String(scale));
  // Windows 125%·150% 디스플레이는 UI 100% 여도 실제 픽셀 배율이 정수가 아니다
  document.documentElement.toggleAttribute('data-fractional-scale', !Number.isInteger(scale * window.devicePixelRatio));
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
window.setInterval(() => void tick(), TICK_MS);
