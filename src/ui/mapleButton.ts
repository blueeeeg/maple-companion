import { wzImageUrl } from '../maple/api';
import { loadWithRetry } from './art';
import { type ThreeSlice, stripPieces, stripWidth } from './buttonArt';

/**
 * 글자 없는 원작 버튼 겉모습. 원작 범용 버튼은 모두 글자가 그림에 박혀 있어서, 글자가 없는 끝·가운데 열만 떼어
 * 가로로 늘린다(3조각). 높이는 원본 그대로라 버튼 높이를 원본 높이에 맞춰야 정수배로 선명하다
 */
export interface ButtonSkin extends ThreeSlice {
  /** UI/_Canvas 아래 버튼 노드. normal·mouseOver·pressed·disabled 상태를 모두 가진다 */
  node: string;
  height: number;
  /** styles.css .maple-button[data-tone] 의 글자색·테두리색 */
  tone: string;
}

export const BUTTON_SKINS = {
  // 보스 UI 의 83×26 버튼 묶음. 초록(확인)은 가운데가 한 색이고 회색(취소)은 잔무늬라 14칸씩 깐다
  bossGreen: { node: 'UIBoss.img/CharacterInfo/button:OK', height: 26, capLeft: 4, capRight: 4, fillX: 10, fillWidth: 1, tone: 'boss-green' },
  bossGrey: { node: 'UIBoss.img/RecruitSetting/button:cancel', height: 26, capLeft: 4, capRight: 4, fillX: 5, fillWidth: 14, tone: 'boss-grey' },
  // 연습 모드 설정의 「초기화」(58×23). 보스 입장 창과 같은 남색
  bossNavy: {
    node: 'UIBossEnter.img/main/practiceMode_wnd/practiceModeSetting_wnd/button:reset',
    height: 23,
    capLeft: 5,
    capRight: 5,
    fillX: 6,
    fillWidth: 1,
    tone: 'boss-navy',
  },
  // 스킬창 아래 버튼(하이퍼 초록·매크로 주황, 50×16). 글자가 버튼 폭을 다 차지해서 테두리 바로 안쪽 열을 늘린다
  skillGreen: { node: 'UIWindow2.img/Skill/main/BtHyper', height: 16, capLeft: 2, capRight: 2, fillX: 2, fillWidth: 1, tone: 'skill-green' },
  skillOrange: { node: 'UIWindow2.img/Skill/main/BtMacro', height: 16, capLeft: 2, capRight: 2, fillX: 2, fillWidth: 1, tone: 'skill-orange' },
  // 빅뱅 전 기본 파란 버튼(받기, 70×18)
  basicBlue: { node: 'Basic.img/BtReceive', height: 18, capLeft: 3, capRight: 3, fillX: 3, fillWidth: 1, tone: 'basic-blue' },
} as const satisfies Record<string, ButtonSkin>;

const STATES = { normal: 'normal', hover: 'mouseOver', pressed: 'pressed', disabled: 'disabled' } as const;
type StateName = keyof typeof STATES;

const skinUrl = (skin: ButtonSkin, state: StateName) => wzImageUrl(`UI/_Canvas/${skin.node}/${STATES[state]}/0`);

const strips = new Map<string, Promise<string>>();

/** 상태 그림 하나에서 글자 없는 띠(끝 + 가운데 + 끝)를 떼어 data URL 로 돌려준다 */
function strip(skin: ButtonSkin, state: StateName): Promise<string> {
  const url = skinUrl(skin, state);
  const key = `${url}#${skin.capLeft},${skin.fillX},${skin.fillWidth},${skin.capRight}`;
  let pending = strips.get(key);
  if (!pending) {
    pending = (async () => {
      await loadWithRetry(url);
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = url;
      await image.decode();
      const pieces = stripPieces(image.naturalWidth, skin);
      if (!pieces) throw new Error(`${url} 에서 띠를 뗄 수 없다`);
      const canvas = document.createElement('canvas');
      canvas.width = stripWidth(skin);
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      pieces.forEach(({ sx, dx, width }) => context.drawImage(image, sx, 0, width, image.naturalHeight, dx, 0, width, image.naturalHeight));
      return canvas.toDataURL();
    })();
    pending.catch(() => strips.delete(key));
    strips.set(key, pending);
  }
  return pending;
}

/**
 * 버튼에 원작 버튼 겉모습을 입히고 글자는 그대로 위에 얹는다. 그림을 다 떼기 전과 끝내 못 받았을 때는 원래 CSS 모양으로 남는다.
 * 다른 겉모습으로 다시 부르면 바꿔 입는다(받아 둔 띠는 다시 떼지 않는다)
 */
export function dressMapleButton(button: HTMLElement, skin: ButtonSkin): void {
  button.classList.add('maple-button');
  if (button.dataset.skin === skin.node) return;
  button.dataset.skin = skin.node;
  const names = Object.keys(STATES) as StateName[];
  Promise.all(names.map((state) => strip(skin, state))).then(
    (urls) => {
      // 그새 다른 겉모습으로 바꿨으면 늦게 온 이 그림은 버린다
      if (button.dataset.skin !== skin.node) return;
      names.forEach((state, index) => button.style.setProperty(`--mb-${state}`, `url("${urls[index]}")`));
      button.style.setProperty('--mb-cap-left', String(skin.capLeft));
      button.style.setProperty('--mb-cap-right', String(skin.capRight));
      button.dataset.tone = skin.tone;
      button.classList.add('has-skin');
    },
    () => {
      // 다음에 창을 열 때 다시 받게 한다
      if (button.dataset.skin === skin.node) delete button.dataset.skin;
    },
  );
}

/** 창을 열 때 기다리지 않게 띠를 뒤에서 떼어 둔다 */
export function prefetchButtonSkins(...skins: ButtonSkin[]): void {
  skins.forEach((skin) => (Object.keys(STATES) as StateName[]).forEach((state) => void strip(skin, state).catch(() => {})));
}
