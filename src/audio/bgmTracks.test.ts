import { describe, expect, it } from 'vitest';
import { BOSSES } from '../game/bosses';
import { CLASSIC_TOWN_ROUTES } from '../game/routeData.classic';
import { TOWNS, townsFor } from '../game/towns';
import { BGM_FOLDERS, MAP_BGM } from './bgmCatalog';
import {
  BGM_TRACKS,
  bgmTrackKey,
  canonicalTrack,
  classicTrack,
  filterTracks,
  findTrack,
  isTrackPath,
  knownMapTrack,
  legacyMapKeyId,
  trackLabel,
  trackSource,
} from './bgmTracks';

/** Rust bgm_cache.rs valid_key 와 같은 규칙 */
const RUST_KEY = /^[A-Za-z0-9_-]{1,200}$/;

describe('곡 목록', () => {
  it('원작 BGM 폴더의 곡을 모두 담고 경로가 겹치지 않는다', () => {
    const total = BGM_FOLDERS.reduce((sum, [, tracks]) => sum + tracks.length, 0);
    expect(BGM_TRACKS).toHaveLength(total);
    expect(total).toBeGreaterThan(600);
    expect(new Set(BGM_TRACKS.map((track) => track.path)).size).toBe(total);
    BGM_TRACKS.forEach((track) => expect(isTrackPath(track.path), track.path).toBe(true));
  });

  it('앱이 아는 맵의 곡은 목록에 있다', () => {
    Object.values(MAP_BGM).forEach((path) => expect(findTrack(path), path).toBeDefined());
  });

  it('마을 곡에는 마을 이름이 먼저 붙는다', () => {
    const henesys = TOWNS.find((town) => town.id === 'henesys')!;
    expect(trackLabel(knownMapTrack(henesys.mapId)!)).toBe('헤네시스 · FloralLife');
    expect(findTrack('Bgm00/FloralLife')!.maps).toContain(BOSSES.find((boss) => boss.mapId === 100020101)!.name);
  });

  it('아는 맵이 없는 곡은 이름만', () => {
    expect(trackLabel('Bgm41/Gravity Lord')).toBe('Gravity Lord');
    expect(trackLabel('Bgm99/Nothing')).toBe('Nothing');
  });

  it('WZ 맵 값의 대소문자를 목록에 맞춘다', () => {
    expect(canonicalTrack('bgm00/floralLife')).toBe('Bgm00/FloralLife');
    expect(canonicalTrack('Bgm99/Unknown')).toBe('Bgm99/Unknown');
  });
});

describe('곡 경로 검사', () => {
  it('폴더/이름 꼴만 받는다', () => {
    expect(isTrackPath('Bgm00/FloralLife')).toBe(true);
    expect(isTrackPath("Bgm42/Demon's eye")).toBe(true);
    for (const value of ['', 'FloralLife', 'Bgm00/', 'Bgm00/a/b', 'Sound/x', '../x', 42, null, `Bgm00/${'a'.repeat(101)}`]) {
      expect(isTrackPath(value), String(value)).toBe(false);
    }
  });
});

describe('기기에 남기는 파일 이름', () => {
  it('곡 경로로 짓는다', () => {
    expect(bgmTrackKey('Bgm00/FloralLife')).toBe('KMS-389-Bgm00-FloralLife');
    expect(bgmTrackKey('Bgm48/Doomsday_LOOP')).toBe('KMS-389-Bgm48-Doomsday_LOOP');
  });

  it('빈칸·따옴표·하이픈은 바이트 16진수로 바꾼다', () => {
    expect(bgmTrackKey('Bgm41/Gravity Lord')).toBe('KMS-389-Bgm41-Gravity-20Lord');
    expect(bgmTrackKey("Bgm04/Shinin'Harbor")).toBe('KMS-389-Bgm04-Shinin-27Harbor');
    expect(bgmTrackKey('Bgm50/TheWorld’sEnd')).toBe('KMS-389-Bgm50-TheWorld-E2-80-99sEnd');
    expect(bgmTrackKey('Bgm45/God Of Control - Lobby')).toBe('KMS-389-Bgm45-God-20Of-20Control-20-2D-20Lobby');
  });

  it('원작 곡 전부 Rust 가 받는 이름이고 서로 겹치지 않는다', () => {
    const keys = BGM_TRACKS.map((track) => bgmTrackKey(track.path));
    keys.forEach((key) => expect(key, key).toMatch(RUST_KEY));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('예전 판의 맵 번호 이름을 알아본다', () => {
    expect(legacyMapKeyId('KMS-389-100000000')).toBe(100000000);
    expect(legacyMapKeyId('KMS-389-Bgm00-FloralLife')).toBeNull();
    expect(legacyMapKeyId('KMS-388-100000000')).toBeNull();
  });
});

describe('찾기', () => {
  const find = (query: string, filter: 'all' | 'favorites' | 'maps' = 'all', favorites: string[] = []) =>
    filterTracks(BGM_TRACKS, query, filter, favorites).map((track) => track.path);

  it('맵 이름으로 찾는다', () => {
    expect(find('헤네시스')).toContain('Bgm00/FloralLife');
  });

  it('곡 이름은 대소문자·빈칸을 가리지 않는다', () => {
    expect(find('gravitylord')).toContain('Bgm41/Gravity Lord');
    expect(find('Gravity Lord')).toContain('Bgm41/Gravity Lord');
    expect(find('demons eye')).toContain("Bgm42/Demon's eye");
  });

  it('폴더로 찾는다', () => {
    expect(find('bgm00')).toEqual(BGM_FOLDERS.find(([folder]) => folder === 'Bgm00')![1].map((name) => `Bgm00/${name}`));
  });

  it('즐겨찾기·아는 맵 곡만 볼 수 있다', () => {
    expect(find('', 'favorites', ['Bgm41/Gravity Lord', 'Bgm00/FloralLife'])).toEqual(['Bgm00/FloralLife', 'Bgm41/Gravity Lord']);
    expect(find('', 'maps').sort()).toEqual([...new Set(Object.values(MAP_BGM))].sort());
  });

  it('빈 검색어는 전부', () => {
    expect(find('  ')).toHaveLength(BGM_TRACKS.length);
  });
});

describe('클래식 곡', () => {
  it('경로 앞에 시대를 붙이고 GMS 83 이름으로 남긴다', () => {
    const track = classicTrack('Bgm00/FloralLife');
    expect(trackSource(track)).toEqual({ era: 'classic', path: 'Bgm00/FloralLife' });
    expect(trackSource('Bgm00/FloralLife')).toEqual({ era: 'current', path: 'Bgm00/FloralLife' });
    expect(bgmTrackKey(track)).toBe('GMS-83-Bgm00-FloralLife');
    expect(bgmTrackKey(classicTrack("Bgm04/Shinin'Harbor"))).toBe('GMS-83-Bgm04-Shinin-27Harbor');
    // 설정에 저장하는 곡(한 곡 반복·즐겨찾기)은 지금 판 곡 목록에서만 고른다
    expect(isTrackPath(track)).toBe(false);
  });

  it('클래식 마을·사냥터 맵은 모두 클래식 곡을 알고 Rust 가 받는 이름이다', () => {
    const mapIds = [
      ...townsFor('classic').map((town) => town.mapId),
      ...Object.values(CLASSIC_TOWN_ROUTES).flatMap((fields) => fields.map((field) => field.mapId)),
    ];
    mapIds.forEach((mapId) => {
      const track = knownMapTrack(mapId, 'classic');
      expect(track, String(mapId)).not.toBeNull();
      expect(trackSource(track!).era).toBe('classic');
      expect(bgmTrackKey(track!)).toMatch(RUST_KEY);
    });
  });

  it('같은 맵 ID 라도 시대마다 따로 찾고, 클래식 곡에는 클래식 맵 이름이 붙는다', () => {
    const sleepywood = townsFor('classic').find((town) => town.id === 'sleepywood')!;
    expect(knownMapTrack(sleepywood.mapId)).toBeNull();
    expect(knownMapTrack(sleepywood.mapId, 'classic')).not.toBeNull();
    expect(trackLabel(knownMapTrack(100000000, 'classic')!)).toMatch(/^헤네시스 · /);
    expect(trackLabel(classicTrack('Bgm99/Nothing'))).toBe('Nothing');
  });
});
