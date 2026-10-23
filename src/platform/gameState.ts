import { invoke } from '@tauri-apps/api/core';
import { type Roster, characterXp, emptyRoster, selectedCharacter } from '../game/characters';
import { levelInfo } from '../game/progression';
import { loadRoster, mergeRosters, normalizeRoster, writeRoster as writeLocalRoster } from '../game/save';
import {
  DEFAULT_SETTINGS,
  type Settings,
  loadSettings,
  normalizeSettings,
  writeSettings as writeLocalSettings,
} from '../game/settings';
import { isTauri } from './tauri';

/**
 * 이 localStorage 를 파일로 옮겼다는 표시. localStorage 는 앱마다(개발 빌드·배포 앱) 따로라 표시도 따로 남는다.
 * 옮긴 뒤에도 localStorage 값은 지우지 않고 백업으로 둔다
 */
const MIGRATED_KEY = 'maple-companion:migrated-to-file';

/** Rust game_state.rs 의 LoadedGameState */
interface StoredGameState {
  /** 이 화면 번호. 저장할 때 같이 보내야 Rust 가 받는다. 화면을 새로 띄우면 바뀌어 앞 화면의 늦은 저장을 버린다 */
  session: number;
  version: number;
  roster: unknown;
  settings: unknown;
}

export interface GameData {
  roster: Roster;
  settings: Settings;
}

/** 예전 설정(마을 「자동」 끔)을 옮길 때 쓰는 지금 캐릭터 레벨 */
function selectedLevel(roster: Roster | null): number {
  const character = roster && selectedCharacter(roster);
  return character ? levelInfo(characterXp(character)).level : 1;
}

let saveSession = 0;
let saveSeq = 0;

function saveToFile(patch: { roster?: string; settings?: string }, flush = false): Promise<void> {
  saveSeq += 1;
  return invoke('save_game_state', { patch: { session: saveSession, seq: saveSeq, ...patch }, flush });
}

function fileRoster(raw: unknown): Roster | null {
  if (raw === null || raw === undefined) return null;
  try {
    return normalizeRoster(raw as Partial<Roster>);
  } catch (error) {
    console.error('[game-state] 저장 파일의 캐릭터 목록을 읽지 못했다', error);
    return null;
  }
}

function localMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATED_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Tauri 에서는 app data 의 game-state.json 에서 읽는다. 이 앱의 localStorage 를 아직 안 옮겼으면 파일과 합쳐 파일에 쓴다.
 * 브라우저로 화면만 볼 때는 localStorage 를 그대로 쓴다
 */
export async function loadGameData(globalActiveSeconds: number): Promise<GameData> {
  const fromLocalStorage = (): GameData => {
    const roster = loadRoster(globalActiveSeconds);
    return { roster, settings: loadSettings(selectedLevel(roster)) };
  };
  if (!isTauri) return fromLocalStorage();

  let stored: StoredGameState;
  try {
    stored = await invoke<StoredGameState>('load_game_state');
  } catch (error) {
    console.error('[game-state] 저장 파일을 불러오지 못해 localStorage 로 연다', error);
    return fromLocalStorage();
  }
  saveSession = stored.session;
  const roster = fileRoster(stored.roster);
  const settings =
    stored.settings === null || stored.settings === undefined ? null : normalizeSettings(stored.settings, selectedLevel(roster));
  if (localMigrated()) return { roster: roster ?? emptyRoster(), settings: settings ?? { ...DEFAULT_SETTINGS } };

  const local = fromLocalStorage();
  const data: GameData = { roster: mergeRosters(roster, local.roster), settings: settings ?? local.settings };
  try {
    await saveToFile({ roster: JSON.stringify(data.roster), settings: JSON.stringify(data.settings) }, true);
    localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
  } catch (error) {
    // 표시를 안 남겼으니 다음 실행에 다시 합친다. 같은 캐릭터는 id 로 합쳐져서 두 번 들어가지 않는다
    console.error('[game-state] localStorage 를 저장 파일로 옮기지 못했다', error);
  }
  return data;
}

export function writeRoster(roster: Roster): void {
  if (!isTauri) {
    writeLocalRoster(roster);
    return;
  }
  saveToFile({ roster: JSON.stringify(roster) }).catch((error) => console.error('[game-state] 캐릭터 저장 실패', error));
}

export function writeSettings(settings: Settings): void {
  if (!isTauri) {
    writeLocalSettings(settings);
    return;
  }
  saveToFile({ settings: JSON.stringify(settings) }).catch((error) => console.error('[game-state] 설정 저장 실패', error));
}
