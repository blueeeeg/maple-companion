import { isChairItem } from './chairs';
import type { Settings } from './settings';

/**
 * 창을 봐야 하는 일. 직업 고르기와 2차 갈래 고르기는 대화가 답을 기다리고, 2차 이상 전직은 축하 대화가 「확인」을 기다린다.
 * 레벨업·보스는 알리지 않는다. 레벨업은 초반에 몇 분마다 오고, 보스는 창이 숨어 있으면 장면 없이 정산된다.
 * 보스가 떨어뜨린 컬렉션 장비·의자는 드물어서 아이템마다 한 번 알린다
 */
export type AlertEvent =
  | { kind: 'job-choice'; characterId: string; characterName: string; level: number }
  | { kind: 'branch-choice'; characterId: string; characterName: string; level: number; instructor: string }
  | { kind: 'advancement'; characterId: string; characterName: string; tier: number; jobTitle: string }
  | { kind: 'equip-drop'; characterId: string; characterName: string; itemId: number; itemName: string; bossName: string };

export interface Alert {
  /** 같은 일을 두 번 알리지 않으려고 쓴다 */
  key: string;
  title: string;
  body: string;
}

export interface AlertView {
  /** 창이 떠 있고 화면에 보이는지 */
  shown: boolean;
  /** 창이 입력을 받고 있는지. 펫 모드는 떠 있어도 대개 다른 앱을 보고 있다 */
  focused: boolean;
}

export function describeAlert(event: AlertEvent): Alert {
  if (event.kind === 'job-choice') {
    return {
      key: `job-choice:${event.characterId}`,
      title: `${event.characterName} 전직 가능!`,
      body: `Lv.${event.level} 달성. 마이가 어떤 직업을 고를지 기다리고 있어요`,
    };
  }
  if (event.kind === 'branch-choice') {
    return {
      key: `branch-choice:${event.characterId}`,
      title: `${event.characterName} 전직 가능!`,
      body: `Lv.${event.level} 달성. ${event.instructor}에게 2차 전직 갈래를 골라 알려 주세요`,
    };
  }
  if (event.kind === 'equip-drop') {
    const chair = isChairItem(event.itemId);
    return {
      key: `equip-drop:${event.characterId}:${event.itemId}`,
      title: `${event.characterName} ${chair ? '의자' : '장비'} 획득!`,
      body: `${event.bossName} 처치 · ${event.itemName} 획득. ${chair ? '장비 창 「의자」에서 앉을 수 있어요' : '장비 창에서 입을 수 있어요'}`,
    };
  }
  return {
    key: `advancement:${event.characterId}:${event.tier}`,
    title: `${event.characterName} ${event.tier}차 전직!`,
    body: `전직 완료: ${event.jobTitle}`,
  };
}

/** 창을 보고 있으면 화면의 대화로 충분하다 */
export function shouldAlert(settings: Pick<Settings, 'jobAlerts'>, view: AlertView): boolean {
  return settings.jobAlerts && !(view.shown && view.focused);
}

/** 처음 보는 key 면 기록하고 true. 이미 알린 일이면 false */
export function firstAlert(sent: Set<string>, key: string): boolean {
  if (sent.has(key)) return false;
  sent.add(key);
  return true;
}
