import { BOSSES } from '../game/bosses';
import { TOWN_ROUTES } from '../game/routeData';
import { TOWNS } from '../game/towns';
import { DATA_KEY } from '../maple/api';
import { BGM_FOLDERS, MAP_BGM } from './bgmCatalog';

export interface BgmTrack {
  /** `Bgm00/FloralLife` */
  path: string;
  folder: string;
  name: string;
  /** 이 곡이 걸린, 앱이 아는 맵 이름(마을 → 사냥터 → 보스 순) */
  maps: string[];
}

export type BgmFilter = 'all' | 'favorites' | 'maps';

/** 손으로 고친 저장 파일의 이상한 값은 받지 않는다. 길이는 가장 긴 원작 곡 경로(62자)보다 넉넉히 */
const TRACK_PATH = /^Bgm\w+\/[^/]{1,100}$/;
export const isTrackPath = (value: unknown): value is string => typeof value === 'string' && TRACK_PATH.test(value);

function knownMapNames(): Map<string, string[]> {
  const names = new Map<string, string[]>();
  const add = (mapId: number, name: string) => {
    const path = MAP_BGM[mapId];
    if (!path) return;
    const list = names.get(path) ?? [];
    if (!list.includes(name)) list.push(name);
    names.set(path, list);
  };
  TOWNS.forEach((town) => add(town.mapId, town.name));
  Object.values(TOWN_ROUTES).forEach((fields) => fields.forEach((field) => add(field.mapId, field.name)));
  BOSSES.forEach((boss) => add(boss.mapId, boss.name));
  return names;
}

export const BGM_TRACKS: BgmTrack[] = (() => {
  const names = knownMapNames();
  return BGM_FOLDERS.flatMap(([folder, tracks]) =>
    tracks.map((name) => ({ path: `${folder}/${name}`, folder, name, maps: names.get(`${folder}/${name}`) ?? [] })),
  );
})();

const byPath = new Map(BGM_TRACKS.map((track) => [track.path, track]));
const byLowerPath = new Map(BGM_TRACKS.map((track) => [track.path.toLowerCase(), track.path]));

export const findTrack = (path: string): BgmTrack | undefined => byPath.get(path);

/** WZ 의 맵 BGM 값은 대소문자가 폴더 목록과 다를 때가 있다. 목록에 없는 곡이면 받은 그대로 쓴다 */
export const canonicalTrack = (path: string): string => byLowerPath.get(path.toLowerCase()) ?? path;

/** 앱이 아는 맵이면 그 곡. 모르는 맵은 null 이고 bgm.ts 가 WZ 에서 읽는다 */
export const knownMapTrack = (mapId: number): string | null => MAP_BGM[mapId] ?? null;

/** 「헤네시스 · FloralLife」. 아는 맵이 없는 곡은 이름만 */
export function trackLabel(path: string): string {
  const track = byPath.get(path);
  const name = track?.name ?? path.slice(path.indexOf('/') + 1);
  return track && track.maps.length > 0 ? `${track.maps[0]} · ${name}` : name;
}

const squash = (text: string) => text.toLowerCase().replace(/[\s'’!_-]+/g, '');

/** 검색어는 곡 이름·폴더·맵 이름 어디에 들어 있어도 찾는다. 빈칸·따옴표·대소문자는 가리지 않는다 */
export function filterTracks(tracks: BgmTrack[], query: string, filter: BgmFilter, favorites: readonly string[]): BgmTrack[] {
  const words = query.split(/\s+/).map(squash).filter(Boolean);
  const favorite = new Set(favorites);
  return tracks.filter((track) => {
    if (filter === 'favorites' && !favorite.has(track.path)) return false;
    if (filter === 'maps' && track.maps.length === 0) return false;
    const haystack = squash(`${track.path} ${track.maps.join(' ')}`);
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * 받은 곡을 기기에 남기는 파일 이름. `KMS-389-Bgm00-FloralLife` 처럼 곡 경로로 짓는다. 여러 맵이 같은 곡을 쓰면 한 파일이다.
 * 이름의 빈칸·따옴표 등은 `-` 뒤 UTF-8 바이트 16진수로 바꿔서 Rust 가 받는 글자(영문·숫자·`-`·`_`)만 남기고, 서로 다른 곡이 같은 이름이 되지 않게 한다
 */
export function bgmTrackKey(path: string): string {
  const slash = path.indexOf('/');
  const name = [...new TextEncoder().encode(path.slice(slash + 1))]
    .map((byte) => {
      const char = String.fromCharCode(byte);
      return /\w/.test(char) ? char : `-${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    })
    .join('');
  return `${DATA_KEY}-${path.slice(0, slash)}-${name}`;
}

/** 예전 판이 맵 번호로 남긴 파일 이름(`KMS-389-100000000`). 이 이름이면 그 맵 번호 */
export function legacyMapKeyId(key: string): number | null {
  const match = new RegExp(`^${DATA_KEY}-(\\d+)$`).exec(key);
  return match ? Number(match[1]) : null;
}
