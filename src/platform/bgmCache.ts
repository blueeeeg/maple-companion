import { invoke } from '@tauri-apps/api/core';

export interface BgmCacheEntry {
  key: string;
  bytes: number;
  /** 마지막으로 쓰거나 읽은 때(ms). 용량을 넘으면 오래된 것부터 지운다 */
  usedAt: number;
}

/**
 * 한 번 받은 BGM 을 기기에 남긴다. 다음 실행부터 네트워크 없이 바로 튼다.
 * key 는 bgmTracks.ts bgmTrackKey 가 곡 경로로 지은 이름(`KMS-389-Bgm00-FloralLife`)이다
 */
export interface BgmCache {
  /** 남긴 곡이 없으면 null */
  read(key: string): Promise<Blob | null>;
  /** 미리 받기에서 곡을 읽지 않고 있는지만 본다 */
  has(key: string): Promise<boolean>;
  write(key: string, track: Blob): Promise<void>;
  remove(key: string): Promise<void>;
  list(): Promise<BgmCacheEntry[]>;
  /** 예전 판이 맵 번호로 남긴 파일을 곡 이름으로 옮긴다 */
  rename(from: string, to: string): Promise<void>;
}

/** Rust bgm_cache.rs 가 이 이름으로 app data 의 bgm/ 에 둔다 */
const tauriCache: BgmCache = {
  async read(key) {
    const bytes = await invoke<ArrayBuffer>('read_bgm', { key });
    return bytes.byteLength > 0 ? new Blob([bytes], { type: 'audio/mpeg' }) : null;
  },
  has: (key) => invoke<boolean>('has_bgm', { key }),
  async write(key, track) {
    // 숫자 배열(JSON)로 보내면 MB 단위 곡이 몇 배로 불어나서 바이트 그대로 보낸다
    await invoke('write_bgm', new Uint8Array(await track.arrayBuffer()), { headers: { 'bgm-key': key } });
  },
  async remove(key) {
    await invoke('remove_bgm', { key });
  },
  list: () => invoke<BgmCacheEntry[]>('list_bgm'),
  async rename(from, to) {
    await invoke('rename_bgm', { from, to });
  },
};

/** 브라우저로 화면만 볼 때(`pnpm dev`)는 Cache API 에 둔다. 못 쓰는 환경이면 실패하고 매번 받는다 */
const CACHE_NAME = 'maple-companion:bgm-tracks';
/** 맵 주소로 남기던 예전 판 캐시. 개발 화면용이라 옮기지 않고 지운다 */
const OLD_CACHE_NAME = 'maple-companion:bgm';
const USED_AT = 'x-used-at';
const entryUrl = (key: string) => new URL(`/__bgm/${key}`, location.origin).href;
const keyOf = (url: string) => new URL(url).pathname.replace(/^\/__bgm\//, '');

let opened: Promise<Cache> | null = null;
function open(): Promise<Cache> {
  opened ??= caches.delete(OLD_CACHE_NAME).then(
    () => caches.open(CACHE_NAME),
    () => caches.open(CACHE_NAME),
  );
  return opened;
}

const browserCache: BgmCache = {
  async read(key) {
    const response = await (await open()).match(entryUrl(key));
    return response ? response.blob() : null;
  },
  async has(key) {
    return (await (await open()).match(entryUrl(key))) !== undefined;
  },
  async write(key, track) {
    const headers = { 'content-type': track.type, [USED_AT]: String(Date.now()) };
    await (await open()).put(entryUrl(key), new Response(track, { headers }));
  },
  async remove(key) {
    await (await open()).delete(entryUrl(key));
  },
  async list() {
    const cache = await open();
    return Promise.all(
      (await cache.keys()).map(async (request) => {
        const response = await cache.match(request);
        return {
          key: keyOf(request.url),
          bytes: (await response?.blob())?.size ?? 0,
          usedAt: Number(response?.headers.get(USED_AT)) || 0,
        };
      }),
    );
  },
  async rename(from, to) {
    const track = await browserCache.read(from);
    if (track) await browserCache.write(to, track);
    await browserCache.remove(from);
  },
};

/** platform/tauri.ts 와 같은 판정이다. 그 모듈은 불러올 때 window 를 읽어서 node 테스트가 bgm.ts 를 못 불러온다 */
export function createBgmCache(): BgmCache {
  return '__TAURI_INTERNALS__' in window ? tauriCache : browserCache;
}
