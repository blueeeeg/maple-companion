import { invoke } from '@tauri-apps/api/core';
import { DATA_KEY, mapBgmUrl } from '../maple/api';

/** 한 번 받은 맵 BGM 을 기기에 남긴다. 다음 실행부터 네트워크 없이 바로 튼다 */
export interface BgmCache {
  /** 남긴 곡이 없으면 null */
  read(mapId: number): Promise<Blob | null>;
  /** 미리 받기에서 곡을 읽지 않고 있는지만 본다 */
  has(mapId: number): Promise<boolean>;
  write(mapId: number, track: Blob): Promise<void>;
  remove(mapId: number): Promise<void>;
}

/** Rust bgm_cache.rs 가 이 이름으로 app data 의 bgm/ 에 둔다. 리소스 버전이 바뀌면 새로 받는다 */
const fileKey = (mapId: number) => `${DATA_KEY}-${mapId}`;

const tauriCache: BgmCache = {
  async read(mapId) {
    const bytes = await invoke<ArrayBuffer>('read_bgm', { key: fileKey(mapId) });
    return bytes.byteLength > 0 ? new Blob([bytes], { type: 'audio/mpeg' }) : null;
  },
  has: (mapId) => invoke<boolean>('has_bgm', { key: fileKey(mapId) }),
  async write(mapId, track) {
    // 숫자 배열(JSON)로 보내면 MB 단위 곡이 몇 배로 불어나서 바이트 그대로 보낸다
    await invoke('write_bgm', new Uint8Array(await track.arrayBuffer()), { headers: { 'bgm-key': fileKey(mapId) } });
  },
  async remove(mapId) {
    await invoke('remove_bgm', { key: fileKey(mapId) });
  },
};

/** 브라우저로 화면만 볼 때(`pnpm dev`)는 Cache API 에 둔다. 못 쓰는 환경이면 실패하고 매번 받는다 */
const CACHE_NAME = 'maple-companion:bgm';

const browserCache: BgmCache = {
  async read(mapId) {
    const response = await (await caches.open(CACHE_NAME)).match(mapBgmUrl(mapId));
    return response ? response.blob() : null;
  },
  async has(mapId) {
    return (await (await caches.open(CACHE_NAME)).match(mapBgmUrl(mapId))) !== undefined;
  },
  async write(mapId, track) {
    await (await caches.open(CACHE_NAME)).put(mapBgmUrl(mapId), new Response(track, { headers: { 'content-type': track.type } }));
  },
  async remove(mapId) {
    await (await caches.open(CACHE_NAME)).delete(mapBgmUrl(mapId));
  },
};

/** platform/tauri.ts 와 같은 판정이다. 그 모듈은 불러올 때 window 를 읽어서 node 테스트가 bgm.ts 를 못 불러온다 */
export function createBgmCache(): BgmCache {
  return '__TAURI_INTERNALS__' in window ? tauriCache : browserCache;
}
