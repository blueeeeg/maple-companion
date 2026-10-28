import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DATA_KEY,
  FETCH_TIMEOUT_MS,
  characterAnimationUrl,
  characterFrameUrl,
  characterItemSource,
  dataKey,
  fetchJson,
  fetchWithin,
  mapBgmNodeUrl,
  mapInfoUrl,
  mapLadderRopeNodeUrl,
  mapLayerRenderUrl,
  mapRenderUrl,
  mobAnimationUrl,
  mobFrameUrl,
  mobInfoUrl,
  musicUrl,
  wzImageUrl,
} from './api';
import { FACES, HAIRS, SKINS, baseLook } from '../game/appearance';
import { CLASSIC_ITEM_IDS } from './classicItems';

/** 응답하지 않는 서버. signal 이 끊기면 그 이유로 실패한다 */
function hangingFetch(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
}

describe('fetchWithin', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('응답이 없으면 시간이 지나 실패한다', async () => {
    vi.stubGlobal('fetch', vi.fn(hangingFetch));
    const result = fetchWithin('https://example.test/a', async () => 'ok', 1000);
    const settled = expect(result).rejects.toThrow('1000ms 안에 응답 없음');
    await vi.advanceTimersByTimeAsync(1000);
    await settled;
  });

  it('헤더는 왔는데 본문이 멈춰도 시간이 지나 실패한다', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Response('{}');
      }),
    );
    const result = fetchWithin(
      'https://example.test/b',
      () => new Promise((_, reject) => signal!.addEventListener('abort', () => reject(signal!.reason))),
      1000,
    );
    const settled = expect(result).rejects.toThrow('응답 없음');
    await vi.advanceTimersByTimeAsync(1000);
    await settled;
  });

  it('제때 오면 읽은 값을 돌려주고 타이머를 남기지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('hello')));
    await expect(fetchWithin('https://example.test/c', (response) => response.text(), 1000)).resolves.toBe('hello');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fetchJson 도 기본 제한 시간에 끊긴다', async () => {
    vi.stubGlobal('fetch', vi.fn(hangingFetch));
    const settled = expect(fetchJson('https://example.test/d')).rejects.toThrow('응답 없음');
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    await settled;
  });

  it('fetchJson 은 5xx 를 실패로 돌려준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 520 })));
    await expect(fetchJson('https://example.test/e')).rejects.toThrow('520');
  });
});

describe('시대별 주소', () => {
  it('지금 시대는 KMS 389 주소 그대로다', () => {
    expect(DATA_KEY).toBe('KMS-389');
    expect(dataKey('current')).toBe('KMS-389');
    expect(mapInfoUrl(100000000)).toBe('https://maplestory.io/api/KMS/389/map/100000000');
    expect(mapInfoUrl(100000000, 'current')).toBe(mapInfoUrl(100000000));
    expect(mapRenderUrl(100000000)).toBe('https://maplestory.io/api/KMS/389/map/100000000/render/0');
    expect(mapLayerRenderUrl(100000000, 3, -10, -20)).toBe(
      'https://maplestory.io/api/KMS/389/map/100000000/render/layer/3/0?minX=-10&minY=-20',
    );
    expect(musicUrl("Bgm04/Shinin'Harbor")).toBe("https://maplestory.io/api/KMS/389/music/Bgm04/Shinin'Harbor");
    expect(mapBgmNodeUrl(100000000)).toBe('https://maplestory.io/api/wz/KMS/389/Map/Map/Map1/100000000.img/info/bgm');
    expect(mapLadderRopeNodeUrl(100000000, '1/page')).toBe(
      'https://maplestory.io/api/wz/KMS/389/Map/Map/Map1/100000000.img/ladderRope/1/page',
    );
    expect(mobInfoUrl(100100)).toBe('https://maplestory.io/api/KMS/389/mob/100100');
    expect(mobFrameUrl(100100, 'move', 0)).toBe('https://maplestory.io/api/KMS/389/mob/100100/render/move/0');
    expect(wzImageUrl('UI/Basic.img/BtOK4/normal/0')).toBe('https://maplestory.io/api/wz/img/KMS/389/UI/Basic.img/BtOK4/normal/0');
  });

  it('클래식은 같은 꼴의 GMS 83 주소다', () => {
    expect(dataKey('classic')).toBe('GMS-83');
    expect(mapInfoUrl(100000000, 'classic')).toBe('https://maplestory.io/api/GMS/83/map/100000000');
    expect(mapRenderUrl(100000000, 'classic')).toBe('https://maplestory.io/api/GMS/83/map/100000000/render/0');
    expect(mapLayerRenderUrl(100000000, 3, -10, -20, 'classic')).toBe(
      'https://maplestory.io/api/GMS/83/map/100000000/render/layer/3/0?minX=-10&minY=-20',
    );
    expect(musicUrl('Bgm00/FloralLife', 'classic')).toBe('https://maplestory.io/api/GMS/83/music/Bgm00/FloralLife');
    expect(mapBgmNodeUrl(105040300, 'classic')).toBe('https://maplestory.io/api/wz/GMS/83/Map/Map/Map1/105040300.img/info/bgm');
    expect(mapLadderRopeNodeUrl(100000000, '', 'classic')).toBe(
      'https://maplestory.io/api/wz/GMS/83/Map/Map/Map1/100000000.img/ladderRope',
    );
    expect(mobInfoUrl(100100, 'classic')).toBe('https://maplestory.io/api/GMS/83/mob/100100');
    expect(mobAnimationUrl(100100, 'die1', 'classic')).toBe('https://maplestory.io/api/GMS/83/mob/100100/render/die1');
    expect(wzImageUrl('Map/MapHelper.img/portal/game/pv/0', 'classic')).toBe(
      'https://maplestory.io/api/wz/img/GMS/83/Map/MapHelper.img/portal/game/pv/0',
    );
  });

  it('클래식 캐릭터는 v83 에 있는 아이템만 v83 으로, 나머지는 지금 판으로 그린다', () => {
    const old = [...CLASSIC_ITEM_IDS].find((id) => id >= 1000000)!;
    const cash = 1004492;
    expect(CLASSIC_ITEM_IDS.has(cash)).toBe(false);
    expect(characterItemSource(old, 'classic')).toEqual({ region: 'GMS', version: '83' });
    expect(characterItemSource(cash, 'classic')).toEqual({ region: 'KMS', version: '389' });
    expect(characterItemSource(old)).toEqual({ region: 'KMS', version: '389' });
    const items = (url: string) =>
      JSON.parse(`[${decodeURIComponent(url.slice('https://maplestory.io/api/character/'.length).split('/')[0])}]`) as {
        itemId: number;
        region: string;
      }[];
    expect(items(characterFrameUrl([2000, old, cash], 'stand1', 0, 'classic')).map((item) => item.region)).toEqual([
      'GMS',
      'GMS',
      'KMS',
    ]);
    expect(items(characterAnimationUrl([2000, old], 'stand1')).map((item) => item.region)).toEqual(['KMS', 'KMS']);
  });

  it('캐릭터 생성에서 고를 수 있는 피부·얼굴·헤어는 모두 v83 에 있다', () => {
    const ids = [
      ...SKINS.flatMap((skin) => baseLook({ gender: 'male', skin, face: 0, hair: 0 }).slice(0, 2)),
      ...Object.values(FACES).flat(),
      ...Object.values(HAIRS).flat(),
    ];
    expect(ids.filter((id) => !CLASSIC_ITEM_IDS.has(id))).toEqual([]);
  });
});
