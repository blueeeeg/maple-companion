import { Application, Container, Graphics, Sprite, Text, Texture, Ticker } from 'pixi.js';
import type { BossSpec } from '../game/bosses';
import type { JobView } from '../game/jobs';
import type { RoutePortal } from '../game/routes';
import type { MonsterSpec, Town } from '../game/towns';
import {
  type Era,
  type Foothold,
  type MapInfo,
  type MapMob,
  type MobInfo,
  type WzValue,
  characterAnimationUrl,
  characterArtBase,
  characterFrameUrl,
  mapInfoUrl,
  mapLadderRopeNodeUrl,
  mapLayerRenderUrl,
  mapRenderUrl,
  mesoDropIconUrl,
  mobAnimationUrl,
  mobFrameUrl,
  mobInfoUrl,
} from '../maple/api';
import {
  type DamageFont,
  DIGIT_OVERLAP,
  layoutDamage,
  loadDamageFont,
  loadJobChanged,
  loadLevelUp,
} from '../maple/basicEff';
import {
  type BossAnimations,
  type BossPart,
  type PlacedAnimation,
  loadBossGauge,
  loadBossMob,
  preloadBossGauge,
} from '../maple/bossMob';
import { type Calibration, type GroundPath, calibrateFootholds, groundY, mainGround } from '../maple/ground';
import { type Pixels, alignOverlay, exactCalibrationFrom, frontRenderLayers, ladderRopeMasks } from '../maple/layers';
import { type EffectLayer, type Skill, canDrawSkill, loadSkill } from '../maple/skills';
import { type Animation, frameAt, loadAnimation, loadLayerStack, loadMapImage, loadTexture, storeAnimation } from '../maple/textures';
import { fetchStoredJson, keepArt } from '../maple/artStore';
import { loadPortalFrames } from '../maple/portal';
import { type ChairArt, type LoadedChairLayer, chairArtOf, loadChairLayers } from '../maple/chairArt';
import { type MountArt, type MountMotion, loadMountFrames, mountArtOf } from '../maple/mountArt';
import {
  type LadderRope,
  type NavAction,
  type NavGraph,
  type NavPoint,
  type NavStep,
  type Platform,
  buildNavGraph,
  createNavRunner,
  findPath,
  platformUnder,
  surfaceY,
} from '../maple/navigation';
import type { Point } from '../maple/ground';
import { createBossGauge } from './bossGauge';
import { type ControlAction, type ControlInput, type Controller, buildControlWorld, createController, platformBelow } from './control';
import {
  DEFAULT_MOB_COUNT,
  type Patrol,
  createPatrol,
  createRespawnTable,
  fieldMobHits,
  pickTargets,
  spawnPoints,
  stepPatrol,
} from './fieldMobs';
import { readCalibration, storeCalibration } from './calibrationStore';
import { chairLoopDelayMs, frameTopLeft, layerAnchor, layerOrder, seatFacing, seatedBodyOffset, seatedLook } from './chairPlacement';
import { FULL_FPS, IDLE_FPS, targetFps } from './framePolicy';
import { type BodySpan, cameraFocus, cameraScroll, framedDistance, spanFocus } from './camera';
import { lerpColor } from './color';
import { applyEachLoaded } from './heroLoad';
import { nameTagBox, nameTagLabel, nameTagPosition } from './nameTag';
import { RIDE_SPEED_SCALE, motionDelays, mountFrameLayout, riderImageOffset, riderLook, shouldRide } from './riding';
import { seatSpotX, shouldSit, wanderPauseLeft, wanderPauseMs } from './seating';
import { viewportFor } from './viewport';

const VIEW_SCALE = 0.65;
/** 캐릭터 발이 화면 아래에서 이만큼 올라온 곳에 오게 카메라를 둔다 */
const FEET_SCREEN_Y_FROM_BOTTOM = 38;
/** 맵 픽셀/초 */
const WALK_SPEED = 125;
const MOB_SPEED = 40;
const EDGE_MARGIN = 30;
/** 스킬 사거리 안쪽에서 이 비율만큼 떨어져 선다. 원거리 직업은 멀리서, 근거리 직업은 붙어서 때린다 */
const STAND_RATIO = 0.55;
const MIN_STAND_DISTANCE = 40;
const MAX_STAND_DISTANCE = 300;
/** 사냥 중 캐릭터·몬스터 중심이 화면 끝에서 떨어져 있을 거리(맵 픽셀). 스프라이트 반쪽이 잘리지 않을 만큼 */
const FRAME_MARGIN = 60;
/** 발판 맞추기로 구한 맵 원점은 몇 픽셀 틀릴 수 있어서, 앞 레이어는 이만큼 바깥까지 그려 받고 이 범위 안에서 위치를 다시 맞춘다 */
const FRONT_SEARCH = 24;
/** 바닥 레이어 그림으로 보정을 맞출 때 이만큼만 기다린다. 못 받으면 어림한 보정으로 들어가고 다음에 그 맵에 갈 때 다시 맞춘다 */
const EXACT_CALIBRATION_WAIT_MS = 30_000;
/** 사다리·로프 page 는 보정을 맞추는 동안 같이 받고, 보정이 이미 있으면 이만큼만 더 기다린다. 못 받으면 page 없이 들어간다 */
const LADDER_PAGE_WAIT_MS = 3000;
/**
 * 바닥 레이어는 앞 레이어와 달리 위 레이어에 가려진 곳이 있어 다 맞지는 않는다(리프레는 1할 넘게 가려진다).
 * 제자리가 아니면 대부분 어긋나서(400점 중 300점 넘게) 이 정도로 낮춰도 다른 자리를 고르지 않는다
 */
const CALIBRATION_MATCH_RATIO = 0.75;
/** 공격 동작의 이 지점에서 대미지가 들어간다 */
const HIT_POINT_RATIO = 0.5;
const ATTACK_COOLDOWN_MS = 300;
/** 캐릭터 그림을 아직 못 받았을 때 공격 동작 대신 기다리는 시간. 그림 없이도 비슷한 박자로 때린다 */
const NO_ART_ATTACK_MS = 800;
/** 애니메이션 대신 정지 그림 한 장을 쓸 때 그 한 장을 보여 줄 시간 */
const STILL_FRAME_MS = 600;
/** 캐릭터 그림·스킬을 다 못 받았을 때 다시 받기까지 쉬는 시간 */
const LOOK_RETRY_MS = 30_000;
/** 스킬창에서 쓴 스킬의 이펙트가 이보다 늦게 오면 이번엔 건너뛴다. 받은 데이터는 남아 다음엔 바로 나온다 */
const CAST_EFFECT_LATE_MS = 10_000;
/** 동작 그림 없이 쓸 때 제자리에 서 있는 시간 */
const CAST_HOLD_MS = 900;
/** 사냥이 이보다 오래 안 끝나면 마무리한다. 끝나지 않은 사냥은 다음 몬스터·마을 이동을 모두 막는다. 보스도 보통 1분 안에 끝난다 */
const ENCOUNTER_LIMIT_MS = 3 * 60 * 1000;
const HIT_LINE_HEIGHT = 30;
const HIT_LINE_STAGGER_MS = 70;
/** 대미지 숫자 대신 글자를 띄울 때 글자 가운데를 숫자 바닥선에서 올릴 거리 */
const DAMAGE_TEXT_HALF_HEIGHT = 16;
const BASIC_EFF_RETRY_MS = 30_000;
const FONT = '-apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
/** 원작 이름표 글자(12px)를 VIEW_SCALE 로 줄이면 8px 아래라 한글이 뭉개진다. 읽히는 가장 작은 크기로 둔다(화면 px) */
const NAME_TAG_FONT_SIZE = 10;
const NAME_TAG_ALPHA = 0.6;
const BANNER_Y = 58;
/** 보스전에는 위쪽에 HP 게이지가 있어서 그 아래에 띄운다 */
const BOSS_BANNER_Y = 88;
/** 게이지 그림은 이만큼만 기다리고 단색 게이지로 싸움을 시작한다. 늦게 오면 싸우는 중에 원작 게이지로 바꿔 낀다 */
const BOSS_GAUGE_WAIT_MS = 5000;
/** 보스 몸통 끝과 캐릭터 기준점 사이를 이만큼 띄워 캐릭터가 보스 몸에 겹치지 않게 한다(맵 픽셀) */
const HERO_HALF_WIDTH = 25;
/** 보스가 처음 나타날 때 캐릭터는 설 자리에서 이만큼 떨어져 있다가 걸어 들어간다 */
const BOSS_ENTRY_WALK = 140;
/** 보스가 제자리에서 오가는 폭과 속도(맵 픽셀, 맵 픽셀/초) */
const BOSS_WANDER = 30;
const BOSS_SPEED = 30;
const BOSS_MOVE_MS = 1200;
const BOSS_IDLE_MIN_MS = 2500;
const BOSS_IDLE_EXTRA_MS = 2500;
/** 동작이 겹칠 때 공격 동작을 고를 확률. 나머지는 걷기 */
const BOSS_ATTACK_CHANCE = 0.6;
const BOSS_DEATH_FADE_MS = 600;
/** 보스가 쓰러지고 메소를 줍는 동안 기다렸다가 마을로 돌아간다 */
const BOSS_OUTRO_MS = 2200;
const BOSS_COINS = 8;
const BOSS_COIN_SPREAD = 70;
const BOSS_COIN_STAGGER_MS = 70;
/** 대미지 숫자가 HUD·HP 게이지(화면 위 약 70px)에 가리지 않게 보스 머리가 화면 밖이면 숫자를 내려 띄운다 */
const BOSS_DAMAGE_CEILING = 110;
/** 포털까지 걷다가 이보다 오래 걸리면(바닥 끝에 막히는 등) 그 자리에서 들어간다 */
const PORTAL_WALK_LIMIT_MS = 60_000;
/** 포털을 누르면 가는 맵 이름을 이만큼 띄운다 */
const PORTAL_LABEL_MS = 3000;
/** 직접 조작에서 ↑ 로 포털에 들어갈 수 있는 거리(맵 픽셀) */
const MANUAL_PORTAL_REACH_X = 25;
const MANUAL_PORTAL_REACH_Y = 30;
/** 포털에 한 번 들어가면 이만큼은 다시 안 들어간다. 맵을 받는 동안 ↑ 를 누르고 있어도 한 번만 옮긴다 */
const MANUAL_PORTAL_COOLDOWN_MS = 1500;
/** 창이 이만큼 포커스를 잃으면 몬스터도 멈추고 리스폰 시간도 안 흐른다 */
const MANUAL_FREEZE_MS = 30_000;
/** 화면 밖 이만큼 안의 몬스터가 움직이면 30fps 로 그린다 */
const MANUAL_VIEW_SLACK = 60;

export interface BossFightEvents {
  /** 보스 맵으로 바뀌어 화면이 밝아지기 직전 */
  onArrive(): void;
  /** 보스를 잡으면 떨어뜨릴 메소 금액을 돌려준다 */
  onDefeat(): number;
  /** 마을로 돌아와 화면이 밝아지기 직전 */
  onReturn(): void;
}

export interface SceneCallbacks {
  /** 몬스터를 잡으면 떨어뜨릴 메소 금액을 돌려준다 */
  onKill(monster: MonsterSpec): number;
  /** 스킬창에서 고른 스킬에 맵에 그릴 이펙트가 없어 자동 스킬로 싸우게 됐을 때 */
  onSkillUnusable?(skillId: number, name: string): void;
  /** 직접 조작으로 맵 몬스터를 잡았을 때. 떨어뜨릴 메소 금액을 돌려준다(보상이 없으면 0) */
  onFieldKill?(monster: MonsterSpec): number;
  /** 직접 조작에서 포털 앞에서 ↑ 를 눌렀을 때. exit 는 그 포털(맵 월드 좌표). 옮기려면 travel 을 부른다 */
  onManualPortal?(exit: Point): void;
}

/** 직접 조작 모드에서 장면이 묻는 것 */
export interface ManualControl {
  /** 지금 눌린 키 */
  keys(): ControlInput & { attack: boolean };
  /** 잡힌 몬스터 자리가 다시 차기까지(ms) */
  respawnMs(): number;
}

export interface Scene {
  readonly inEncounter: boolean;
  /** 맵을 다 받아 와야 끝난다. 실패하면 이전 마을을 그대로 둔다 */
  setTown(town: Town): Promise<void>;
  /** era: 캐릭터 그림을 받을 시대 */
  setJob(job: JobView, era?: Era): void;
  /** hits: 이 몬스터를 잡는 데 드는 스킬 사용 횟수 */
  startEncounter(monster: MonsterSpec, hits: number): void;
  /**
   * 보스 맵으로 옮겨 보스와 싸우고, 잡으면 원래 마을로 돌아온다. 마을에 돌아와야 끝난다.
   * 보스나 보스 맵을 못 받아 오면 마을에 그대로 남고 실패한다. hits: 보스를 잡는 데 드는 스킬 사용 횟수.
   * era: 보스 맵·몹·게이지를 받을 시대(캐릭터의 시대)
   */
  startBossFight(boss: BossSpec, hits: number, events: BossFightEvents, era?: Era): Promise<void>;
  celebrate(text: string): void;
  /** 설정 「데미지 숫자 표시」 */
  setDamageNumbers(visible: boolean): void;
  /** 레벨업 이펙트 배율. 전직 이펙트는 늘 원본 크기다 */
  setLevelUpScale(scale: number): void;
  setRunning(running: boolean): void;
  /**
   * 창 배율에 맞춰 화면 크기를 바꾼다. 1 이상은 맵 배율을 그대로 두고 더 넓게 비춘다.
   * 1 아래는 360×230 을 그대로 두고, 줄여 보여 줄 배율만큼 촘촘하게 그려서 흐려지지 않게 한다
   */
  setDisplayScale(scale: number): void;
  /** 캐릭터 발밑 이름표. 비어 있으면 이름표를 숨긴다 */
  setName(name: string): void;
  /**
   * 지금 맵의 포털(exit)까지 가서 들어가고, 옮겨 간 맵의 포털(arrival)에서 나와 사냥하는 바닥으로 내려온다. 좌표는 맵 월드 좌표.
   * 윗층 포털이면 점프·사다리·로프로 오르내린다.
   * 맵을 다 받은 뒤에 걷기 시작한다. 못 받아 오면 지금 맵에 남고 실패한다. 보스를 잡으면 이 맵으로 돌아온다
   */
  travel(mapId: number, label: string, exit: Point, arrival: Point): Promise<void>;
  /** 맵 id 별로 늘 띄워 둘 포털(맵 월드 좌표). 지금 맵에도 바로 건다 */
  setRoutePortals(portals: Map<number, RoutePortal[]>): void;
  /**
   * 스킬창에서 고른 스킬을 캐릭터 자리에서 한 번 쓴다. 받아 둔 동작으로 바로 시작하고 이펙트는 받는 대로 얹는다.
   * 이펙트를 맵에 그릴 수 없으면 noArt, 못 받으면 failed, 너무 늦게 받아 이번엔 건너뛰었으면 late, 맵을 아직 못 받았으면
   * notReady. 겉모습뿐이다
   */
  castSkill(skillId: number): Promise<CastResult>;
  /** 앉을 의자. 있으면 돌아다니지 않고 싸움·맵 이동·스킬 동작 때만 일어선다. null 이면 의자 없이 돌아다닌다 */
  setChair(chairId: number | null): void;
  /** 탈것. 돌아다니거나 맵을 옮겨 걸을 때 탄다. 의자를 골랐으면 맵을 옮길 때만 탄다. null 이면 걷는다 */
  setMount(mountId: number | null): void;
  /**
   * 직접 조작 모드. 켜면 맵 이동·보스전이 끝난 뒤 지금 자리에서 시작하고 맵의 실제 몬스터를 세운다.
   * null 이면 끄고 바닥으로 돌아가 자동으로 돌아다닌다
   */
  setManual(control: ManualControl | null): void;
  /** 창 포커스. 오래 잃으면 몬스터도 멈춘다 */
  setManualFocus(focused: boolean): void;
  /** 키를 누른 순간 낮춘 fps 에서 바로 깨운다 */
  nudge(): void;
}

export type CastResult = 'ok' | 'noArt' | 'failed' | 'late' | 'notReady';

type HeroAction = 'stand' | 'walk' | 'attack';
type HeroAnimations = Record<HeroAction, Animation>;

interface MobAnimations {
  move: Animation;
  hit: Animation;
  die: Animation;
}

interface Encounter {
  spec: MonsterSpec;
  sprite: Sprite;
  animations: MobAnimations;
  hp: number;
  clockMs: number;
  /** 화면이 돌아간 동안 이 사냥에 쓴 시간 */
  ageMs: number;
  hitMs: number;
  dyingMs: number | null;
  /** 보스전이면 있다. 보스는 프레임마다 원작 기준점에 맞춰 그린다 */
  boss?: BossState;
  /** 직접 조작 모드의 맵 몬스터면 있다 */
  field?: { slot: number; patrol: Patrol; platform: Platform; stand: Animation };
}

interface BossState {
  spec: BossSpec;
  animations: BossAnimations;
  maxHp: number;
  events: BossFightEvents;
  action: 'stand' | 'move' | 'attack';
  actionMs: number;
  idleMs: number;
  homeX: number;
  moveDirection: -1 | 1;
  standDistance: number;
  /** stand 첫 프레임 기준. 왼쪽을 볼 때 기준점에서 몸통 왼쪽 끝·오른쪽 끝·머리까지의 거리. 부위가 있으면 부위까지 감싼다 */
  body: { left: number; right: number; top: number; height: number };
  /** 몸통 뒤에 원점을 맞춰 겹친 부위(클래식 자쿰 팔). 부위가 있는 보스는 돌아서지 않는다(원작 noFlip) */
  parts: { sprite: Sprite; animations: BossPart }[];
  finish(): void;
}

/** 맵 그림과 이미지 좌표로 옮긴 바닥. 마을과 보스 맵이 같이 쓴다 */
interface Stage {
  mapId: number;
  name: string;
  image: { texture: Texture; pixels: Pixels };
  calibration: Calibration;
  ground: GroundPath;
  /** 앞 레이어를 고르는 기준인 바닥 발판의 레이어(맵 좌표 그대로) */
  groundLayer: number;
  /** 포털까지 오르내리는 길. 맵 월드 좌표다. 못 만들면 null 이고 바닥만 걷는다 */
  nav: NavGraph | null;
  /** 맵 월드 좌표. page 를 못 받은 것은 앞 레이어에서 빼지 못한다 */
  ladders: LadderRope[];
  /** 맵 월드 좌표. 직접 조작이 이 발판 위를 움직인다 */
  footholds: Foothold[];
  mobs: MapMob[];
  /** 맵을 받은 시대. 앞 레이어·포털 그림·직접 조작 몹도 같은 시대에서 받는다 */
  era: Era;
}

type Behavior =
  | { kind: 'wander'; targetX: number; pauseMs: number }
  | { kind: 'approach' }
  | { kind: 'fight'; cooldownMs: number };

interface Effect {
  node: Container;
  update(dtMs: number): boolean;
  /** 포털처럼 늘 도는 것이면 그 가장 짧은 프레임 딜레이. 이것만 남으면 fps 를 낮출 수 있다 */
  loopDelayMs?: number;
}

function mobAction(framebooks: Record<string, number>): string {
  if (framebooks.move) return 'move';
  if (framebooks.fly) return 'fly';
  return 'stand';
}

async function loadMobAnimations(spec: MonsterSpec, era: Era): Promise<MobAnimations> {
  const { framebooks } = await fetchStoredJson<MobInfo>(mobInfoUrl(spec.id, era));
  const idle = mobAction(framebooks);
  const load = (action: string) =>
    loadAnimation(mobAnimationUrl(spec.id, action, era), (frame) => mobFrameUrl(spec.id, action, frame, era));
  const [move, hit, die] = await Promise.all([
    load(idle),
    load(framebooks.hit1 ? 'hit1' : idle),
    load(framebooks.die1 ? 'die1' : idle),
  ]);
  return { move, hit, die };
}

interface FieldMobArt {
  name: string;
  animations: MobAnimations;
  stand: Animation;
}

const fieldMobArts = new Map<string, Promise<FieldMobArt>>();

/** 맵 몬스터는 서 있다가 걷기도 해서 stand 도 받는다. 같은 몬스터는 한 번만 받는다. 맵과 같은 시대 몹으로 받는다 */
function loadFieldMobArt(mobId: number, era: Era): Promise<FieldMobArt> {
  const key = `${era}|${mobId}`;
  let pending = fieldMobArts.get(key);
  if (!pending) {
    pending = fetchStoredJson<MobInfo>(mobInfoUrl(mobId, era)).then(async ({ name, framebooks }) => {
      const idle = mobAction(framebooks);
      const load = (action: string) =>
        loadAnimation(mobAnimationUrl(mobId, action, era), (frame) => mobFrameUrl(mobId, action, frame, era));
      const [move, stand, hit, die] = await Promise.all([
        load(idle),
        framebooks.stand && idle !== 'stand' ? load('stand') : null,
        load(framebooks.hit1 ? 'hit1' : idle),
        load(framebooks.die1 ? 'die1' : idle),
      ]);
      return { name, animations: { move, hit, die }, stand: stand ?? move };
    });
    pending.catch(() => fieldMobArts.delete(key));
    fieldMobArts.set(key, pending);
  }
  return pending;
}

/**
 * 애니메이션 GIF 는 서버가 그리는 데 오래 걸리고 5xx 로 자주 실패한다(같은 때 프레임 PNG 는 1초 안에 온다).
 * 그러면 첫 프레임 한 장으로 대신한다. still 이면 나중에 다시 받는다
 */
async function loadHeroAction(look: number[], action: string, era: Era): Promise<{ animation: Animation; still: boolean }> {
  try {
    const animation = await loadAnimation(characterAnimationUrl(look, action, era), (frame) =>
      characterFrameUrl(look, action, frame, era),
    );
    return { animation, still: false };
  } catch (error) {
    console.warn(`[scene] 캐릭터 ${action} 애니메이션을 못 받아 정지 그림으로 대신한다`, error);
    const frame = await loadTexture(characterFrameUrl(look, action, 0, era));
    return { animation: { frames: [frame], delays: [STILL_FRAME_MS] }, still: true };
  }
}

async function loadHeroAnimations(job: JobView, era: Era): Promise<{ animations: HeroAnimations; still: boolean }> {
  keepArt('look', [characterArtBase(job.look, era)]);
  const [stand, walk, attack] = await Promise.all(
    [job.standAction, job.walkAction, job.attackAction].map((action) => loadHeroAction(job.look, action, era)),
  );
  storeHeroActions(job.look, [job.standAction, job.walkAction, job.attackAction], era);
  return {
    animations: { stand: stand.animation, walk: walk.animation, attack: attack.animation },
    still: stand.still || walk.still || attack.still,
  };
}

/** 의자 동작(sitAction)을 캐릭터 API 가 못 그리면 앉기로 대신한다 */
async function loadSitAnimation(look: number[], action: string, era: Era): Promise<Animation> {
  keepArt('chairLook', [characterArtBase(look, era)]);
  try {
    return (await loadHeroAction(look, action, era)).animation;
  } catch (error) {
    if (action === 'sit') throw error;
    return (await loadHeroAction(look, 'sit', era)).animation;
  }
}

/** 지금 모습에서 기기에 받아 둘 동작. 정지 그림으로 대신한 서기·걷기도 다시 받고, 스킬·사다리·로프 동작은 네트워크가 막혀도 그려진다 */
const STORED_HERO_ACTIONS = ['alert', 'jump', 'ladder', 'rope', 'prone'];
/** 맵·캐릭터를 다 받은 뒤에 받기 시작해 처음 그리는 데 끼어들지 않는다 */
const STORE_HERO_ACTIONS_DELAY_MS = 5000;
let storedHeroLook = '';

/** 지금 모습의 동작을 기기에만 하나씩 받아 둔다. 실패한 동작은 넘어가고 모습이 바뀌면 그만둔다 */
function storeHeroActions(look: number[], jobActions: string[], era: Era): void {
  const key = `${era}|${look.join(',')}|${jobActions.join(',')}`;
  if (key === storedHeroLook) return;
  storedHeroLook = key;
  [...new Set([...jobActions, ...STORED_HERO_ACTIONS])].reduce<Promise<unknown>>(
    (previous, action) =>
      previous.then(() => {
        if (storedHeroLook !== key) return;
        const gifUrl = characterAnimationUrl(look, action, era);
        return storeAnimation(gifUrl, (frame) => characterFrameUrl(look, action, frame, era)).catch(() => {});
      }),
    new Promise((resolve) => setTimeout(resolve, STORE_HERO_ACTIONS_DELAY_MS)),
  );
}

const totalMs = (animation: Animation) => animation.delays.reduce((sum, delay) => sum + delay, 0);

/**
 * 바닥 발판 레이어의 타일을 어림한 원점으로 받아 전체 렌더에 겹쳐 보정을 정확히 맞춘다. 타일이 없거나 위 레이어에 많이
 * 가려 못 맞추면 같은 레이어의 오브젝트로 한 번 더 해 본다(리스항구). 못 받거나 못 맞추면 null
 */
function exactCalibration(
  mapId: number,
  groundLayer: number,
  rough: Calibration,
  base: Pixels,
  era: Era,
): Promise<Calibration | null> {
  const tiles = groundLayer * 2 + 1;
  const variants = [[tiles], [tiles - 1], [tiles - 1, tiles]];
  return exactCalibrationFrom(
    rough,
    base,
    variants.length,
    async (variant, minX, minY) => {
      const stack = await loadLayerStack(variants[variant].map((layer) => mapLayerRenderUrl(mapId, layer, minX, minY, era)));
      if (!stack) return null;
      stack.texture.destroy(true);
      return stack.pixels;
    },
    CALIBRATION_MATCH_RATIO,
  );
}

/** layer 에 선 캐릭터를 가리는 레이어들을 한 장으로 겹친다. 원점이 같아 어느 layer 로 받아도 전체 렌더 위 위치가 같다 */
function loadFrontStack(mapId: number, layer: number, calibration: Calibration, ladders: LadderRope[], era: Era) {
  const minX = Math.round(-calibration.dx) - FRONT_SEARCH;
  const minY = Math.round(-calibration.dy) - FRONT_SEARCH;
  const layers = frontRenderLayers(layer);
  return loadLayerStack(
    layers.map((each) => mapLayerRenderUrl(mapId, each, minX, minY, era)),
    ladderRopeMasks(ladders, layers, { x: minX, y: minY }),
  );
}

/**
 * 사다리·로프마다 WZ page 를 붙인다. 맵 정보에는 page 가 없다. 자식 수가 맞지 않거나 못 받은 것은 page 없이 둔다
 */
async function loadLadderPages(mapId: number, ladders: LadderRope[], era: Era): Promise<LadderRope[]> {
  if (ladders.length === 0) return ladders;
  const { children } = await fetchStoredJson<{ children: string[] }>(mapLadderRopeNodeUrl(mapId, '', era));
  if (children.length !== ladders.length) return ladders;
  const pages = await Promise.all(
    children.map((name) =>
      fetchStoredJson<WzValue<number>>(mapLadderRopeNodeUrl(mapId, `${name}/page`, era)).then(
        ({ value }) => value,
        () => undefined,
      ),
    ),
  );
  return ladders.map((ladder, index) => ({ ...ladder, page: pages[index] }));
}

/**
 * 캐릭터보다 높은 레이어의 타일·오브젝트만 따로 받아 한 장으로 겹친다. 전체 렌더에도 같은 그림이 맨 위에 있으니
 * 픽셀을 맞대어 전체 렌더 위의 정확한 위치를 찾는다. 가릴 것이 없거나 위치를 못 맞추면 null
 */
async function loadFront(
  mapId: number,
  groundLayer: number,
  calibration: Calibration,
  ladders: LadderRope[],
  base: Pixels,
  era: Era,
): Promise<{ texture: Texture; x: number; y: number } | null> {
  const stack = await loadFrontStack(mapId, groundLayer, calibration, ladders, era);
  if (!stack) return null;
  const at = alignOverlay(base, stack.pixels, { x: -FRONT_SEARCH, y: -FRONT_SEARCH }, FRONT_SEARCH);
  if (!at) {
    stack.texture.destroy(true);
    return null;
  }
  return { texture: stack.texture, ...at };
}

export async function createScene(host: HTMLElement, callbacks: SceneCallbacks): Promise<Scene> {
  // 창 크기(트레이 「창 크기」)에 따라 setDisplayScale 이 바꾼다
  let width = host.clientWidth;
  let height = host.clientHeight;

  const app = new Application();
  await app.init({
    width,
    height,
    backgroundAlpha: 0,
    antialias: false,
    resolution: window.devicePixelRatio,
    autoDensity: true,
    // 캐릭터·몹이 맵 픽셀 사이 위치에 서도 꼭짓점을 기기 픽셀에 붙여서 도트 칸 폭이 흔들리지 않게 한다
    roundPixels: true,
  });
  app.ticker.maxFPS = FULL_FPS;
  const fullMinFps = app.ticker.minFPS;
  // 마우스 아래로 몹이 지나갈 때 hover 를 다시 재는 Pixi 시스템 티커가 따로 rAF 를 돌린다. 장면 티커가 프레임마다 대신 돌린다
  Ticker.system.autoStart = false;
  Ticker.system.stop();
  host.appendChild(app.canvas);

  const sky = new Graphics();
  const world = new Container();
  const mapSprite = new Sprite();
  const actors = new Container();
  const frontSprite = new Sprite();
  // 몬스터를 누르는 입력이 앞 레이어에 막히지 않게 한다
  frontSprite.eventMode = 'none';
  // 바닥보다 높은 레이어(윗층 발판·로프)에 있을 때 frontSprite 대신 쓴다
  const upperFrontSprite = new Sprite();
  upperFrontSprite.eventMode = 'none';
  const worldEffects = new Container();
  // 이름표는 원작처럼 앞 레이어보다 위, 대미지 숫자·스킬 이펙트보다 아래에 그린다
  const nameTag = new Container();
  nameTag.eventMode = 'none';
  nameTag.visible = false;
  const nameTagBack = new Graphics();
  const nameTagText = new Text({ style: { fontFamily: FONT, fontSize: NAME_TAG_FONT_SIZE, fill: 0xffffff } });
  nameTag.addChild(nameTagBack, nameTagText);
  world.addChild(mapSprite, actors, frontSprite, upperFrontSprite, nameTag, worldEffects);
  // 포털은 원작처럼 맵 위, 캐릭터·몬스터 뒤에 돈다
  const portalLayer = new Container();
  world.addChildAt(portalLayer, world.getChildIndex(actors));
  const overlay = new Container();
  const fade = new Graphics().rect(0, 0, width, height).fill(0x000000);
  app.stage.addChild(sky, world, overlay, fade);
  const bossGauge = createBossGauge(width);
  overlay.addChild(bossGauge.node);
  preloadBossGauge().catch(() => {});

  const hero = new Sprite();
  hero.anchor.set(0.5);
  // 의자 레이어는 z 가 음수면 캐릭터 뒤, 0 이상이면 앞이다. 둘 다 앞 레이어 아래라 맵 앞 그림에 같이 가린다
  const chairBack = new Container();
  const chairFront = new Container();
  chairBack.visible = false;
  chairFront.visible = false;
  // 탈것 레이어도 의자처럼 캐릭터 앞뒤로 나눠 그리고 맵 앞 레이어에 같이 가린다
  const mountBack = new Container();
  const mountFront = new Container();
  mountBack.visible = false;
  mountFront.visible = false;
  actors.addChild(chairBack, mountBack, hero, mountFront, chairFront);

  let ground: GroundPath | null = null;
  let heroAnimations: HeroAnimations | null = null;
  let skill: Skill | null = null;
  let fallbackRange = 60;
  let heroTier = 0;
  let lookKey = '';
  /** lookKey 를 다 못 받았을 때 다시 받을 시각. 다 받았거나 받는 중이면 Infinity */
  let lookRetryAt = Infinity;
  let heroAction: HeroAction = 'stand';
  let heroClockMs = 0;
  /** 지금 캐릭터 모습. 스킬창에서 쓴 스킬의 동작 그림을 같은 모습으로 받는다 */
  let heroLook: number[] = [];
  /** 캐릭터 그림을 받을 시대 */
  let heroEra: Era = 'current';
  /** 모습과 시대를 합친 이름. 같은 아이템이라도 시대가 다르면 다른 그림이다 */
  const heroLookId = () => `${heroEra}|${heroLook.join(',')}`;
  /** 스킬창에서 쓴 스킬의 동작. 끝나면 원래 동작으로 돌아간다 */
  let castPose: { animation: Animation; clockMs: number } | null = null;
  const castMotions = new Map<string, Promise<Animation | null>>();
  /** 다 받은 동작 그림. 스킬을 쓰는 순간 기다리지 않고 꺼내 쓴다 */
  const readyMotions = new Map<string, Animation | null>();
  /** 한 번 받아 본 스킬의 원작 동작 이름 */
  /** `{시대}|{스킬 ID}` → 그 스킬의 원작 동작 */
  const knownActions = new Map<string, string[]>();
  let facing: -1 | 1 = -1;
  let chairId: number | null = null;
  /** 고른 의자의 그림과 앉은 동작. 다 받아야 앉는다 */
  let chair: {
    art: ChairArt;
    layers: { loaded: LoadedChairLayer; delays: number[]; sprite: Sprite }[];
    sit: Animation;
    loopDelayMs: number;
  } | null = null;
  let chairKey = '';
  /** chairKey 를 못 받았을 때 다시 받을 시각 */
  let chairRetryAt = Infinity;
  let seated = false;
  let seatClockMs = 0;
  let mountId: number | null = null;
  type MountPose = {
    motion: MountMotion;
    /** 탈것 없이 받은 몸 동작(sit 등) 그림. 탈것 프레임 f 에는 f mod 장수를 쓴다 */
    rider: Texture[];
    layers: Texture[][];
    layouts: ReturnType<typeof mountFrameLayout>[];
    delays: number[];
  };
  /** 고른 탈것을 태운 지금 모습의 서기·걷기 그림. 다 받아야 탄다 */
  let mount: { art: MountArt; stand: MountPose; walk: MountPose } | null = null;
  let mountKey = '';
  /** mountKey 를 못 받았을 때 다시 받을 시각 */
  let mountRetryAt = Infinity;
  let riding = false;
  /** 포털까지 걸어가기 시작해서 옮긴 맵의 바닥에 내려올 때까지 */
  let traveling = false;
  /** 동작 그림 없이 쓴 스킬로 서 있을 남은 시간 */
  let castHoldMs = 0;
  let behavior: Behavior = { kind: 'wander', targetX: 0, pauseMs: 1000 };
  let encounter: Encounter | null = null;
  let encounterLoading = false;
  /** 보스 리소스를 받기 시작해서 마을로 돌아올 때까지 */
  let bossBusy = false;
  /** 지금 마을. 보스 맵에서 돌아올 때 맵을 다시 받지 않고 이 그림으로 돌아간다 */
  let home: { stage: Stage; town: Town } | null = null;
  let fadeTarget = 1;
  let running = true;
  let effects: Effect[] = [];
  let townLoads = 0;
  const worldScale = VIEW_SCALE;
  let viewWidth = width / worldScale;
  let cameraX = 0;
  let cameraY = 0;
  /** 이징이 끝나 맵이 더 움직이지 않는다 */
  let cameraSettled = true;

  world.scale.set(worldScale);
  // 맵과 같이 줄이면 글자 텍스처가 0.65 배로 다시 샘플링돼 흐려진다. 화면 픽셀 그대로 그리고 위치만 맵을 따라간다
  nameTag.scale.set(1 / worldScale);
  let nameLabel: string | null = null;

  const randomGroundX = () =>
    ground ? ground.minX + EDGE_MARGIN + Math.random() * (ground.maxX - ground.minX - EDGE_MARGIN * 2) : 0;
  const clampToGround = (x: number) =>
    ground ? Math.min(ground.maxX - EDGE_MARGIN, Math.max(ground.minX + EDGE_MARGIN, x)) : x;
  const standDistance = () =>
    framedDistance(
      Math.min(MAX_STAND_DISTANCE, Math.max(MIN_STAND_DISTANCE, (skill?.range ?? fallbackRange) * STAND_RATIO)),
      viewWidth,
      FRAME_MARGIN,
    );

  const basicEff: {
    normal?: DamageFont;
    critical?: DamageFont;
    levelUp?: EffectLayer;
    jobChanged?: EffectLayer;
  } = {};
  let basicEffRequestedAt = -Infinity;
  let damageNumbers = true;
  let levelUpScale = 1;
  /** 대미지 숫자·레벨업·전직 그림을 미리 받아 둔다. 서버가 죽어 있을 때 타격마다 수십 장을 다시 요청하지 않게 간격을 둔다 */
  function loadBasicEff(): void {
    if (performance.now() - basicEffRequestedAt < BASIC_EFF_RETRY_MS) return;
    basicEffRequestedAt = performance.now();
    const ignore = () => {
      // 못 받으면 글자로 대신 띄우고 다음에 다시 받는다
    };
    loadDamageFont('normal').then((font) => (basicEff.normal = font), ignore);
    loadDamageFont('critical').then((font) => (basicEff.critical = font), ignore);
    loadLevelUp().then((frames) => (basicEff.levelUp = frames), ignore);
    loadJobChanged().then((frames) => (basicEff.jobChanged = frames), ignore);
  }
  loadBasicEff();

  function addEffect(node: Container, layer: Container, update: (dtMs: number) => boolean, loopDelayMs?: number): void {
    layer.addChild(node);
    effects.push({ node, update, loopDelayMs });
  }

  /** 떠오르며 사라진다 */
  function floatUp(node: Container): void {
    let lifeMs = 0;
    addEffect(node, worldEffects, (dtMs) => {
      lifeMs += dtMs;
      node.y -= 0.03 * dtMs;
      node.alpha = Math.max(0, 1 - lifeMs / 1100);
      return lifeMs < 1100;
    });
  }

  /** 원작 이펙트를 아직 못 받았을 때 대신 쓰는 글자 */
  function floatText(text: string, x: number, y: number, color: number, size: number): void {
    const label = new Text({
      text,
      style: { fontFamily: FONT, fontSize: size, fontWeight: '900', fill: color, stroke: { color: 0x3a1a00, width: 5 } },
    });
    label.anchor.set(0.5);
    label.position.set(x, y);
    floatUp(label);
  }

  /** 원작 대미지 숫자. baseline 은 숫자 아래끝이다. 글꼴을 못 받았으면 글자로 대신 띄운다 */
  function floatDamage(damage: number, x: number, baseline: number, critical: boolean): void {
    if (!damageNumbers) return;
    const font = critical ? basicEff.critical : basicEff.normal;
    if (!font) {
      loadBasicEff();
      floatText(damage.toLocaleString(), x, baseline - DAMAGE_TEXT_HALF_HEIGHT, critical ? 0xffe14d : 0xff9a3a, 22);
      return;
    }
    const row = new Container();
    const placed = layoutDamage(damage, font, DIGIT_OVERLAP);
    const addGlyph = (glyph: (typeof placed)[number]['glyph'], at: number) => {
      const sprite = new Sprite(glyph.texture);
      sprite.pivot.set(glyph.origin.x, glyph.origin.y);
      sprite.x = at;
      row.addChild(sprite);
    };
    if (font.effect) addGlyph(font.effect, placed[0].x);
    placed.forEach(({ glyph, x: at }) => addGlyph(glyph, at));
    row.position.set(x, baseline);
    floatUp(row);
  }

  /** 캐릭터 발밑을 따라다니며 한 번 재생한다. behindHero 면 캐릭터 뒤에 그린다. 배율은 발밑(기준점)을 중심으로 준다 */
  function playAtHero(frames: EffectLayer, behindHero: boolean, scale = 1): void {
    const sprite = new Sprite(frames[0].texture);
    sprite.scale.set(scale);
    const delays = frames.map((frame) => frame.delay);
    let elapsedMs = 0;
    const update = (dtMs: number) => {
      elapsedMs += dtMs;
      const index = frameAt(delays, elapsedMs, false);
      if (index < 0) return false;
      sprite.texture = frames[index].texture;
      sprite.pivot.set(frames[index].origin.x, frames[index].origin.y);
      sprite.position.set(hero.x, hero.y);
      return true;
    };
    update(0);
    if (behindHero) {
      addEffect(sprite, actors, update);
      actors.setChildIndex(sprite, actors.getChildIndex(hero));
    } else {
      addEffect(sprite, worldEffects, update);
    }
  }

  /** 원작 이펙트 프레임을 기준점(origin)과 딜레이 그대로 재생한다. 원작 이펙트는 왼쪽을 보고 그려져 있다 */
  function playLayers(layers: EffectLayer[], x: number, y: number, face: -1 | 1, delayMs = 0): void {
    layers.forEach((frames) => {
      if (frames.length === 0) return;
      const sprite = new Sprite(frames[0].texture);
      sprite.position.set(x, y);
      sprite.scale.x = -face;
      sprite.visible = false;
      const delays = frames.map((frame) => frame.delay);
      let elapsedMs = -delayMs;
      addEffect(sprite, worldEffects, (dtMs) => {
        elapsedMs += dtMs;
        if (elapsedMs < 0) return true;
        const index = frameAt(delays, elapsedMs, false);
        if (index < 0) return false;
        sprite.visible = true;
        sprite.texture = frames[index].texture;
        sprite.pivot.set(frames[index].origin.x, frames[index].origin.y);
        return true;
      });
    });
  }

  function showBanner(name: string, y = BANNER_Y): void {
    const banner = new Text({
      text: name,
      style: { fontFamily: FONT, fontSize: 18, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x22304a, width: 4 } },
    });
    banner.anchor.set(0.5);
    banner.position.set(width / 2, y);
    let lifeMs = 0;
    addEffect(banner, overlay, (dtMs) => {
      lifeMs += dtMs;
      banner.alpha = lifeMs < 2000 ? 1 : Math.max(0, 1 - (lifeMs - 2000) / 600);
      return lifeMs < 2600;
    });
  }

  let skyColors: Pick<Town, 'sky'> | null = null;
  function paintSky(town: Pick<Town, 'sky'>): void {
    skyColors = town;
    sky.clear();
    const bands = 12;
    const bandHeight = Math.ceil(height / bands);
    for (let band = 0; band < bands; band += 1) {
      sky.rect(0, band * bandHeight, width, bandHeight + 1).fill(lerpColor(town.sky[0], town.sky[1], band / (bands - 1)));
    }
  }

  /** floor: 떨어져 멈출 높이. 없으면 바닥 */
  function dropMeso(amount: number, x: number, y: number, floor = ground ? groundY(ground, x) : y): void {
    if (!ground || amount <= 0) return;
    const coin = new Sprite();
    coin.anchor.set(0.5, 1);
    coin.position.set(x, y);
    let vy = -0.45;
    let lifeMs = 0;
    loadTexture(mesoDropIconUrl(amount))
      .then((texture) => (coin.texture = texture))
      .catch(() => {});
    addEffect(coin, worldEffects, (dtMs) => {
      lifeMs += dtMs;
      if (lifeMs < 1000) {
        vy += 0.0018 * dtMs;
        coin.y = Math.min(floor, coin.y + vy * dtMs);
      } else {
        const ease = Math.min(1, dtMs / 120);
        coin.x += (hero.x - coin.x) * ease;
        coin.y += (hero.y - 20 - coin.y) * ease;
        coin.alpha = Math.max(0, 1 - (lifeMs - 1000) / 350);
      }
      return lifeMs < 1350;
    });
  }

  function setHeroAction(action: HeroAction): void {
    if (heroAction === action) return;
    heroAction = action;
    heroClockMs = 0;
  }

  function showMountLayers(visible: boolean): void {
    mountBack.visible = visible;
    mountFront.visible = visible;
  }

  /** 탈것 프레임의 레이어를 캐릭터 앞뒤에 놓는다. 스프라이트는 레이어 수만큼 늘려 두고 남는 것은 숨긴다 */
  function placeMountLayers(pose: MountPose, frame: number): void {
    const layout = pose.layouts[frame];
    const textures = pose.layers[frame];
    ([
      [mountBack, layout.back],
      [mountFront, layout.front],
    ] as const).forEach(([container, placed]) => {
      container.position.set(hero.x, hero.y);
      container.scale.x = -facing;
      while (container.children.length < placed.length) container.addChild(new Sprite());
      container.children.forEach((child, slot) => {
        const each = placed[slot];
        child.visible = each !== undefined;
        if (!each) return;
        (child as Sprite).texture = textures[each.index];
        child.position.set(each.x, each.y);
      });
    });
    showMountLayers(true);
  }

  function updateHeroSprite(dtMs: number): void {
    if (!heroAnimations) return;
    heroClockMs += dtMs;
    hero.pivot.set(0, 0);
    showMountLayers(false);
    if (castPose) {
      castPose.clockMs += dtMs;
      const castIndex = frameAt(castPose.animation.delays, castPose.clockMs, false);
      if (castIndex >= 0) {
        hero.texture = castPose.animation.frames[castIndex];
        hero.scale.x = -facing;
        return;
      }
      castPose = null;
    }
    if (riding && mount && heroAction !== 'attack') {
      const pose = heroAction === 'walk' ? mount.walk : mount.stand;
      const index = frameAt(pose.delays, heroClockMs, true);
      hero.texture = pose.rider[index % pose.rider.length];
      hero.scale.x = -facing;
      // 발(hero 위치)은 지면에 두고 그림만 옮겨서 이름표·카메라는 발을 따라간다
      const offset = riderImageOffset(pose.motion, index);
      hero.pivot.set(-offset.x, -offset.y);
      placeMountLayers(pose, index);
      return;
    }
    const animation = heroAnimations[heroAction];
    let index = frameAt(animation.delays, heroClockMs, heroAction !== 'attack');
    if (index < 0) {
      setHeroAction('stand');
      index = 0;
    }
    hero.texture = heroAnimations[heroAction].frames[index];
    // 메이플 스프라이트는 왼쪽을 보고 그려져 있다
    hero.scale.x = -facing;
  }

  function strike(target: Encounter, bonus: boolean): void {
    if (target.dyingMs !== null) return;
    const lines = skill?.hits ?? 1;
    const bossSpan = target.boss ? bossBodySpan(target, target.boss) : null;
    const center = bossSpan
      ? { x: (bossSpan.left + bossSpan.right) / 2, y: bossSpan.y - target.boss!.body.height / 2 }
      : { x: target.sprite.x, y: target.sprite.y - target.sprite.height / 2 };
    const top = bossSpan
      ? Math.max(bossSpan.y - target.boss!.body.top, bossDamageCeiling() + (lines - 1) * HIT_LINE_HEIGHT)
      : target.sprite.y - target.sprite.height;
    const base = (80 + Math.random() * 120) * (1 + heroTier * heroTier * 4) * (bonus ? 1.5 : 1);
    for (let line = 0; line < lines; line += 1) {
      const damage = Math.floor(base * (0.85 + Math.random() * 0.3));
      const baseline = top + 8 - line * HIT_LINE_HEIGHT;
      let waitMs = line * HIT_LINE_STAGGER_MS;
      addEffect(new Container(), worldEffects, (dtMs) => {
        waitMs -= dtMs;
        if (waitMs > 0) return true;
        floatDamage(damage, center.x, baseline, bonus);
        return false;
      });
      if (skill) playLayers(skill.hit, center.x, center.y, facing, line * HIT_LINE_STAGGER_MS);
    }
    target.hp -= bonus ? 2 : 1;
    target.hitMs = 300;
    if (target.boss) bossGauge.setRatio(target.hp / target.boss.maxHp);
    if (target.hp <= 0) {
      target.dyingMs = 0;
      target.clockMs = 0;
      target.sprite.eventMode = 'none';
      if (target.boss) dropBossMeso(target.boss.events.onDefeat(), center.x, target.sprite.y - 10);
      else if (target.field) {
        manual?.table.kill(target.field.slot, manual.clockMs);
        dropMeso(callbacks.onFieldKill?.(target.spec) ?? 0, target.sprite.x, target.sprite.y - 10, target.sprite.y);
      } else dropMeso(callbacks.onKill(target.spec), target.sprite.x, target.sprite.y - 10);
    }
  }

  /** 지금 보스 몸통이 차지한 좌우 끝(맵 x)과 발 높이. 몸통은 stand 첫 프레임 기준이라 동작이 바뀌어도 흔들리지 않는다 */
  function bossBodySpan(target: Encounter, boss: BossState): BodySpan {
    // 메이플 스프라이트는 왼쪽을 보고 그려져 있어서 scale.x 가 -1 이면 몸통이 기준점 반대쪽으로 뒤집힌다
    const flip = target.sprite.scale.x < 0;
    const x = target.sprite.x;
    return flip
      ? { left: x - boss.body.right, right: x - boss.body.left, y: target.sprite.y }
      : { left: x + boss.body.left, right: x + boss.body.right, y: target.sprite.y };
  }

  /** HUD·HP 게이지 아래로 보이는 가장 높은 곳(맵 y) */
  function bossDamageCeiling(): number {
    return (-world.position.y + BOSS_DAMAGE_CEILING) / worldScale;
  }

  /** 큰 보상이라 메소를 여러 개로 나눠 몸통 둘레에 흩뿌린다 */
  function dropBossMeso(total: number, x: number, y: number): void {
    if (total <= 0) return;
    const each = Math.max(1, Math.floor(total / BOSS_COINS));
    for (let coin = 0; coin < BOSS_COINS; coin += 1) {
      const amount = coin === BOSS_COINS - 1 ? total - each * (BOSS_COINS - 1) : each;
      const at = clampToGround(x + (coin / (BOSS_COINS - 1) - 0.5) * 2 * BOSS_COIN_SPREAD);
      let waitMs = coin * BOSS_COIN_STAGGER_MS;
      addEffect(new Container(), worldEffects, (dtMs) => {
        waitMs -= dtMs;
        if (waitMs > 0) return true;
        dropMeso(amount, at, y);
        return false;
      });
    }
  }

  /** 첫 프레임들의 기준점에서 왼쪽·오른쪽 끝과 머리까지. 부위가 있으면 몸통과 부위를 모두 감싼다 */
  function bossBodyBox(stands: PlacedAnimation[]): BossState['body'] {
    const boxes = stands.map(({ frames, origins }) => ({
      left: -origins[0].x,
      right: frames[0].width - origins[0].x,
      top: origins[0].y,
      bottom: frames[0].height - origins[0].y,
    }));
    const top = Math.max(...boxes.map((box) => box.top));
    return {
      left: Math.min(...boxes.map((box) => box.left)),
      right: Math.max(...boxes.map((box) => box.right)),
      top,
      height: top + Math.max(...boxes.map((box) => box.bottom)),
    };
  }

  function showBossFrame(sprite: Sprite, animation: PlacedAnimation, index: number): void {
    sprite.texture = animation.frames[index];
    sprite.pivot.set(animation.origins[index].x, animation.origins[index].y);
  }

  /** 보스는 플레이어를 때리지 않는다. 서 있다가 가끔 공격 동작을 하거나 제자리 근처를 오간다 */
  function updateBoss(current: Encounter, boss: BossState, dtMs: number): void {
    if (!ground) return;
    const { sprite } = current;
    const { animations } = boss;
    current.hitMs = Math.max(0, current.hitMs - dtMs);
    boss.actionMs += dtMs;

    if (current.dyingMs !== null) {
      current.dyingMs += dtMs;
      // 부위는 쓰러지는 그림 없이 몸통이 쓰러지기 시작할 때부터 흐려진다
      boss.parts.forEach((part) => (part.sprite.alpha = Math.max(0, part.sprite.alpha - dtMs / BOSS_DEATH_FADE_MS)));
      const index = frameAt(animations.die.delays, current.dyingMs, false);
      if (index >= 0) {
        showBossFrame(sprite, animations.die, index);
        return;
      }
      sprite.alpha = Math.max(0, sprite.alpha - dtMs / BOSS_DEATH_FADE_MS);
      if (sprite.alpha > 0) return;
      actors.removeChild(sprite);
      sprite.destroy();
      removeBossParts(boss);
      encounter = null;
      behavior = { kind: 'wander', targetX: hero.x, pauseMs: BOSS_OUTRO_MS };
      let waitMs = BOSS_OUTRO_MS;
      addEffect(new Container(), worldEffects, (step) => {
        waitMs -= step;
        if (waitMs > 0) return true;
        boss.finish();
        return false;
      });
      return;
    }

    sprite.alpha = Math.min(1, sprite.alpha + dtMs / 300);
    const faceHero = () => {
      if (boss.parts.length === 0) sprite.scale.x = hero.x > sprite.x ? -1 : 1;
    };
    if (boss.action === 'attack' && animations.attack) {
      const index = frameAt(animations.attack.delays, boss.actionMs, false);
      if (index >= 0) showBossFrame(sprite, animations.attack, index);
      else boss.action = 'stand';
      faceHero();
    } else if (boss.action === 'move' && animations.move) {
      const nextX = sprite.x + (boss.moveDirection * BOSS_SPEED * dtMs) / 1000;
      if (boss.actionMs >= BOSS_MOVE_MS || Math.abs(nextX - boss.homeX) > BOSS_WANDER) boss.action = 'stand';
      else sprite.x = clampToGround(nextX);
      showBossFrame(sprite, animations.move, frameAt(animations.move.delays, boss.actionMs, true));
      sprite.scale.x = boss.moveDirection > 0 ? -1 : 1;
    } else {
      boss.action = 'stand';
      if (current.hitMs > 0) showBossFrame(sprite, animations.hit, 0);
      else showBossFrame(sprite, animations.stand, frameAt(animations.stand.delays, boss.actionMs, true));
      faceHero();
      if (behavior.kind === 'fight') boss.idleMs -= dtMs;
      if (boss.idleMs <= 0) {
        const attack = animations.attack && (!animations.move || Math.random() < BOSS_ATTACK_CHANCE);
        boss.action = attack ? 'attack' : 'move';
        boss.actionMs = 0;
        boss.idleMs = BOSS_IDLE_MIN_MS + Math.random() * BOSS_IDLE_EXTRA_MS;
        // 제자리에서 멀어졌으면 돌아오는 쪽으로 걷는다
        boss.moveDirection = sprite.x > boss.homeX ? -1 : sprite.x < boss.homeX ? 1 : Math.random() < 0.5 ? -1 : 1;
      }
    }
    sprite.y = groundY(ground, sprite.x);
    boss.parts.forEach(({ sprite: part, animations: art }) => {
      if (current.hitMs > 0) showBossFrame(part, art.hit, 0);
      else showBossFrame(part, art.stand, frameAt(art.stand.delays, current.ageMs, true));
      part.alpha = sprite.alpha;
      part.position.set(sprite.x, sprite.y);
    });
  }

  function removeBossParts(boss: BossState): void {
    boss.parts.forEach(({ sprite }) => {
      actors.removeChild(sprite);
      sprite.destroy();
    });
    boss.parts = [];
  }

  /**
   * 스킬 동작 그림. 스킬 데이터의 동작(alert2 등)을 먼저, 그 동작을 캐릭터 API 가 못 그리면 원작 전투 대기 동작 alert 로 대신한다.
   * 둘 다 못 받으면 동작 없이 이펙트만 쓴다
   */
  const motionKey = (actions: string[]) => `${heroLookId()}|${actions[0] ?? ''}`;

  function castMotion(actions: string[]): Promise<Animation | null> {
    const look = heroLook;
    const era = heroEra;
    const key = motionKey(actions);
    let pending = castMotions.get(key);
    if (!pending) {
      pending = [...actions.slice(0, 1), 'alert']
        .reduce<Promise<Animation | null>>(
          (previous, action) =>
            previous.then((found) => found ?? loadHeroAction(look, action, era).then(({ animation }) => animation, () => null)),
          Promise.resolve(null),
        )
        .then((animation) => {
          readyMotions.set(key, animation);
          return animation;
        });
      castMotions.set(key, pending);
    }
    return pending;
  }

  function startAttack(target: Encounter): void {
    // 캐릭터 그림을 아직 못 받았어도 사냥은 이어 간다. 그림이 없을 때 멈추면 몬스터가 안 죽어 다음 사냥·마을 이동이 다 막힌다
    if (heroAnimations) setHeroAction('attack');
    if (skill) playLayers(skill.effect, hero.x, hero.y, facing);
    let waitMs = (heroAnimations ? totalMs(heroAnimations.attack) : NO_ART_ATTACK_MS) * HIT_POINT_RATIO;
    addEffect(new Container(), worldEffects, (dtMs) => {
      waitMs -= dtMs;
      if (waitMs > 0) return true;
      strike(target, false);
      return false;
    });
  }

  function rideNow(climbing: boolean): boolean {
    // 직접 조작에는 점프·사다리·공격이 섞이는데 탈것에는 서기·걷기 그림뿐이라 내려서 걷는다
    if (manual) return false;
    return shouldRide({
      mountReady: mount !== null && heroAnimations !== null,
      chairSelected: chairId !== null,
      traveling,
      fighting: encounter !== null || behavior.kind !== 'wander' || (bossBusy && portalStage !== home?.stage),
      casting: castPose !== null || castHoldMs > 0,
      climbing,
    });
  }

  function updateHero(dtMs: number): void {
    if (!ground) return;
    if (navMotion) {
      stepNavMotion(dtMs);
      return;
    }
    riding = rideNow(false);
    // 아래에서 hero.y 를 바닥 높이로 맞추면 윗층 포털에 선 캐릭터가 화면이 어두워지는 동안 바닥으로 떨어져 보인다
    if (parkedAtPortal) {
      setHeroAction('stand');
      updateHeroSprite(dtMs);
      return;
    }
    if (manual) {
      stepManual(manual, dtMs);
      return;
    }
    const moveToward = (targetX: number): boolean => {
      const distance = targetX - hero.x;
      if (Math.abs(distance) < 3) return true;
      facing = distance > 0 ? 1 : -1;
      hero.x += facing * Math.min(Math.abs(distance), (WALK_SPEED * (riding ? RIDE_SPEED_SCALE : 1) * dtMs) / 1000);
      setHeroAction('walk');
      return false;
    };

    if (behavior.kind === 'wander') {
      const seatHeld = chair !== null && !traveling;
      if (behavior.pauseMs > 0) {
        behavior.pauseMs = wanderPauseLeft(behavior.pauseMs, dtMs, seatHeld);
        if (heroAction !== 'attack') setHeroAction('stand');
      } else if (moveToward(behavior.targetX)) {
        behavior = { kind: 'wander', targetX: randomGroundX(), pauseMs: wanderPauseMs(seatHeld, Math.random()) };
      }
    } else if (encounter) {
      const side = hero.x < encounter.sprite.x ? -1 : 1;
      const standX = clampToGround(encounter.sprite.x + side * (encounter.boss?.standDistance ?? standDistance()));
      if (behavior.kind === 'approach') {
        if (moveToward(standX)) behavior = { kind: 'fight', cooldownMs: 100 };
      } else if (heroAction !== 'attack') {
        facing = side === -1 ? 1 : -1;
        setHeroAction('stand');
        behavior.cooldownMs -= dtMs;
        if (behavior.cooldownMs <= 0 && encounter.dyingMs === null) {
          startAttack(encounter);
          // 그림 없이 때리면 공격 동작이 끝나기를 기다리지 않으니 그 몫을 쉬는 시간에 얹는다
          behavior.cooldownMs = ATTACK_COOLDOWN_MS + (heroAnimations ? 0 : NO_ART_ATTACK_MS);
        }
      }
    }
    hero.y = groundY(ground, hero.x);
    updateHeroSprite(dtMs);
  }

  /** 고른 의자의 그림과 지금 모습의 앉은 동작을 받는다. 받는 동안은 앞 의자를 그대로 쓴다 */
  function loadChair(): void {
    const art = chairId === null ? null : chairArtOf(chairId);
    if (!art || heroLook.length === 0) {
      chairKey = '';
      clearChair();
      return;
    }
    const look = seatedLook(heroLook, art);
    const key = `${art.id}|${heroEra}|${look.join(',')}`;
    if (key === chairKey && performance.now() < chairRetryAt) return;
    chairKey = key;
    chairRetryAt = Infinity;
    Promise.all([loadChairLayers(art), loadSitAnimation(look, art.sitAction ?? 'sit', heroEra)]).then(
      ([layers, sit]) => {
        if (chairKey === key) placeChair(art, layers, sit);
      },
      (error: unknown) => {
        if (chairKey !== key) return;
        console.warn('[scene] 의자 그림을 못 받아 잠시 뒤 다시 받는다', error);
        chairRetryAt = performance.now() + LOOK_RETRY_MS;
      },
    );
  }

  /** 고른 탈것의 서기·걷기 레이어와 지금 모습의 탄 몸 동작(sit 등)을 받는다. 받는 동안은 앞 그림을 그대로 쓴다 */
  function loadMount(): void {
    const art = mountId === null ? null : mountArtOf(mountId);
    if (!art || heroLook.length === 0) {
      mountKey = '';
      mount = null;
      return;
    }
    const look = riderLook(heroLook, art);
    const era = heroEra;
    const key = `${art.id}|${era}|${look.join(',')}`;
    if (key === mountKey && performance.now() < mountRetryAt) return;
    mountKey = key;
    mountRetryAt = Infinity;
    // 탈것 그림은 시대와 상관없이 KMS 389 TamingMob 이다. 탄 몸만 캐릭터 시대 그림으로 받아 끼운다
    keepArt('mountLook', [characterArtBase(look, era)]);
    const loadPose = async (motion: MountMotion): Promise<MountPose> => {
      const [rider, layers] = await Promise.all([loadHeroAction(look, motion.body, era), loadMountFrames(motion)]);
      return {
        motion,
        rider: rider.animation.frames,
        layers,
        layouts: motion.frames.map((_, frame) => mountFrameLayout(motion, frame)),
        delays: motionDelays(motion),
      };
    };
    Promise.all([loadPose(art.stand), loadPose(art.walk)]).then(
      ([stand, walk]) => {
        if (mountKey === key) mount = { art, stand, walk };
      },
      (error: unknown) => {
        if (mountKey !== key) return;
        console.warn('[scene] 탈것 그림을 못 받아 잠시 뒤 다시 받는다', error);
        mountRetryAt = performance.now() + LOOK_RETRY_MS;
      },
    );
  }

  function clearChair(): void {
    if (seated) standUp();
    [chairBack, chairFront].forEach((layer) => layer.removeChildren().forEach((sprite) => sprite.destroy()));
    chair = null;
  }

  function placeChair(art: ChairArt, layers: LoadedChairLayer[], sit: Animation): void {
    const firstChair = chair === null;
    clearChair();
    const { back, front } = layerOrder(layers.map((loaded) => ({ z: loaded.data.z, loaded })));
    const place = (container: Container) => (each: { loaded: LoadedChairLayer }) => {
      const sprite = new Sprite(each.loaded.frames[0].texture);
      container.addChild(sprite);
      return { loaded: each.loaded, delays: each.loaded.frames.map((frame) => frame.delay), sprite };
    };
    chair = { art, layers: [...back.map(place(chairBack)), ...front.map(place(chairFront))], sit, loopDelayMs: chairLoopDelayMs(art) };
    // 의자를 처음 받으면 돌아다니던 중이어도 바닥 끝·포털에서 비켜 선 가까운 자리에 앉는다
    if (firstChair && !traveling && !bossBusy && portalStage?.ground === ground && behavior.kind === 'wander') {
      behavior = { kind: 'wander', targetX: seatSpot(portalStage, hero.x), pauseMs: 0 };
    }
  }

  /** 맵에 들어와 앉을 자리. 의자가 없으면 x 그대로다 */
  function seatSpot(stage: Stage, x: number, extraPortalXs: number[] = []): number {
    if (!chair) return x;
    const portals = (routePortals.get(stage.mapId) ?? []).map((portal) => portal.x + stage.calibration.dx);
    return seatSpotX(x, stage.ground, [...extraPortalXs, ...portals]);
  }

  /** 서기·걷기 그림을 고른 뒤에 앉은 그림으로 덮는다. 일어설 때는 같은 프레임에 서기 그림이 이미 들어 있다 */
  function updateSeat(dtMs: number): void {
    const sitting = shouldSit({
      chairReady: chair !== null && heroAnimations !== null,
      // 보스 그림을 받는 동안과 마을로 돌아와 밝아지는 동안은 마을에 앉아 있는다
      fighting: encounter !== null || (bossBusy && portalStage !== home?.stage),
      // 직접 조작 중에는 의자에 앉지 않는다
      traveling: traveling || parkedAtPortal || navMotion !== null || manual !== null || manualReturning,
      casting: castPose !== null || castHoldMs > 0,
      onGround: ground !== null && navMotion === null,
      moving: heroAction !== 'stand' || behavior.kind !== 'wander' || behavior.pauseMs <= 0,
    });
    if (!sitting) {
      if (seated) {
        standUp();
        // 의자에서 일어나 바로 타면 standUp 이 탈것 그림 위치를 지워서 이번 프레임 그림을 다시 고른다
        if (riding) updateHeroSprite(0);
      }
      return;
    }
    if (seated) seatClockMs += dtMs;
    else {
      seated = true;
      seatClockMs = 0;
      chairBack.visible = true;
      chairFront.visible = true;
    }
    const { art, layers, sit } = chair!;
    const face = seatFacing(art, facing);
    const body = seatedBodyOffset(art);
    hero.texture = sit.frames[frameAt(sit.delays, seatClockMs, true)];
    hero.scale.x = -face;
    // 발(hero 위치)은 그대로 두고 그림만 옮겨서 이름표·카메라·이펙트는 발을 따라간다
    hero.pivot.set(-body.x, -body.y);
    [chairBack, chairFront].forEach((layer) => {
      layer.position.set(hero.x, hero.y);
      layer.scale.x = -face;
    });
    layers.forEach(({ loaded, delays, sprite }) => {
      const frame = loaded.frames[frameAt(delays, seatClockMs, true)];
      const at = frameTopLeft(layerAnchor(art, loaded.data), frame.origin);
      sprite.texture = frame.texture;
      sprite.position.set(at.x, at.y);
    });
  }

  function standUp(): void {
    seated = false;
    hero.pivot.set(0, 0);
    chairBack.visible = false;
    chairFront.visible = false;
  }

  function updateEncounter(dtMs: number): void {
    if (!encounter || !ground) return;
    encounter.ageMs += dtMs;
    if (encounter.ageMs > ENCOUNTER_LIMIT_MS && encounter.dyingMs === null) {
      console.warn(`[scene] ${encounter.spec.name} 사냥이 끝나지 않아 마무리한다`);
      encounter.hp = 1;
      strike(encounter, false);
    }
    if (encounter.boss) {
      updateBoss(encounter, encounter.boss, dtMs);
      return;
    }
    const current = encounter;
    const { sprite, animations } = current;
    current.clockMs += dtMs;
    current.hitMs = Math.max(0, current.hitMs - dtMs);

    if (current.dyingMs !== null) {
      current.dyingMs += dtMs;
      const index = frameAt(animations.die.delays, current.dyingMs, false);
      if (index >= 0) {
        sprite.texture = animations.die.frames[index];
      } else {
        sprite.alpha = Math.max(0, sprite.alpha - dtMs / 300);
        if (sprite.alpha <= 0) {
          actors.removeChild(sprite);
          sprite.destroy();
          encounter = null;
          behavior = { kind: 'wander', targetX: randomGroundX(), pauseMs: 1000 };
        }
      }
      return;
    }

    if (current.hitMs > 0) {
      sprite.texture = animations.hit.frames[0];
    } else {
      sprite.texture = animations.move.frames[frameAt(animations.move.delays, current.clockMs, true)];
      if (behavior.kind === 'approach') {
        const direction = hero.x > sprite.x ? 1 : -1;
        sprite.x = clampToGround(sprite.x + (direction * MOB_SPEED * dtMs) / 1000);
      }
    }
    sprite.alpha = Math.min(1, sprite.alpha + dtMs / 300);
    sprite.scale.x = hero.x > sprite.x ? -1 : 1;
    sprite.y = groundY(ground, sprite.x);
  }

  function updateCamera(ease: number): void {
    if (!mapSprite.texture || !ground) return;
    const target = encounter ? { x: encounter.sprite.x, y: encounter.sprite.y } : null;
    const focus = encounter?.boss
      ? spanFocus(hero, HERO_HALF_WIDTH, bossBodySpan(encounter, encounter.boss), viewWidth, FRAME_MARGIN)
      : cameraFocus({ x: hero.x, y: hero.y }, target, viewWidth, FRAME_MARGIN);
    const scroll = cameraScroll(
      focus,
      worldScale,
      { width, height },
      { width: mapSprite.texture.width, height: mapSprite.texture.height },
      FEET_SCREEN_Y_FROM_BOTTOM,
    );
    cameraX += (-scroll.x - cameraX) * ease;
    cameraY += (-scroll.y - cameraY) * ease;
    // 이징 중간값을 그대로 쓰면 맵이 기기 픽셀 사이에 걸려 도트가 칸마다 다르게 찍힌다. 이징은 실수로 이어 가고 그릴 위치만 맞춘다
    const resolution = app.renderer.resolution;
    world.position.set(Math.round(cameraX * resolution) / resolution, Math.round(cameraY * resolution) / resolution);
    // 남은 이징이 기기 픽셀 하나 안쪽이면 10fps 로 마저 따라가도 끊겨 보이지 않는다
    cameraSettled = Math.abs(-scroll.x - cameraX) * resolution < 1 && Math.abs(-scroll.y - cameraY) * resolution < 1;
    placeNameTag();
  }

  /** 원작 기본 이름표는 그림이 아니라 클라이언트가 그린다. 반투명 검은 상자의 네 모서리를 1px 씩 깎아 둥글게 보인다 */
  function drawNameTag(label: string): void {
    nameTagText.text = label;
    const box = nameTagBox({ width: nameTagText.width, height: nameTagText.height });
    nameTagText.position.set(box.textX, box.textY);
    nameTagBack
      .clear()
      .rect(1, 0, box.width - 2, box.height)
      .rect(0, 1, 1, box.height - 2)
      .rect(box.width - 1, 1, 1, box.height - 2)
      .fill({ color: 0x000000, alpha: NAME_TAG_ALPHA });
  }

  /** 카메라를 옮긴 뒤 불러야 기기 픽셀에 맞춘 맵 위치를 기준으로 이름표를 맞춘다 */
  function placeNameTag(): void {
    // 캐릭터 그림이 없을 때 이름표만 떠 있지 않게 한다
    nameTag.visible = nameLabel !== null && heroAnimations !== null && ground !== null;
    if (!nameTag.visible) return;
    const feet = { x: world.position.x + hero.x * worldScale, y: world.position.y + hero.y * worldScale };
    const box = { width: nameTagBack.width, height: nameTagBack.height };
    const at = nameTagPosition(feet, box, { width, height }, app.renderer.resolution);
    nameTag.position.set((at.x - world.position.x) / worldScale, (at.y - world.position.y) / worldScale);
  }

  function setFront(front: { texture: Texture; x: number; y: number } | null): void {
    const previous = frontSprite.texture;
    frontSprite.texture = front?.texture ?? Texture.EMPTY;
    frontSprite.position.set(front?.x ?? 0, front?.y ?? 0);
    if (previous !== Texture.EMPTY && previous !== frontSprite.texture) previous.destroy(true);
    if (front) return;
    upperFrontSprite.visible = false;
    upperFrontSprite.texture = Texture.EMPTY;
    upperFronts.forEach((texture) => texture?.destroy(true));
    upperFronts.clear();
  }

  /** 지금 맵에서 바닥보다 높은 레이어마다 받은 앞 레이어. 받는 중이거나 가릴 것이 없으면 null */
  const upperFronts = new Map<number, Texture | null>();

  /**
   * 원작은 캐릭터를 선 레이어(사다리·로프에서는 그 page)의 그림 바로 위에 그린다. 바닥 레이어보다 높으면 바닥 기준 앞 레이어에
   * 캐릭터 뒤에 있어야 할 그림(타는 로프, 선 발판)이 들어 있어서 그 레이어보다 높은 것만 겹친 그림으로 바꾼다. 받기 전에는 숨긴다
   */
  function showFront(stage: Stage, layer: number): void {
    const upper = layer > stage.groundLayer;
    frontSprite.visible = !upper;
    upperFrontSprite.visible = false;
    // 바닥 앞 레이어를 못 맞췄으면 같은 원점으로 받은 윗 레이어도 놓을 자리가 없다
    if (!upper || frontSprite.texture === Texture.EMPTY) return;
    if (!upperFronts.has(layer)) {
      upperFronts.set(layer, null);
      const load = townLoads;
      loadFrontStack(stage.mapId, layer, stage.calibration, stage.ladders, stage.era).then(
        (stack) => {
          if (load === townLoads) upperFronts.set(layer, stack?.texture ?? null);
          else stack?.texture.destroy(true);
        },
        () => {
          // 못 받으면 이 맵에 있는 동안 그 레이어에서는 앞 레이어 없이 그린다
        },
      );
    }
    const texture = upperFronts.get(layer);
    if (!texture) return;
    upperFrontSprite.texture = texture;
    upperFrontSprite.position.copyFrom(frontSprite.position);
    upperFrontSprite.visible = true;
  }

  function resetFront(): void {
    frontSprite.visible = true;
    upperFrontSprite.visible = false;
  }

  /** 맵 정보·전체 렌더를 받아 발판을 이미지 좌표로 맞춘다. 화면은 아직 안 바꾼다 */
  async function prepareStage(mapId: number, label: string, era: Era): Promise<Stage> {
    // 옮겨 가는 동안과 보스 맵에 가 있는 동안 지금 마을도 지우지 않는다
    keepArt('map', [mapInfoUrl(mapId, era), ...(home ? [mapInfoUrl(home.stage.mapId, home.stage.era)] : [])]);
    const [info, image] = await Promise.all([
      fetchStoredJson<MapInfo>(mapInfoUrl(mapId, era)),
      loadMapImage(mapRenderUrl(mapId, era)),
    ]);
    const footholds = Object.values(info.footholds);
    const ladders = loadLadderPages(mapId, info.ladderRopes ?? [], era).catch(() => info.ladderRopes ?? []);
    const worldGround = mainGround(footholds);
    if (!worldGround) {
      image.texture.destroy(true);
      throw new Error(`${label}: 걸을 바닥을 못 찾음`);
    }
    let calibration = readCalibration(mapId, era);
    if (!calibration?.exact) {
      const rough = calibration ?? calibrateFootholds(image.alpha, footholds);
      const exact = await Promise.race([
        exactCalibration(mapId, worldGround.layer, rough, image.pixels, era).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), EXACT_CALIBRATION_WAIT_MS)),
      ]);
      calibration = exact ?? rough;
      storeCalibration(mapId, calibration, era);
    }
    const { dx, dy } = calibration;
    const paged = await Promise.race([
      ladders,
      new Promise<LadderRope[]>((resolve) => setTimeout(() => resolve(info.ladderRopes ?? []), LADDER_PAGE_WAIT_MS)),
    ]);
    let nav: NavGraph | null = null;
    try {
      nav = buildNavGraph(footholds, paged);
    } catch (error) {
      console.warn(`[scene] ${label} 발판 길을 못 만들어 바닥만 걷는다`, error);
    }
    return {
      mapId,
      era,
      // v83 맵 정보 이름은 영문이라 클래식은 큐레이션한 한글 이름을 띄운다
      name: era === 'classic' ? label : info.name || label,
      image,
      calibration,
      nav,
      ladders: paged,
      footholds,
      mobs: info.mobs ?? [],
      groundLayer: worldGround.layer,
      ground: {
        points: worldGround.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
        minX: worldGround.minX + dx,
        maxX: worldGround.maxX + dx,
        layer: worldGround.layer,
      },
    };
  }

  /** 맵 그림·바닥·하늘을 바꾸고 앞 레이어를 받기 시작한다. 보스 맵에 가 있는 동안에도 마을 그림은 지우지 않는다 */
  function enterStage(stage: Stage, colors: Pick<Town, 'sky'>): void {
    ground = stage.ground;
    placePortals(stage);
    const previous = mapSprite.texture;
    mapSprite.texture = stage.image.texture;
    if (previous && previous !== stage.image.texture && previous !== home?.stage.image.texture) previous.destroy(true);
    setFront(null);
    const load = ++townLoads;
    // 앞 레이어는 서버가 그리는 데 오래 걸려서 마을을 먼저 보여 주고 받는 대로 덮는다. 전체 렌더에도 같은 그림이 있어 늦게 붙어도 티가 안 난다
    loadFront(stage.mapId, stage.groundLayer, stage.calibration, stage.ladders, stage.image.pixels, stage.era)
      .then((front) => {
        if (load === townLoads) setFront(front);
        else front?.texture.destroy(true);
      })
      .catch(() => {
        // 앞 레이어 없이도 마을은 그대로 돌아간다. 캐릭터가 난간 같은 것 뒤로 안 숨을 뿐이다
      });
    paintSky(colors);
  }

  let routePortals = new Map<number, RoutePortal[]>();
  let placedPortals: { close(): void }[] = [];
  let portalStage: Stage | null = null;
  let portalLoads = 0;

  /** 지금 맵에 드나드는 포털을 늘 띄운다. 캐릭터가 지나가는 포털도 이 그림이다 */
  function placePortals(stage: Stage): void {
    placedPortals.forEach((portal) => portal.close());
    placedPortals = [];
    portalStage = stage;
    const load = ++portalLoads;
    const wanted = routePortals.get(stage.mapId) ?? [];
    if (wanted.length === 0) return;
    loadPortalFrames(stage.era).then(
      (frames) => {
        if (load === portalLoads) placedPortals = wanted.map((portal) => addPortal(frames, stage, portal));
      },
      () => {
        // 포털 그림이 없어도 캐릭터는 그 자리까지 걸어가서 옮긴다
      },
    );
  }

  /** 원작 포털 애니메이션을 돌린다. 마우스를 올리거나 누르면 가는 맵 이름이 뜬다 */
  function addPortal(frames: EffectLayer, stage: Stage, portal: RoutePortal): { close(): void } {
    const x = portal.x + stage.calibration.dx;
    const node = new Container();
    const at = stage.nav && platformUnder(stage.nav, portal);
    node.position.set(x, at ? surfaceY(stage.nav!.platforms[at.platform], portal.x) + stage.calibration.dy : groundY(stage.ground, x));
    const sprite = new Sprite(frames[0].texture);
    sprite.eventMode = 'static';
    sprite.cursor = 'pointer';
    const label = new Text({
      text: portal.label,
      style: { fontFamily: FONT, fontSize: 12, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x22304a, width: 3 } },
    });
    // 이름표처럼 맵 배율로 줄이지 않고 화면 픽셀로 그려야 글자가 안 흐려진다
    label.scale.set(1 / worldScale);
    label.anchor.set(0.5, 1);
    label.y = -Math.max(...frames.map((frame) => frame.origin.y)) - 4;
    label.visible = false;
    node.addChild(sprite, label);
    const delays = frames.map((frame) => frame.delay);
    let elapsedMs = 0;
    let hovered = false;
    let labelUntilMs = 0;
    let closed = false;
    sprite.on('pointerover', () => (hovered = true));
    sprite.on('pointerout', () => (hovered = false));
    sprite.on('pointertap', () => (labelUntilMs = elapsedMs + PORTAL_LABEL_MS));
    const update = (dtMs: number) => {
      elapsedMs += dtMs;
      const frame = frames[frameAt(delays, elapsedMs, true)];
      sprite.texture = frame.texture;
      sprite.pivot.set(frame.origin.x, frame.origin.y);
      label.visible = hovered || elapsedMs < labelUntilMs;
      return !closed;
    };
    update(0);
    addEffect(node, portalLayer, update, Math.min(...delays));
    return { close: () => (closed = true) };
  }

  /** 캐릭터를 x 까지 걷게 하고 닿으면 끝난다. 화면이 멈춘 동안은 기다린다 */
  function walkTo(x: number): Promise<void> {
    behavior = { kind: 'wander', targetX: x, pauseMs: 0 };
    let walkedMs = 0;
    return new Promise((resolve) => {
      addEffect(new Container(), worldEffects, (dtMs) => {
        walkedMs += dtMs;
        if (Math.abs(hero.x - x) >= 3 && walkedMs < PORTAL_WALK_LIMIT_MS) return true;
        resolve();
        return false;
      });
    });
  }

  /** 마지막 길 따라가기가 멈춘 발판 */
  let navStoppedAt: NavPoint | null = null;
  type NavPoseAnimations = Record<Exclude<NavAction, 'walk' | 'stand'>, Animation>;
  let navAnimations: { look: string; animations: NavPoseAnimations } | null = null;
  let navMotion: {
    runner: ReturnType<typeof createNavRunner>;
    stage: Stage;
    clockMs: number;
    elapsedMs: number;
    resolve(done: boolean): void;
  } | null = null;

  let navAnimationsLoading = '';
  /** 점프·사다리·로프 동작. 못 받으면 서기·걷기 그림으로 오르내린다 */
  async function loadNavAnimations(): Promise<void> {
    const look = heroLookId();
    if (navAnimations?.look === look || navAnimationsLoading === look || heroLook.length === 0) return;
    navAnimationsLoading = look;
    try {
      const [jump, ladder, rope] = await Promise.all(
        ['jump', 'ladder', 'rope'].map((action) => loadHeroAction(heroLook, action, heroEra)),
      );
      navAnimations = { look, animations: { jump: jump.animation, ladder: ladder.animation, rope: rope.animation } };
    } finally {
      if (navAnimationsLoading === look) navAnimationsLoading = '';
    }
  }

  function stepNavMotion(dtMs: number): void {
    const motion = navMotion!;
    motion.elapsedMs += dtMs;
    // 걷기 배율은 걷는 걸음에만 들어가서 앞 프레임에 탔는지로 정해도 된다
    const pose = motion.runner.update(dtMs, riding ? RIDE_SPEED_SCALE : 1);
    hero.x = pose.x + motion.stage.calibration.dx;
    hero.y = pose.y + motion.stage.calibration.dy;
    facing = pose.facing;
    showFront(motion.stage, pose.layer);
    // 점프는 탄 채 서기 그림으로 뛴다. 점프마다 내렸다 타면 발판을 건너는 동안 계속 깜박인다
    riding = rideNow(pose.action === 'ladder' || pose.action === 'rope');
    const animations = navAnimations?.look === heroLookId() ? navAnimations.animations : null;
    if (pose.action === 'walk' || pose.action === 'stand' || riding || !animations) {
      setHeroAction(pose.action === 'stand' || (pose.action === 'jump' && riding) ? 'stand' : 'walk');
      updateHeroSprite(dtMs);
    } else {
      motion.clockMs += dtMs;
      const animation = animations[pose.action];
      hero.pivot.set(0, 0);
      showMountLayers(false);
      hero.texture = animation.frames[frameAt(animation.delays, motion.clockMs, true)];
      // 사다리·로프 그림은 등을 보이고 있어서 뒤집지 않는다
      hero.scale.x = pose.action === 'jump' ? -facing : 1;
    }
    if (pose.done || motion.elapsedMs > PORTAL_WALK_LIMIT_MS) {
      navMotion = null;
      resetFront();
      navStoppedAt = motion.runner.position;
      motion.resolve(pose.done);
    }
  }

  /** 포털에 들어가고 나오며 화면이 어두워지고 밝아지는 동안 그 자리에 세워 둔다 */
  let parkedAtPortal = false;

  /** 포털 자리에 세운다. 바닥보다 높은 레이어 발판이면 그 레이어 기준 앞 레이어로 바꾼다 */
  function parkAtPortal(stage: Stage, at: NavPoint | null): void {
    parkedAtPortal = true;
    showFront(stage, stage.nav && at ? stage.nav.platforms[at.platform].layer : stage.groundLayer);
  }

  function unpark(): void {
    parkedAtPortal = false;
    resetFront();
  }

  /** 길을 따라 움직인다. 다 가면 true, 시간이 다 되면 false */
  function runNav(stage: Stage, start: NavPoint, steps: NavStep[]): Promise<boolean> {
    return new Promise((resolve) => {
      navMotion = { runner: createNavRunner(stage.nav!, start, steps), stage, clockMs: 0, elapsedMs: 0, resolve };
    });
  }

  /** 사냥하는 바닥에서 포털까지 간다. 길을 못 찾으면 바닥에서 포털에 가장 가까운 곳까지 걷는다. 멈춘 발판을 돌려준다 */
  async function goToPortal(stage: Stage, exit: Point): Promise<NavPoint | null> {
    const { nav } = stage;
    const target = nav && platformUnder(nav, exit);
    const start = nav && { platform: nav.main, x: hero.x - stage.calibration.dx };
    const steps = nav && target && start && findPath(nav, start, target);
    if (steps && start) {
      await runNav(stage, start, steps);
      return navStoppedAt;
    }
    await walkTo(clampToGround(exit.x + stage.calibration.dx));
    return null;
  }

  /** 옮겨 간 맵의 포털 자리에 세운다. 포털이 윗층이면 그 발판 위치를 돌려준다 */
  function standAtPortal(stage: Stage, arrival: Point): NavPoint | null {
    const at = stage.nav && platformUnder(stage.nav, arrival);
    if (!at || at.platform === stage.nav!.main) {
      hero.x = clampToGround(arrival.x + stage.calibration.dx);
      hero.y = groundY(stage.ground, hero.x);
      return null;
    }
    hero.x = arrival.x + stage.calibration.dx;
    hero.y = surfaceY(stage.nav!.platforms[at.platform], arrival.x) + stage.calibration.dy;
    return at;
  }

  /** 윗층 포털에서 바닥까지 내려온다. 길이 없거나 시간이 다 되면 바닥으로 옮겨 세운다. 공중에 남지 않게 한다 */
  async function returnToGround(stage: Stage, from: NavPoint): Promise<void> {
    const nav = stage.nav!;
    const main = nav.platforms[nav.main];
    const goal = { platform: nav.main, x: Math.min(main.maxX - EDGE_MARGIN, Math.max(main.minX + EDGE_MARGIN, from.x)) };
    const steps = findPath(nav, from, goal);
    const arrived = steps ? await runNav(stage, from, steps) : false;
    if (!arrived) hero.x = clampToGround(hero.x);
    if (ground) hero.y = groundY(ground, hero.x);
    behavior = { kind: 'wander', targetX: hero.x, pauseMs: 1000 };
  }

  /** 장면이 묻는 키·리스폰 시간. 있으면 직접 조작을 켜 두려는 것이다 */
  let manualControl: ManualControl | null = null;
  let manualFocused = true;
  let blurredMs = 0;
  /** 직접 조작을 끈 뒤 바닥까지 내려가는 동안 */
  let manualReturning = false;
  let proneAnimation: { look: string; animation: Animation | null } | null = null;
  let manual: {
    stage: Stage;
    controller: Controller;
    /** 맵 몬스터 자리와 그 자리가 선 발판. 발판을 못 찾은 자리는 비워 둔다 */
    points: MapMob[];
    platforms: (Platform | null)[];
    table: ReturnType<typeof createRespawnTable>;
    mobs: Encounter[];
    /** 받는 중인 자리 */
    loading: Set<number>;
    /** 화면이 돌아간 시간. 리스폰을 이 시계로 센다 */
    clockMs: number;
    attackMs: number;
    cooldownMs: number;
    portalCooldownMs: number;
    poseAction: ControlAction;
    poseClockMs: number;
  } | null = null;

  const NO_KEYS = { left: false, right: false, up: false, down: false, jump: false, attack: false };

  function loadProne(): void {
    const look = heroLookId();
    if (proneAnimation?.look === look || heroLook.length === 0) return;
    const loading = { look, animation: null as Animation | null };
    proneAnimation = loading;
    loadHeroAction(heroLook, 'prone', heroEra).then(
      ({ animation }) => (loading.animation = animation),
      () => {
        // 엎드린 그림이 없으면 서 있는 그림으로 둔다
      },
    );
  }

  /** 맵 이동·보스전이 끝나면 켜고, 맵이 바뀌면 새 맵에서 다시 시작하고, 끄면 바닥으로 돌려보낸다 */
  function syncManual(): void {
    if (!manualControl) {
      if (manual) endManual();
      return;
    }
    if (manual && manual.stage !== portalStage) {
      clearManualMobs(manual);
      manual = null;
    }
    if (manual || traveling || bossBusy || navMotion || parkedAtPortal || manualReturning || !ground || !portalStage) return;
    beginManual(portalStage);
  }

  function beginManual(stage: Stage): void {
    // 돌던 자동 사냥 몬스터는 거둔다. 잡기 전이라 보상·사냥 시계는 그대로다
    if (encounter && !encounter.boss) {
      actors.removeChild(encounter.sprite);
      encounter.sprite.destroy();
      encounter = null;
    }
    const world = buildControlWorld(stage.footholds, stage.ladders);
    const { dx, dy } = stage.calibration;
    const points = spawnPoints(stage.mobs);
    manual = {
      stage,
      controller: createController(world, { x: hero.x - dx, y: hero.y - dy }, facing),
      points,
      platforms: points.map((point) => platformBelow(world, point, 20)),
      table: createRespawnTable(points.length),
      mobs: [],
      loading: new Set(),
      clockMs: 0,
      attackMs: 0,
      cooldownMs: 0,
      portalCooldownMs: 0,
      poseAction: 'stand',
      poseClockMs: 0,
    };
    behavior = { kind: 'wander', targetX: hero.x, pauseMs: 0 };
    void loadNavAnimations().catch(() => {});
    loadProne();
    points.forEach((_, slot) => spawnFieldMob(manual!, slot));
  }

  function clearManualMobs(state: NonNullable<typeof manual>): void {
    state.mobs.forEach((mob) => {
      actors.removeChild(mob.sprite);
      mob.sprite.destroy();
    });
    state.mobs = [];
  }

  /** 서 있던 발판에서 자동으로 이어 간다. 바닥이 아니면 길을 따라 바닥까지 내려간다 */
  function endManual(): void {
    const state = manual!;
    manual = null;
    clearManualMobs(state);
    resetFront();
    const at = state.controller.settle();
    const { stage } = state;
    const pose = state.controller.pose;
    hero.x = pose.x + stage.calibration.dx;
    hero.y = pose.y + stage.calibration.dy;
    setHeroAction('stand');
    behavior = { kind: 'wander', targetX: hero.x, pauseMs: 1000 };
    if (at && stage.nav && at.platform !== stage.nav.main && stage === portalStage) {
      manualReturning = true;
      void returnToGround(stage, at).finally(() => (manualReturning = false));
      return;
    }
    hero.x = clampToGround(hero.x);
    if (ground) hero.y = groundY(ground, hero.x);
  }

  function spawnFieldMob(state: NonNullable<typeof manual>, slot: number): void {
    const point = state.points[slot];
    const platform = state.platforms[slot];
    if (!platform || state.loading.has(slot)) return;
    state.loading.add(slot);
    loadFieldMobArt(point.id, state.stage.era)
      .then((art) => {
        if (manual !== state || !state.table.alive(slot) || state.mobs.some((mob) => mob.field?.slot === slot)) return;
        const sprite = new Sprite(art.stand.frames[0]);
        sprite.anchor.set(0.5, 1);
        sprite.alpha = 0;
        sprite.eventMode = 'none';
        actors.addChildAt(sprite, 0);
        state.mobs.push({
          spec: { id: point.id, name: art.name },
          sprite,
          animations: art.animations,
          hp: fieldMobHits(),
          clockMs: Math.random() * 1000,
          ageMs: 0,
          hitMs: 0,
          dyingMs: null,
          field: { slot, patrol: createPatrol(point, platform), platform, stand: art.stand },
        });
      })
      .catch(() => {
        // 못 받은 몬스터 자리는 다음 리스폰 때 다시 받는다
        state.table.kill(slot, state.clockMs);
      })
      .finally(() => state.loading.delete(slot));
  }

  /** 포털 앞에 서 있으면 그 포털(맵 월드 좌표) */
  function portalAt(stage: Stage, x: number, y: number): Point | null {
    const portals = routePortals.get(stage.mapId) ?? [];
    const found = portals.find((portal) => {
      const under = stage.nav && platformUnder(stage.nav, portal);
      const footY = under ? surfaceY(stage.nav!.platforms[under.platform], portal.x) : portal.y;
      return Math.abs(portal.x - x) <= MANUAL_PORTAL_REACH_X && Math.abs(footY - y) <= MANUAL_PORTAL_REACH_Y;
    });
    return found ? { x: found.x, y: found.y } : null;
  }

  function stepManual(state: NonNullable<typeof manual>, dtMs: number): void {
    const keys = manualControl?.keys() ?? NO_KEYS;
    state.attackMs = Math.max(0, state.attackMs - dtMs);
    state.cooldownMs = Math.max(0, state.cooldownMs - dtMs);
    state.portalCooldownMs = Math.max(0, state.portalCooldownMs - dtMs);
    const { stage } = state;
    const before = state.controller.pose;
    const portal = before.platform !== null ? portalAt(stage, before.x, before.y) : null;
    if (keys.up && portal && state.portalCooldownMs <= 0 && callbacks.onManualPortal) {
      state.portalCooldownMs = MANUAL_PORTAL_COOLDOWN_MS;
      callbacks.onManualPortal(portal);
    }
    // 원작처럼 땅에서 공격하는 동안은 걷지도 뛰지도 않는다. 공중에서는 날던 대로 날아간다
    const locked = state.attackMs > 0 && before.platform !== null;
    const pose = state.controller.update(dtMs, locked ? NO_KEYS : { ...keys, up: keys.up && !portal });
    if (keys.attack && state.cooldownMs <= 0 && pose.action !== 'ladder' && pose.action !== 'rope') manualAttack(state);
    hero.x = pose.x + stage.calibration.dx;
    hero.y = pose.y + stage.calibration.dy;
    facing = pose.facing;
    showFront(stage, pose.layer);

    if (state.attackMs > 0 && heroAnimations) {
      updateHeroSprite(dtMs);
      return;
    }
    const look = heroLookId();
    const climbing = pose.action === 'ladder' || pose.action === 'rope';
    const animation =
      pose.action === 'prone'
        ? (proneAnimation?.look === look ? proneAnimation.animation : null)
        : pose.action === 'jump' || climbing
          ? (navAnimations?.look === look ? navAnimations.animations[pose.action as keyof NavPoseAnimations] : null)
          : null;
    if (!animation) {
      void loadNavAnimations().catch(() => {});
      loadProne();
      setHeroAction(pose.action === 'walk' || (climbing && pose.moving) ? 'walk' : 'stand');
      updateHeroSprite(dtMs);
      return;
    }
    if (state.poseAction !== pose.action) state.poseClockMs = 0;
    state.poseAction = pose.action;
    // 탄 채 직접 조작을 켠 첫 프레임에 탈것 그림 위치가 남지 않게 한다
    hero.pivot.set(0, 0);
    showMountLayers(false);
    // 사다리·로프는 오르내릴 때만 손발이 움직인다
    if (!climbing || pose.moving) state.poseClockMs += dtMs;
    hero.texture = animation.frames[frameAt(animation.delays, state.poseClockMs, true)];
    hero.scale.x = climbing ? 1 : -facing;
  }

  /** A 키. 공격 동작 길이가 다시 쓰기까지 쉬는 시간이다. 동작 가운데쯤 앞쪽 몬스터에 대미지가 들어간다 */
  function manualAttack(state: NonNullable<typeof manual>): void {
    const duration = heroAnimations ? totalMs(heroAnimations.attack) : NO_ART_ATTACK_MS;
    state.attackMs = duration;
    state.cooldownMs = duration;
    state.poseAction = 'stand';
    if (heroAnimations) {
      heroAction = 'stand';
      setHeroAction('attack');
    }
    if (skill) playLayers(skill.effect, hero.x, hero.y, facing);
    let waitMs = duration * HIT_POINT_RATIO;
    addEffect(new Container(), worldEffects, (dtMs) => {
      waitMs -= dtMs;
      if (waitMs > 0) return true;
      if (manual === state) hitFieldMobs(state);
      return false;
    });
  }

  function hitFieldMobs(state: NonNullable<typeof manual>): void {
    const pose = state.controller.pose;
    const alive = state.mobs.filter((mob) => mob.dyingMs === null);
    const at = alive.map((mob) => ({ x: mob.field!.patrol.x, y: surfaceY(mob.field!.platform, mob.field!.patrol.x) }));
    const count = skill?.mobCount ?? DEFAULT_MOB_COUNT;
    pickTargets(pose, at, skill?.range ?? fallbackRange, count).forEach((index) => strike(alive[index], false));
  }

  function updateManualMobs(state: NonNullable<typeof manual>, dtMs: number): void {
    const frozen = !manualFocused && blurredMs > MANUAL_FREEZE_MS;
    if (!frozen) {
      state.clockMs += dtMs;
      state.table.revive(state.clockMs, manualControl?.respawnMs() ?? Infinity).forEach((slot) => spawnFieldMob(state, slot));
    }
    const { dx, dy } = state.stage.calibration;
    state.mobs = state.mobs.filter((mob) => {
      const { sprite, animations, field } = mob;
      const { patrol, platform } = field!;
      mob.clockMs += dtMs;
      mob.hitMs = Math.max(0, mob.hitMs - dtMs);
      if (mob.dyingMs !== null) {
        mob.dyingMs += dtMs;
        const index = frameAt(animations.die.delays, mob.dyingMs, false);
        if (index >= 0) sprite.texture = animations.die.frames[index];
        else sprite.alpha = Math.max(0, sprite.alpha - dtMs / 300);
        if (sprite.alpha > 0) return true;
        actors.removeChild(sprite);
        sprite.destroy();
        return false;
      }
      if (mob.hitMs > 0) {
        sprite.texture = animations.hit.frames[0];
        patrol.direction = hero.x > sprite.x ? 1 : -1;
      } else {
        if (!frozen) stepPatrol(patrol, dtMs, MOB_SPEED);
        const animation = patrol.moving && !frozen ? animations.move : field!.stand;
        sprite.texture = animation.frames[frameAt(animation.delays, mob.clockMs, true)];
      }
      sprite.alpha = Math.min(1, sprite.alpha + dtMs / 300);
      sprite.x = patrol.x + dx;
      sprite.y = surfaceY(platform, patrol.x) + dy;
      // 메이플 스프라이트는 왼쪽을 보고 그려져 있다
      sprite.scale.x = patrol.direction > 0 ? -1 : 1;
      return true;
    });
  }

  /** 직접 조작 중 움직이는 것이 있어 30fps 로 그려야 한다. 화면 밖 몬스터는 세지 않는다 */
  function manualBusy(): boolean {
    if (!manual) return false;
    const pose = manual.controller.pose;
    if (manual.attackMs > 0 || pose.moving || pose.action === 'jump' || castPose) return true;
    if (!manualFocused && blurredMs > MANUAL_FREEZE_MS) return false;
    const left = -world.position.x / worldScale - MANUAL_VIEW_SLACK;
    const top = -world.position.y / worldScale - MANUAL_VIEW_SLACK;
    const right = left + width / worldScale + MANUAL_VIEW_SLACK * 2;
    const bottom = top + height / worldScale + MANUAL_VIEW_SLACK * 2;
    return manual.mobs.some(
      (mob) =>
        mob.sprite.x >= left &&
        mob.sprite.x <= right &&
        mob.sprite.y >= top &&
        mob.sprite.y <= bottom &&
        (mob.field!.patrol.moving || mob.hitMs > 0 || mob.dyingMs !== null || mob.sprite.alpha < 1),
    );
  }

  /** 보스를 잡고 메소를 다 주운 뒤 마을로 돌아간다 */
  async function leaveBoss(): Promise<void> {
    await fadeTo(1);
    bossGauge.hide();
    if (encounter?.boss) {
      actors.removeChild(encounter.sprite);
      encounter.sprite.destroy();
      removeBossParts(encounter.boss);
      encounter = null;
    }
    if (home) {
      enterStage(home.stage, home.town);
      hero.x = seatSpot(home.stage, randomGroundX());
      hero.y = groundY(home.stage.ground, hero.x);
    }
    behavior = { kind: 'wander', targetX: randomGroundX(), pauseMs: 1000 };
    updateCamera(1);
  }

  let fadeResolve: (() => void) | null = null;
  function fadeTo(target: number): Promise<void> {
    fadeTarget = target;
    if (!running) {
      fade.alpha = target;
      return Promise.resolve();
    }
    return new Promise((resolve) => (fadeResolve = resolve));
  }

  // Pixi 티커는 콜백이 던지면 다음 프레임을 요청하지 않아서 창을 숨겼다 다시 열 때까지 화면이 멈춘다. 그 프레임만 버리고 이어 간다
  app.ticker.add((ticker) => {
    Ticker.system.update(performance.now());
    try {
      step(Math.min(ticker.deltaMS, 250));
    } catch (error) {
      console.error('[scene] 프레임 갱신 실패', error);
    }
    pace();
  });

  /** 서 있는 동안 rAF 대신 깨우는 타이머 */
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  function stopIdleTimer(): void {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = null;
  }

  function fullRate(): void {
    app.ticker.maxFPS = FULL_FPS;
    app.ticker.minFPS = fullMinFps;
  }

  /** 서 있는 동안 바로 그려야 할 일이 생기면 다음 타이머까지 기다리지 않고 rAF 로 돌린다. 그 사이 100ms 안쪽은 흘려보낸다 */
  function wake(): void {
    if (!running || app.ticker.started) return;
    stopIdleTimer();
    fullRate();
    app.ticker.start();
  }

  function stillForMs(): number {
    if (manual) return manualBusy() ? 0 : Infinity;
    if (navMotion || castPose || heroAction !== 'stand') return 0;
    if (parkedAtPortal || seated) return Infinity;
    if (behavior.kind !== 'wander') return 0;
    return Math.max(0, behavior.pauseMs);
  }

  /** 서 있을 때는 rAF 를 멈추고 타이머로 IDLE_FPS 만큼만 그린다. rAF 를 걸어 두기만 해도 WebView 가 매 화면 갱신마다 깨어난다 */
  function pace(): void {
    const loops = effects.flatMap((effect) => (effect.loopDelayMs === undefined ? [] : [effect.loopDelayMs]));
    const fps = targetFps({
      running,
      stillForMs: stillForMs(),
      fighting: encounter !== null || manualBusy(),
      fading: fade.alpha !== fadeTarget,
      cameraSettled,
      transientEffects: effects.length - loops.length,
      // 앉아 있으면 의자 프레임도 포털처럼 늘 돈다. 탄 채 서 있으면 탈것 서기 딜레이(90ms 인 것도 있다)다
      shortestLoopDelayMs: Math.min(
        ...loops,
        ...(seated && chair
          ? [chair.loopDelayMs, ...chair.sit.delays]
          : riding && mount
            ? mount.stand.delays
            : (heroAnimations?.stand.delays ?? [])),
      ),
    });
    if (fps !== IDLE_FPS) {
      if (fps === FULL_FPS && !app.ticker.started) {
        fullRate();
        app.ticker.start();
      }
      return;
    }
    app.ticker.stop();
    // 간격은 타이머가 정한다. maxFPS 가 남아 있으면 일찍 깬 프레임을 Pixi 가 건너뛰어 다음 타이머를 못 건다.
    // 타이머가 조금 늦게 깨도 Pixi 가 deltaMS 를 100ms 에서 잘라 시간이 덜 가지 않게 한다
    app.ticker.maxFPS = 0;
    app.ticker.minFPS = IDLE_FPS / 2;
    if (idleTimer !== null) return;
    const frameMs = 1000 / IDLE_FPS;
    // 늦게 깬 만큼 다음 깨는 시각이 밀리지 않게 같은 간격의 격자에 맞춘다
    let delay = frameMs - (performance.now() % frameMs);
    if (delay < frameMs / 2) delay += frameMs;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (!running) return;
      app.ticker.update(performance.now());
      // 이번 프레임을 Pixi 가 건너뛰었어도 화면이 멈춘 채로 남지 않게 한다
      if (idleTimer === null && !app.ticker.started) pace();
    }, delay);
  }

  function step(dtMs: number): void {
    castHoldMs = Math.max(0, castHoldMs - dtMs);
    blurredMs = manualFocused ? 0 : blurredMs + dtMs;
    syncManual();
    updateHero(dtMs);
    updateSeat(dtMs);
    updateEncounter(dtMs);
    if (manual) updateManualMobs(manual, dtMs);
    updateCamera(Math.min(1, dtMs / 250));
    bossGauge.update(dtMs);
    if (fade.alpha !== fadeTarget) {
      const step = dtMs / 330;
      fade.alpha = fadeTarget > fade.alpha ? Math.min(fadeTarget, fade.alpha + step) : Math.max(fadeTarget, fade.alpha - step);
    }
    if (fade.alpha === fadeTarget && fadeResolve) {
      fadeResolve();
      fadeResolve = null;
    }
    // 갱신 중에 새로 붙은 이펙트(대미지 숫자 등)도 다음 프레임부터 갱신되게 목록을 바꿔 끼운다
    const current = effects;
    effects = [];
    const alive = current.filter((effect) => {
      const keep = effect.update(dtMs);
      if (!keep) {
        effect.node.parent?.removeChild(effect.node);
        effect.node.destroy({ children: true });
      }
      return keep;
    });
    effects = alive.concat(effects);
  }

  return {
    get inEncounter() {
      return encounter !== null || encounterLoading || bossBusy || manualReturning;
    },
    async setTown(town) {
      const stage = await prepareStage(town.mapId, town.name, town.era ?? 'current');
      if (ground) await fadeTo(1);
      home = { stage, town };
      enterStage(stage, town);
      hero.x = seatSpot(stage, randomGroundX());
      hero.y = groundY(stage.ground, hero.x);
      behavior = { kind: 'wander', targetX: randomGroundX(), pauseMs: 1000 };
      updateCamera(1);
      await fadeTo(0);
      showBanner(stage.name);
    },
    setJob(job, era = 'current') {
      heroTier = job.tier;
      heroLook = job.look;
      heroEra = era;
      loadChair();
      loadMount();
      // 스킬창에서 스킬을 누르는 순간 바로 움직이게 공용 동작(alert)을 모습이 바뀔 때마다 받아 둔다
      void castMotion([]);
      fallbackRange = job.fallbackRange;
      const key = `${heroLookId()}|${job.standAction}|${job.walkAction}|${job.attackAction}|${job.skillId}`;
      if (key === lookKey && performance.now() < lookRetryAt) return;
      lookKey = key;
      lookRetryAt = Infinity;
      // 고른 스킬에 이펙트 그림이 없으면 맵에서 아무것도 안 보인 채 몬스터만 맞아서 자동 스킬로 싸운다
      const autoSkillId = job.autoSkillId ?? job.skillId;
      const skillPromise =
        job.skillId === null
          ? Promise.resolve(null)
          : loadSkill(job.skillId, job.fallbackRange, era).then((chosen) => {
              if (canDrawSkill(chosen) || autoSkillId === null || autoSkillId === chosen.id) return chosen;
              callbacks.onSkillUnusable?.(chosen.id, chosen.name);
              return loadSkill(autoSkillId, job.fallbackRange, era);
            });
      // 직업을 바꿔 스킬이 달라졌으면 앞 직업 스킬의 사거리·이펙트로 싸우지 않게 새 스킬을 받을 때까지 비워 둔다
      if (skill && skill.id !== job.skillId && skill.id !== autoSkillId) skill = null;
      // 스킬(수 MB)을 기다리지 않고 캐릭터는 받는 대로 먼저 바꾼다. 못 받은 것은 이전 것을 그대로 쓰다가 잠시 뒤 다시 받는다
      void applyEachLoaded(loadHeroAnimations(job, era), skillPromise, {
        hero(loaded) {
          if (lookKey !== key) return;
          heroAnimations = loaded.animations;
          heroClockMs = 0;
        },
        skill(loaded) {
          if (lookKey === key) skill = loaded;
        },
      }).then(([loadedHero, loadedSkill]) => {
        if (lookKey !== key) return;
        const failures = [loadedHero, loadedSkill].flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
        if (failures.length > 0 || (loadedHero.status === 'fulfilled' && loadedHero.value.still)) {
          if (failures.length > 0) console.warn('[scene] 캐릭터 그림·스킬을 못 받아 잠시 뒤 다시 받는다', ...failures);
          lookRetryAt = performance.now() + LOOK_RETRY_MS;
        }
      });
    },
    startEncounter(spec, hits) {
      if (encounter || encounterLoading || bossBusy || !ground || manualControl) return;
      encounterLoading = true;
      // 마을·사냥터 몹은 그 맵과 같은 시대 몹이다
      loadMobAnimations(spec, home?.stage.era ?? 'current')
        .then((animations) => {
          if (!ground || manualControl) return;
          const sprite = new Sprite(animations.move.frames[0]);
          sprite.anchor.set(0.5, 1);
          const side = Math.random() < 0.5 ? -1 : 1;
          const spawnDistance = framedDistance(standDistance() + 120 + Math.random() * 100, viewWidth, FRAME_MARGIN);
          sprite.x = clampToGround(hero.x + side * spawnDistance);
          sprite.y = groundY(ground, sprite.x);
          sprite.alpha = 0;
          sprite.eventMode = 'static';
          sprite.cursor = 'pointer';
          actors.addChildAt(sprite, 0);
          const created: Encounter = { spec, sprite, animations, hp: hits, clockMs: 0, ageMs: 0, hitMs: 0, dyingMs: null };
          sprite.on('pointertap', () => strike(created, true));
          encounter = created;
          behavior = { kind: 'approach' };
        })
        .catch(() => {
          // 몹 리소스를 못 받으면 이번 사냥은 건너뛰고 다음 틱에 다른 몹으로 다시 시도한다
        })
        .finally(() => {
          encounterLoading = false;
        });
    },
    async startBossFight(boss, hits, events, era = 'current') {
      if (encounter || encounterLoading || bossBusy || !ground || !home) throw new Error('지금은 보스와 싸울 수 없음');
      bossBusy = true;
      try {
        const stagePromise = prepareStage(boss.mapId, boss.name, era);
        const mob = await loadBossMob(boss.id, era, boss.parts).catch((error: unknown) => {
          stagePromise.then((stage) => stage.image.texture.destroy(true)).catch(() => {});
          throw error;
        });
        const stage = await stagePromise;
        // 게이지 그림을 못 받아도 단색 게이지로 싸운다
        const gaugePromise = loadBossGauge(boss.id, mob.gauge, era);
        const gaugeTextures = await Promise.race([
          gaugePromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), BOSS_GAUGE_WAIT_MS)),
        ]).catch(() => null);

        await fadeTo(1);
        enterStage(stage, boss);
        const { animations } = mob;
        const first = animations.stand.frames[0];
        const body = bossBodyBox([animations.stand, ...mob.parts.map((part) => part.stand)]);
        const bossStandDistance = framedDistance(
          Math.max(standDistance(), -body.left + HERO_HALF_WIDTH),
          viewWidth,
          FRAME_MARGIN,
        );
        // 보스는 바닥 가운데보다 조금 오른쪽에 서고, 캐릭터가 왼쪽에서 걸어 들어온다
        const center = (stage.ground.minX + stage.ground.maxX) / 2;
        const bossX = clampToGround(Math.min(center + 120, stage.ground.maxX - EDGE_MARGIN - Math.min(body.right, 100)));
        hero.x = clampToGround(bossX - bossStandDistance - BOSS_ENTRY_WALK);
        hero.y = groundY(stage.ground, hero.x);
        facing = 1;

        const sprite = new Sprite(first);
        showBossFrame(sprite, animations.stand, 0);
        sprite.x = bossX;
        sprite.y = groundY(stage.ground, bossX);
        sprite.eventMode = 'static';
        sprite.cursor = 'pointer';
        actors.addChildAt(sprite, 0);
        let finish = () => {};
        const finished = new Promise<void>((resolve) => (finish = resolve));
        const created: Encounter = {
          spec: boss,
          sprite,
          animations: { move: animations.stand, hit: animations.hit, die: animations.die },
          hp: hits,
          clockMs: 0,
          ageMs: 0,
          hitMs: 0,
          dyingMs: null,
          boss: {
            spec: boss,
            animations,
            maxHp: hits,
            events,
            action: 'stand',
            actionMs: 0,
            idleMs: BOSS_IDLE_MIN_MS,
            homeX: bossX,
            moveDirection: -1,
            standDistance: bossStandDistance,
            body,
            parts: [],
            finish: () => finish(),
          },
        };
        // 부위는 몸통 뒤에 둔다. 원작 자쿰도 팔이 몸통 뒤에서 나온다
        created.boss!.parts = mob.parts.map((part) => {
          const partSprite = new Sprite(part.stand.frames[0]);
          showBossFrame(partSprite, part.stand, 0);
          partSprite.position.set(bossX, sprite.y);
          partSprite.eventMode = 'static';
          partSprite.cursor = 'pointer';
          partSprite.on('pointertap', () => strike(created, true));
          actors.addChildAt(partSprite, 0);
          return { sprite: partSprite, animations: part };
        });
        sprite.on('pointertap', () => strike(created, true));
        encounter = created;
        behavior = { kind: 'approach' };
        bossGauge.show(gaugeTextures, first);
        bossGauge.setRatio(1);
        if (!gaugeTextures) {
          gaugePromise
            .then((late) => {
              if (encounter === created) bossGauge.show(late, first);
            })
            .catch(() => {});
        }
        events.onArrive();
        updateCamera(1);
        await fadeTo(0);
        showBanner(boss.name, BOSS_BANNER_Y);

        await finished;
        await leaveBoss();
        events.onReturn();
        await fadeTo(0);
        if (home) showBanner(home.stage.name);
      } finally {
        bossBusy = false;
      }
    },
    celebrate(text) {
      // main.ts 는 레벨업이면 「LEVEL UP!」, 전직이면 「N차 전직!」·「전직!」을 넘긴다
      const jobChange = text.includes('전직');
      const frames = jobChange ? basicEff.jobChanged : basicEff.levelUp;
      if (frames) playAtHero(frames, jobChange, jobChange ? 1 : levelUpScale);
      else {
        loadBasicEff();
        floatText(text, hero.x, hero.y - 90, 0xffd23f, 26);
      }
    },
    setDamageNumbers(visible) {
      damageNumbers = visible;
    },
    setLevelUpScale(scale) {
      levelUpScale = scale;
    },
    setRunning(next) {
      running = next;
      stopIdleTimer();
      fullRate();
      if (next) app.ticker.start();
      else {
        app.ticker.stop();
        fade.alpha = fadeTarget;
        fadeResolve?.();
        fadeResolve = null;
      }
    },
    setDisplayScale(scale) {
      const { view, zoom } = viewportFor(scale);
      width = view.width;
      height = view.height;
      viewWidth = width / worldScale;
      app.renderer.resize(width, height, window.devicePixelRatio * zoom);
      // autoDensity 가 캔버스 CSS 크기를 논리 크기로 되돌린다. 화면에서는 창 크기만큼 늘려 둬야
      // Pixi 가 (캔버스 픽셀 / 화면 크기) 비율로 클릭 좌표를 논리 좌표로 되돌린다
      Object.assign(app.canvas.style, { width: `${width * zoom}px`, height: `${height * zoom}px` });
      fade.clear().rect(0, 0, width, height).fill(0x000000);
      if (skyColors) paintSky(skyColors);
      bossGauge.resize(width);
      updateCamera(1);
      // 캔버스 크기를 바꾸면 그림이 지워져서 서 있는 동안에도 다음 타이머까지 기다리지 않고 바로 그린다
      wake();
    },
    setName(name) {
      const label = nameTagLabel(name);
      if (label === nameLabel) return;
      nameLabel = label;
      if (label) drawNameTag(label);
      placeNameTag();
    },
    async travel(mapId, label, exit, arrival) {
      if (encounter || encounterLoading || bossBusy || !ground || !home) throw new Error('지금은 맵을 옮길 수 없음');
      const from = home;
      // 직접 조작이면 캐릭터가 이미 포털 앞에 있어서 걸어가지 않고, 나와서도 바닥으로 내려가지 않는다
      const handDriven = manual !== null;
      const stage = await prepareStage(mapId, label, from.stage.era);
      void loadNavAnimations().catch(() => {});
      traveling = true;
      try {
        parkAtPortal(from.stage, handDriven ? from.stage.nav && platformUnder(from.stage.nav, exit) : await goToPortal(from.stage, exit));
        await fadeTo(1);
        home = { stage, town: from.town };
        enterStage(stage, from.town);
        const arrived = standAtPortal(stage, arrival);
        parkAtPortal(stage, arrived);
        behavior = { kind: 'wander', targetX: hero.x, pauseMs: 1500 };
        updateCamera(1);
        await fadeTo(0);
        showBanner(stage.name);
        unpark();
        if (handDriven) return;
        // 사냥은 바닥에서만 해서, 윗층 포털로 나왔으면 바닥까지 내려온 뒤에 끝난다
        if (arrived) await returnToGround(stage, arrived);
        // 바닥 포털로 나왔으면 포털 위가 아니라 비켜 선 자리에 앉는다
        if (chair && ground === stage.ground) {
          behavior = { kind: 'wander', targetX: seatSpot(stage, hero.x, arrived ? [] : [hero.x]), pauseMs: 0 };
        }
      } finally {
        unpark();
        traveling = false;
      }
    },
    setChair(next) {
      if (next === chairId) return;
      chairId = next;
      loadChair();
      // 의자를 내리면 쉬던 자리에서 바로 걸어 나간다
      if (next === null && !traveling && !bossBusy && behavior.kind === 'wander' && behavior.pauseMs > 0) {
        behavior = { kind: 'wander', targetX: randomGroundX(), pauseMs: 0 };
      }
    },
    setMount(next) {
      if (next === mountId) return;
      mountId = next;
      loadMount();
    },
    setManual(control) {
      manualControl = control;
      wake();
    },
    setManualFocus(focused) {
      manualFocused = focused;
    },
    nudge: () => wake(),
    setRoutePortals(portals) {
      routePortals = portals;
      if (portalStage) placePortals(portalStage);
    },
    castSkill(skillId) {
      if (!ground) return Promise.resolve<CastResult>('notReady');
      wake();
      const era = heroEra;
      const motion =
        readyMotions.get(motionKey(knownActions.get(`${era}|${skillId}`) ?? [])) ?? readyMotions.get(motionKey([])) ?? null;
      if (motion && heroAnimations) castPose = { animation: motion, clockMs: 0 };
      else castHoldMs = CAST_HOLD_MS;
      // 쓰는 동안 걸어가 버리면 이펙트만 제자리에 남는다
      const holdMs = motion ? totalMs(motion) : CAST_HOLD_MS;
      if (behavior.kind === 'wander') behavior = { kind: 'wander', targetX: hero.x, pauseMs: Math.max(behavior.pauseMs, holdMs) };
      const startedAt = performance.now();
      return loadSkill(skillId, fallbackRange, era).then(
        (cast): CastResult => {
          // 이 스킬만의 원작 동작은 다음에 쓸 때 바로 꺼내게 받아 둔다
          knownActions.set(`${era}|${skillId}`, cast.actions);
          void castMotion(cast.actions);
          if (!canDrawSkill(cast)) return 'noArt';
          if (!ground) return 'notReady';
          if (performance.now() - startedAt > CAST_EFFECT_LATE_MS) return 'late';
          playLayers(cast.effect, hero.x, hero.y, facing);
          performance.mark(`cast-effect:${skillId}`);
          return 'ok';
        },
        (error: unknown): CastResult => {
          console.warn(`[scene] 스킬 ${skillId} 를 받지 못했다`, error);
          return 'failed';
        },
      );
    },
  };
}
