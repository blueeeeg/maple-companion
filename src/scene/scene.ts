import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { BossSpec } from '../game/bosses';
import type { JobView } from '../game/jobs';
import type { MonsterSpec, Town } from '../game/towns';
import {
  type MapInfo,
  type MobInfo,
  characterAnimationUrl,
  characterFrameUrl,
  fetchJson,
  mapInfoUrl,
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
import { type BossAnimations, type PlacedAnimation, loadBossGauge, loadBossMob } from '../maple/bossMob';
import { type Calibration, type GroundPath, calibrateFootholds, groundY, mainGround } from '../maple/ground';
import { type Pixels, alignOverlay, frontRenderLayers } from '../maple/layers';
import { type EffectLayer, type Skill, loadSkill } from '../maple/skills';
import { type Animation, frameAt, loadAnimation, loadLayerStack, loadMapImage, loadTexture } from '../maple/textures';
import { createBossGauge } from './bossGauge';
import { type BodySpan, cameraFocus, cameraScroll, framedDistance, spanFocus } from './camera';
import { lerpColor } from './color';

// 스킬 이펙트 프레임 딜레이가 60ms 라서 15fps 로는 프레임이 빠진다
const FPS = 30;
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
/** 공격 동작의 이 지점에서 대미지가 들어간다 */
const HIT_POINT_RATIO = 0.5;
const ATTACK_COOLDOWN_MS = 300;
const HIT_LINE_HEIGHT = 30;
const HIT_LINE_STAGGER_MS = 70;
/** 대미지 숫자 대신 글자를 띄울 때 글자 가운데를 숫자 바닥선에서 올릴 거리 */
const DAMAGE_TEXT_HALF_HEIGHT = 16;
const BASIC_EFF_RETRY_MS = 30_000;
const FONT = '-apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const CALIBRATION_KEY = 'maple-companion:calibration:';
const BANNER_Y = 58;
/** 보스전에는 위쪽에 HP 게이지가 있어서 그 아래에 띄운다 */
const BOSS_BANNER_Y = 88;
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
}

export interface Scene {
  readonly inEncounter: boolean;
  /** 맵을 다 받아 와야 끝난다. 실패하면 이전 마을을 그대로 둔다 */
  setTown(town: Town): Promise<void>;
  setJob(job: JobView): void;
  /** hits: 이 몬스터를 잡는 데 드는 스킬 사용 횟수 */
  startEncounter(monster: MonsterSpec, hits: number): void;
  /**
   * 보스 맵으로 옮겨 보스와 싸우고, 잡으면 원래 마을로 돌아온다. 마을에 돌아와야 끝난다.
   * 보스나 보스 맵을 못 받아 오면 마을에 그대로 남고 실패한다. hits: 보스를 잡는 데 드는 스킬 사용 횟수
   */
  startBossFight(boss: BossSpec, hits: number, events: BossFightEvents): Promise<void>;
  celebrate(text: string): void;
  /** 설정 「데미지 숫자 표시」 */
  setDamageNumbers(visible: boolean): void;
  /** 레벨업 이펙트 배율. 전직 이펙트는 늘 원본 크기다 */
  setLevelUpScale(scale: number): void;
  setRunning(running: boolean): void;
  /** 화면 좌표는 그대로 두고, 늘려 보여 줄 배율만큼 더 촘촘하게 그려서 흐려지지 않게 한다 */
  setDisplayScale(scale: number): void;
}

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
  hitMs: number;
  dyingMs: number | null;
  /** 보스전이면 있다. 보스는 프레임마다 원작 기준점에 맞춰 그린다 */
  boss?: BossState;
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
  /** stand 첫 프레임 기준. 왼쪽을 볼 때 기준점에서 몸통 왼쪽 끝·오른쪽 끝·머리까지의 거리 */
  body: { left: number; right: number; top: number; height: number };
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
}

type Behavior =
  | { kind: 'wander'; targetX: number; pauseMs: number }
  | { kind: 'approach' }
  | { kind: 'fight'; cooldownMs: number };

interface Effect {
  node: Container;
  update(dtMs: number): boolean;
}

function readCalibration(mapId: number): Calibration | null {
  try {
    const text = localStorage.getItem(CALIBRATION_KEY + mapId);
    return text ? (JSON.parse(text) as Calibration) : null;
  } catch {
    return null;
  }
}

function storeCalibration(mapId: number, calibration: Calibration): void {
  try {
    localStorage.setItem(CALIBRATION_KEY + mapId, JSON.stringify(calibration));
  } catch {
    // 다음 실행에서 다시 계산한다
  }
}

function mobAction(framebooks: Record<string, number>): string {
  if (framebooks.move) return 'move';
  if (framebooks.fly) return 'fly';
  return 'stand';
}

async function loadMobAnimations(spec: MonsterSpec): Promise<MobAnimations> {
  const { framebooks } = await fetchJson<MobInfo>(mobInfoUrl(spec.id));
  const idle = mobAction(framebooks);
  const load = (action: string) => loadAnimation(mobAnimationUrl(spec.id, action), (frame) => mobFrameUrl(spec.id, action, frame));
  const [move, hit, die] = await Promise.all([
    load(idle),
    load(framebooks.hit1 ? 'hit1' : idle),
    load(framebooks.die1 ? 'die1' : idle),
  ]);
  return { move, hit, die };
}

async function loadHeroAnimations(job: JobView): Promise<HeroAnimations> {
  const load = (action: string) =>
    loadAnimation(characterAnimationUrl(job.look, action), (frame) => characterFrameUrl(job.look, action, frame));
  const [stand, walk, attack] = await Promise.all([load('stand1'), load('walk1'), load(job.attackAction)]);
  return { stand, walk, attack };
}

const totalMs = (animation: Animation) => animation.delays.reduce((sum, delay) => sum + delay, 0);

/**
 * 캐릭터보다 높은 레이어의 타일·오브젝트만 따로 받아 한 장으로 겹친다. 전체 렌더에도 같은 그림이 맨 위에 있으니
 * 픽셀을 맞대어 전체 렌더 위의 정확한 위치를 찾는다. 가릴 것이 없거나 위치를 못 맞추면 null
 */
async function loadFront(
  mapId: number,
  groundLayer: number,
  calibration: Calibration,
  base: Pixels,
): Promise<{ texture: Texture; x: number; y: number } | null> {
  const minX = Math.round(-calibration.dx) - FRONT_SEARCH;
  const minY = Math.round(-calibration.dy) - FRONT_SEARCH;
  const stack = await loadLayerStack(
    frontRenderLayers(groundLayer).map((layer) => mapLayerRenderUrl(mapId, layer, minX, minY)),
  );
  if (!stack) return null;
  const at = alignOverlay(base, stack.pixels, { x: -FRONT_SEARCH, y: -FRONT_SEARCH }, FRONT_SEARCH);
  if (!at) {
    stack.texture.destroy(true);
    return null;
  }
  return { texture: stack.texture, ...at };
}

export async function createScene(host: HTMLElement, callbacks: SceneCallbacks): Promise<Scene> {
  const width = host.clientWidth;
  const height = host.clientHeight;

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
  app.ticker.maxFPS = FPS;
  host.appendChild(app.canvas);

  const sky = new Graphics();
  const world = new Container();
  const mapSprite = new Sprite();
  const actors = new Container();
  const frontSprite = new Sprite();
  // 몬스터를 누르는 입력이 앞 레이어에 막히지 않게 한다
  frontSprite.eventMode = 'none';
  const worldEffects = new Container();
  world.addChild(mapSprite, actors, frontSprite, worldEffects);
  const overlay = new Container();
  const fade = new Graphics().rect(0, 0, width, height).fill(0x000000);
  app.stage.addChild(sky, world, overlay, fade);
  const bossGauge = createBossGauge(width);
  overlay.addChild(bossGauge.node);

  const hero = new Sprite();
  hero.anchor.set(0.5);
  actors.addChild(hero);

  let ground: GroundPath | null = null;
  let heroAnimations: HeroAnimations | null = null;
  let skill: Skill | null = null;
  let fallbackRange = 60;
  let heroTier = 0;
  let lookKey = '';
  let heroAction: HeroAction = 'stand';
  let heroClockMs = 0;
  let facing: -1 | 1 = -1;
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
  const viewWidth = width / worldScale;
  let cameraX = 0;
  let cameraY = 0;

  world.scale.set(worldScale);

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

  function addEffect(node: Container, layer: Container, update: (dtMs: number) => boolean): void {
    layer.addChild(node);
    effects.push({ node, update });
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

  function paintSky(town: Pick<Town, 'sky'>): void {
    sky.clear();
    const bands = 12;
    const bandHeight = Math.ceil(height / bands);
    for (let band = 0; band < bands; band += 1) {
      sky.rect(0, band * bandHeight, width, bandHeight + 1).fill(lerpColor(town.sky[0], town.sky[1], band / (bands - 1)));
    }
  }

  function dropMeso(amount: number, x: number, y: number): void {
    if (!ground || amount <= 0) return;
    const coin = new Sprite();
    coin.anchor.set(0.5, 1);
    coin.position.set(x, y);
    const floor = groundY(ground, x);
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

  function updateHeroSprite(dtMs: number): void {
    if (!heroAnimations) return;
    heroClockMs += dtMs;
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
      else dropMeso(callbacks.onKill(target.spec), target.sprite.x, target.sprite.y - 10);
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
      const index = frameAt(animations.die.delays, current.dyingMs, false);
      if (index >= 0) {
        showBossFrame(sprite, animations.die, index);
        return;
      }
      sprite.alpha = Math.max(0, sprite.alpha - dtMs / BOSS_DEATH_FADE_MS);
      if (sprite.alpha > 0) return;
      actors.removeChild(sprite);
      sprite.destroy();
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
    const faceHero = () => (sprite.scale.x = hero.x > sprite.x ? -1 : 1);
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
  }

  function startAttack(target: Encounter): void {
    if (!heroAnimations) return;
    setHeroAction('attack');
    if (skill) playLayers(skill.effect, hero.x, hero.y, facing);
    let waitMs = totalMs(heroAnimations.attack) * HIT_POINT_RATIO;
    addEffect(new Container(), worldEffects, (dtMs) => {
      waitMs -= dtMs;
      if (waitMs > 0) return true;
      strike(target, false);
      return false;
    });
  }

  function updateHero(dtMs: number): void {
    if (!ground) return;
    const moveToward = (targetX: number): boolean => {
      const distance = targetX - hero.x;
      if (Math.abs(distance) < 3) return true;
      facing = distance > 0 ? 1 : -1;
      hero.x += facing * Math.min(Math.abs(distance), (WALK_SPEED * dtMs) / 1000);
      setHeroAction('walk');
      return false;
    };

    if (behavior.kind === 'wander') {
      if (behavior.pauseMs > 0) {
        behavior.pauseMs -= dtMs;
        if (heroAction !== 'attack') setHeroAction('stand');
      } else if (moveToward(behavior.targetX)) {
        behavior = { kind: 'wander', targetX: randomGroundX(), pauseMs: 1500 + Math.random() * 3000 };
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
          behavior.cooldownMs = ATTACK_COOLDOWN_MS;
        }
      }
    }
    hero.y = groundY(ground, hero.x);
    updateHeroSprite(dtMs);
  }

  function updateEncounter(dtMs: number): void {
    if (!encounter || !ground) return;
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
  }

  function setFront(front: { texture: Texture; x: number; y: number } | null): void {
    const previous = frontSprite.texture;
    frontSprite.texture = front?.texture ?? Texture.EMPTY;
    frontSprite.position.set(front?.x ?? 0, front?.y ?? 0);
    if (previous !== Texture.EMPTY && previous !== frontSprite.texture) previous.destroy(true);
  }

  /** 맵 정보·전체 렌더를 받아 발판을 이미지 좌표로 맞춘다. 화면은 아직 안 바꾼다 */
  async function prepareStage(mapId: number, label: string): Promise<Stage> {
    const [info, image] = await Promise.all([fetchJson<MapInfo>(mapInfoUrl(mapId)), loadMapImage(mapRenderUrl(mapId))]);
    const footholds = Object.values(info.footholds);
    let calibration = readCalibration(mapId);
    if (!calibration) {
      calibration = calibrateFootholds(image.alpha, footholds);
      storeCalibration(mapId, calibration);
    }
    const worldGround = mainGround(footholds);
    if (!worldGround) {
      image.texture.destroy(true);
      throw new Error(`${label}: 걸을 바닥을 못 찾음`);
    }
    const { dx, dy } = calibration;
    return {
      mapId,
      name: info.name || label,
      image,
      calibration,
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
    const previous = mapSprite.texture;
    mapSprite.texture = stage.image.texture;
    if (previous && previous !== stage.image.texture && previous !== home?.stage.image.texture) previous.destroy(true);
    setFront(null);
    const load = ++townLoads;
    // 앞 레이어는 서버가 그리는 데 오래 걸려서 마을을 먼저 보여 주고 받는 대로 덮는다. 전체 렌더에도 같은 그림이 있어 늦게 붙어도 티가 안 난다
    loadFront(stage.mapId, stage.groundLayer, stage.calibration, stage.image.pixels)
      .then((front) => {
        if (load === townLoads) setFront(front);
        else front?.texture.destroy(true);
      })
      .catch(() => {
        // 앞 레이어 없이도 마을은 그대로 돌아간다. 캐릭터가 난간 같은 것 뒤로 안 숨을 뿐이다
      });
    paintSky(colors);
  }

  /** 보스를 잡고 메소를 다 주운 뒤 마을로 돌아간다 */
  async function leaveBoss(): Promise<void> {
    await fadeTo(1);
    bossGauge.hide();
    if (encounter?.boss) {
      actors.removeChild(encounter.sprite);
      encounter.sprite.destroy();
      encounter = null;
    }
    if (home) {
      enterStage(home.stage, home.town);
      hero.x = randomGroundX();
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

  app.ticker.add((ticker) => {
    const dtMs = Math.min(ticker.deltaMS, 250);
    updateHero(dtMs);
    updateEncounter(dtMs);
    updateCamera(Math.min(1, dtMs / 250));
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
  });

  return {
    get inEncounter() {
      return encounter !== null || encounterLoading || bossBusy;
    },
    async setTown(town) {
      const stage = await prepareStage(town.mapId, town.name);
      if (ground) await fadeTo(1);
      home = { stage, town };
      enterStage(stage, town);
      hero.x = randomGroundX();
      hero.y = groundY(stage.ground, hero.x);
      behavior = { kind: 'wander', targetX: randomGroundX(), pauseMs: 1000 };
      updateCamera(1);
      await fadeTo(0);
      showBanner(stage.name);
    },
    setJob(job) {
      heroTier = job.tier;
      fallbackRange = job.fallbackRange;
      const key = `${job.look.join(',')}|${job.attackAction}|${job.skillId}`;
      if (key === lookKey) return;
      lookKey = key;
      const skillPromise = job.skillId === null ? Promise.resolve(null) : loadSkill(job.skillId, job.fallbackRange);
      Promise.all([loadHeroAnimations(job), skillPromise])
        .then(([animations, loadedSkill]) => {
          if (lookKey !== key) return;
          heroAnimations = animations;
          skill = loadedSkill;
          heroClockMs = 0;
        })
        .catch(() => {
          // 다음 setJob 에서 다시 받는다
          if (lookKey === key) lookKey = '';
        });
    },
    startEncounter(spec, hits) {
      if (encounter || encounterLoading || bossBusy || !ground) return;
      encounterLoading = true;
      loadMobAnimations(spec)
        .then((animations) => {
          if (!ground) return;
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
          const created: Encounter = { spec, sprite, animations, hp: hits, clockMs: 0, hitMs: 0, dyingMs: null };
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
    async startBossFight(boss, hits, events) {
      if (encounter || encounterLoading || bossBusy || !ground || !home) throw new Error('지금은 보스와 싸울 수 없음');
      bossBusy = true;
      try {
        const stagePromise = prepareStage(boss.mapId, boss.name);
        const mob = await loadBossMob(boss.id).catch((error: unknown) => {
          stagePromise.then((stage) => stage.image.texture.destroy(true)).catch(() => {});
          throw error;
        });
        const stage = await stagePromise;
        // 게이지 그림을 못 받아도 단색 게이지로 싸운다
        const gaugeTextures = await loadBossGauge(boss.id, mob.gauge).catch(() => null);

        await fadeTo(1);
        enterStage(stage, boss);
        const { animations } = mob;
        const first = animations.stand.frames[0];
        const origin = animations.stand.origins[0];
        const body = { left: -origin.x, right: first.width - origin.x, top: origin.y, height: first.height };
        const bossStandDistance = framedDistance(
          Math.max(standDistance(), origin.x + HERO_HALF_WIDTH),
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
            finish: () => finish(),
          },
        };
        sprite.on('pointertap', () => strike(created, true));
        encounter = created;
        behavior = { kind: 'approach' };
        bossGauge.show(gaugeTextures, first);
        bossGauge.setRatio(1);
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
      if (next) app.ticker.start();
      else {
        app.ticker.stop();
        fade.alpha = fadeTarget;
        fadeResolve?.();
        fadeResolve = null;
      }
    },
    setDisplayScale(scale) {
      app.renderer.resize(width, height, window.devicePixelRatio * scale);
      // autoDensity 가 캔버스 CSS 크기를 논리 크기로 되돌린다. 화면에서는 창 크기만큼 늘려 둬야
      // Pixi 가 (캔버스 픽셀 / 화면 크기) 비율로 클릭 좌표를 논리 좌표로 되돌린다
      Object.assign(app.canvas.style, { width: `${width * scale}px`, height: `${height * scale}px` });
      updateCamera(1);
    },
  };
}
