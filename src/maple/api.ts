// 메이플 리소스는 앱에 넣지 않고 팬 API(maplestory.io)에서 실행 중에 받아 온다
import { CLASSIC_CASH_ITEM_IDS } from './classicCashItems';
import { CLASSIC_ITEM_IDS } from './classicItems';
import type { LadderRope } from './navigation';

/** 캐릭터마다 만들 때 고르는 시대. 맵·몹·BGM·캐릭터 그림을 그 시대 데이터에서 받는다 */
export type Era = 'current' | 'classic';
export const ERAS: readonly Era[] = ['current', 'classic'];

export interface DataSource {
  region: string;
  version: string;
}

// 클래식은 빅뱅(v93) 전 데이터가 온전히 남은 마지막 판이다. 에반·듀얼블레이드가 들어오기 전이다
export const DATA_SOURCES: Record<Era, DataSource> = {
  current: { region: 'KMS', version: '389' },
  classic: { region: 'GMS', version: '83' },
};

const apiBase = (era: Era) => `https://maplestory.io/api/${DATA_SOURCES[era].region}/${DATA_SOURCES[era].version}`;
const wzBase = (era: Era) => `https://maplestory.io/api/wz/${DATA_SOURCES[era].region}/${DATA_SOURCES[era].version}`;
const BASE = apiBase('current');
/** 그 시대 리소스를 기기에 남길 때 붙이는 버전 표시(`KMS-389`·`GMS-83`). 버전이 바뀌면 남긴 것을 새로 받는다 */
export const dataKey = (era: Era) => `${DATA_SOURCES[era].region}-${DATA_SOURCES[era].version}`;
export const DATA_KEY = dataKey('current');

const wzMapPath = (mapId: number) => {
  const padded = String(mapId).padStart(9, '0');
  return `Map/Map/Map${padded[0]}/${padded}.img`;
};

export const mapInfoUrl = (mapId: number, era: Era = 'current') => `${apiBase(era)}/map/${mapId}`;
/** 하늘 배경은 빠지고 타일·오브젝트만 그려진다 */
export const mapRenderUrl = (mapId: number, era: Era = 'current') => `${apiBase(era)}/map/${mapId}/render/0`;
/**
 * 레이어 하나만 그린 이미지. 레이어 번호는 맵 레이어 × 2 에 타일이면 1 을 더한 값이다(오브젝트 → 타일 순).
 * 원점을 안 주면 그 레이어 그림의 테두리로 잘려 와서 전체 렌더와 위치를 맞출 수 없다. 원점 위쪽·왼쪽으로 삐져나간 그림은 빠진다
 */
export const mapLayerRenderUrl = (mapId: number, layer: number, minX: number, minY: number, era: Era = 'current') =>
  `${apiBase(era)}/map/${mapId}/render/layer/${layer}/0?minX=${minX}&minY=${minY}`;
/** 원작 BGM 한 곡. path 는 `Bgm00/FloralLife` 처럼 Sound.wz 의 폴더/이름이다. 이름에 빈칸·따옴표가 있는 곡이 있다 */
export const musicUrl = (path: string, era: Era = 'current') =>
  `${apiBase(era)}/music/${path.split('/').map(encodeURIComponent).join('/')}`;
/** 맵에 걸린 BGM 경로(WZ `info/bgm`, 값이 `Bgm00/FloralLife`). 곡을 받지 않고 어느 곡인지만 본다 */
export const mapBgmNodeUrl = (mapId: number, era: Era = 'current') => `${wzBase(era)}/${wzMapPath(mapId)}/info/bgm`;
/**
 * 맵의 사다리·로프 WZ 노드(JSON). path 가 비면 자식 이름 목록이고, `1/page` 처럼 주면 그 값이다.
 * 맵 정보 ladderRopes 는 이 자식 목록 순서(1, 10, 11, 2 …)대로 들어 있다
 */
export const mapLadderRopeNodeUrl = (mapId: number, path = '', era: Era = 'current') =>
  `${wzBase(era)}/${wzMapPath(mapId)}/ladderRope${path ? `/${path}` : ''}`;
export const mobInfoUrl = (mobId: number, era: Era = 'current') => `${apiBase(era)}/mob/${mobId}`;
export const mobFrameUrl = (mobId: number, action: string, frame: number, era: Era = 'current') =>
  `${apiBase(era)}/mob/${mobId}/render/${action}/${frame}`;
/** 애니메이션 GIF. 프레임 수와 원작 딜레이를 읽는 데만 쓴다 */
export const mobAnimationUrl = (mobId: number, action: string, era: Era = 'current') =>
  `${apiBase(era)}/mob/${mobId}/render/${action}`;
export const skillUrl = (skillId: number, era: Era = 'current') => `${apiBase(era)}/job/skill/${skillId}`;

/**
 * WZ 캔버스 하나를 PNG 로 받는다. UI 캔버스 대부분은 `_outlink` 로 `_Canvas` 아래 실제 그림을 가리키고,
 * 원래 경로로 받으면 1×1 빈 그림이 온다. 그래서 `_outlink` 를 따라간 경로를 넘겨야 한다
 */
export const wzImageUrl = (path: string, era: Era = 'current') =>
  `https://maplestory.io/api/wz/img/${DATA_SOURCES[era].region}/${DATA_SOURCES[era].version}/${path}`;
/** 로그인 UI(캐릭터 선택·생성 버튼 등). node 는 `CharSelect/BtSelect/normal/0` 처럼 Login.img 아래 경로 */
export const loginUiUrl = (node: string) => wzImageUrl(`UI/_Canvas/Login.img/${node}`);
/** 로그인 화면 배경(1024×768). 1 이 캐릭터 선택의 나무 선반, 2 는 그 위에 겹치는 가장자리 잎 */
export const loginBackUrl = (no: number) => wzImageUrl(`Map/Back/_Canvas/UI_login.img/back/${no}`);

// 동전·금화·지폐 다발·자루. 원작처럼 금액이 클수록 큰 아이콘이 떨어진다
const MESO_ICONS: [maxAmount: number, itemId: number][] = [
  [49, 9000000],
  [99, 9000001],
  [999, 9000002],
  [Infinity, 9000003],
];
export const MESO_HUD_ICON_URL = `${BASE}/item/9000001/icon`;
/** 메뉴바 트레이 아이콘. 몬스터가 떨어뜨리는 기타 아이템 「단풍잎」 */
export const TRAY_ICON_URL = `${BASE}/item/4001126/icon`;
export function mesoDropIconUrl(amount: number): string {
  const [, itemId] = MESO_ICONS.find(([maxAmount]) => amount <= maxAmount)!;
  return `${BASE}/item/${itemId}/icon`;
}

/**
 * 아이템마다 받을 판을 따로 적을 수 있다. 클래식은 v83 에 있는 아이템(앱 장비·클래식 캐시샵 아이템)만 v83 으로 그리고
 * 나머지(1단계 때 산 지금 판 캐시 아이템·새 장비)는 지금 판으로 그린다. v83 에 없는 아이템을 v83 으로 적으면 오류 없이 빠진 채 그려진다
 */
export function characterItemSource(itemId: number, era: Era = 'current'): DataSource {
  return era === 'classic' && (CLASSIC_ITEM_IDS.has(itemId) || CLASSIC_CASH_ITEM_IDS.has(itemId))
    ? DATA_SOURCES.classic
    : DATA_SOURCES.current;
}

function characterItems(itemIds: number[], era: Era): string {
  return encodeURIComponent(
    itemIds.map((itemId) => JSON.stringify({ itemId, ...characterItemSource(itemId, era) })).join(','),
  );
}

/** 이 모습의 동작·프레임 주소는 모두 이 아래에 있다 */
export const characterArtBase = (itemIds: number[], era: Era = 'current') =>
  `https://maplestory.io/api/character/${characterItems(itemIds, era)}`;

/** 발이 이미지 정중앙에 오게 그려 받아서 프레임마다 크기가 달라도 발 위치가 흔들리지 않는다 */
export function characterFrameUrl(itemIds: number[], action: string, frame: number, era: Era = 'current'): string {
  return `${characterArtBase(itemIds, era)}/${action}/${frame}?resize=1&renderMode=FeetCenter`;
}

export function characterAnimationUrl(itemIds: number[], action: string, era: Era = 'current'): string {
  return `${characterArtBase(itemIds, era)}/${action}/animated?resize=1&renderMode=FeetCenter`;
}

/**
 * maplestory.io 는 가끔 응답 없이 1분 넘게 멈춘다. fetch 는 스스로 끊지 않아서, 멈춘 요청을 기다리는 쪽(캐릭터 그림·사냥·마을 이동)이
 * 같이 멈추고 실패해야 도는 재시도도 돌지 않는다
 */
export const FETCH_TIMEOUT_MS = 30_000;
/** 맵 전체·레이어 렌더는 서버가 처음 그릴 때 40초 넘게 걸리기도 한다 */
export const MAP_RENDER_TIMEOUT_MS = 90_000;

/** 응답 본문을 다 읽을 때까지 timeoutMs 안에 못 끝내면 요청을 끊고 실패한다 */
export async function fetchWithin<T>(
  url: string,
  read: (response: Response) => Promise<T>,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`${timeoutMs}ms 안에 응답 없음 ${url}`)), timeoutMs);
  try {
    return await read(await fetch(url, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

export function fetchJson<T>(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<T> {
  return fetchWithin(
    url,
    (response) => {
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return response.json() as Promise<T>;
    },
    timeoutMs,
  );
}

export interface Foothold {
  id: number;
  prev: number;
  next: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 맵 레이어(0~7). 캐릭터는 밟고 선 발판의 레이어에 그려져서 더 높은 레이어의 타일·오브젝트에 가려진다 */
  layerId: number;
}

/** 맵에 놓인 몬스터 자리(맵 월드 좌표). walkArea 는 원작이 정한 순찰 범위다 */
export interface MapMob {
  id: number;
  x: number;
  y: number;
  walkAreaX1?: number;
  walkAreaX2?: number;
  hidden?: boolean;
}

export interface MapInfo {
  name: string;
  backgroundMusic: string;
  footholds: Record<string, Foothold>;
  ladderRopes?: LadderRope[];
  /** 마을은 대개 비어 있다 */
  mobs?: MapMob[];
}

export interface MobInfo {
  name: string;
  framebooks: Record<string, number>;
}

export interface SkillFrameData {
  /** base64 PNG */
  image: string;
  delay: number;
  origin: { x: number; y: number };
}

export interface SkillInfo {
  description: { name: string };
  /** lt: 공격 범위 박스의 왼쪽 위. 캐릭터가 왼쪽을 볼 때 기준이라 X 가 음수면 앞쪽 사거리다 */
  properties: Record<string, string>;
  /** v83 은 properties 대신 레벨마다 값이 있다. 마지막(마스터) 레벨 값을 쓴다 */
  levelProperties?: Record<string, string>[];
  effect?: { frames: SkillFrameData[] }[];
  hit?: { frames: SkillFrameData[] }[];
  actions?: string[];
}

/** 대미지 숫자·레벨업 같은 공용 이펙트(Effect.wz BasicEff.img). node 는 `NoRed1/0` 처럼 BasicEff.img 아래 경로 */
export const basicEffUrl = (node: string) => wzImageUrl(`Effect/_Canvas/BasicEff.img/${node}`);

/**
 * 캐시 아이템 목록. subCategory 는 API 의 하위 분류 이름(`Hat`·`Overall`… 무기 외형은 `Cash`).
 * 부위마다 수백~천여 개라 응답이 크다(모자 약 0.7MB). 받는 쪽에서 부위별로 한 번만 받아 둔다
 */
export const cashItemListUrl = (subCategory: string) =>
  `${BASE}/item?subCategoryFilter=${encodeURIComponent(subCategory)}&cashFilter=true&count=20000`;
export const itemIconUrl = (itemId: number) => `${BASE}/item/${itemId}/icon`;
/** WZ 노드 값·자식 목록(JSON). path 는 `Character/Weapon/01702000.img` 처럼 WZ 파일 아래 경로 */
export const wzNodeUrl = (path: string) => `${wzBase('current')}/${path}`;
/** 캐시 무기 외형의 WZ 노드. 자식 이름이 그림이 들어 있는 무기 종류 번호(30 한손검, 45 활…)다 */
export const cashWeaponNodeUrl = (itemId: number) => wzNodeUrl(`Character/Weapon/0${itemId}.img`);
/** 캐시샵 UI. node 는 `CSList/BtBuy/normal/0` 처럼 CashShop.img 아래 경로 */
export const cashShopUiUrl = (node: string) => wzImageUrl(`UI/_Canvas/CashShop.img/${node}`);

/**
 * 몹 프레임 하나의 기준점(발밑). 렌더 이미지는 원본 캔버스 그대로라 이 값을 그대로 쓰면 원작 위치에 맞는다.
 * 큰 보스는 기준점이 그림 가운데가 아니고 동작마다 그림 크기가 달라서, 가운데 아래를 기준으로 그리면 동작이 바뀔 때 튄다
 */
export const mobFrameOriginUrl = (mobId: number, action: string, frame: number, era: Era = 'current') =>
  `${wzBase(era)}/Mob/${mobId}.img/${action}/${frame}/origin`;

/**
 * 보스 HP 게이지(UI/UIWindow2.img/MobGage). 아이콘 틀·게이지 틀 양 끝은 `_Canvas` 로 `_outlink` 되어 있고,
 * 게이지 틀 가운데(backgrnd3)와 1px 색 띠(Gage/{색}/{0|1})는 원래 자리에 그림이 있다
 */
export const mobGageUrl = (node: string, outlinked: boolean) =>
  wzImageUrl(`UI/${outlinked ? '_Canvas/' : ''}UIWindow2.img/MobGage/${node}`);
/**
 * 클래식(v83) 보스 HP 게이지(UI/UIWindow.img/MobGage). `_Canvas`·`_outlink` 가 없어 틀·색 띠(Gage/1~7)·보스 아이콘(Mob/{몹 ID})이
 * 모두 원래 자리에 있다. 아이콘 틀(backgrnd)은 35×37 로 지금 판보다 2px 좁다
 */
export const classicMobGageUrl = (node: string) => wzImageUrl(`UI/UIWindow.img/MobGage/${node}`, 'classic');
/**
 * 보스 아이콘(MobGage/Mob/{몹 ID})의 `_outlink` 노드. 값이 그림 경로다. 대부분 `_Canvas` 의 같은 이름이지만
 * 크림슨 발록은 주니어 발록 아이콘을, 파풀라투스·진 힐라는 `UIBoss.img/BossList/{n}/Icon` 을 가리킨다
 */
export const mobGageIconLinkUrl = (mobId: number) => wzNodeUrl(`UI/UIWindow2.img/MobGage/Mob/${mobId}/_outlink`);

export interface WzValue<T> {
  value: T;
}

/** 보스 HP 게이지 색. hpTagColor 가 채운 칸, hpTagBackgroundColor 가 깎인 칸 색 번호(MobGage/Gage/{번호}) */
export interface MobMeta {
  meta?: { hpTagColor?: number; hpTagBackgroundColor?: number };
}

/** NPC 의 서 있는 첫 프레임. 원본 크기 그대로라 발이 그림 아래 끝에 있다 */
export const npcStandUrl = (npcId: number) => `${BASE}/npc/${npcId}/render/stand/0`;
/**
 * NPC 대화창(UI/UIWindow2.img/UtilDlgEx). 창 띠(t·c·s)·이름표(bar)·버튼(BtNext 등)은 모두 `_Canvas` 로 `_outlink` 되어 있다.
 * node 는 `BtNext/normal/0` 처럼 UtilDlgEx 아래 경로
 */
export const npcDialogUrl = (node: string) => wzImageUrl(`UI/_Canvas/UIWindow2.img/UtilDlgEx/${node}`);
