/** 처음 방에 들어와 현재 접속자를 받는 동안은 알리지 않는다 */
export const SETTLE_MS = 2000;
/** 나갔다가 이 안에 다시 들어오면 둘 다 알리지 않는다(연결이 깜빡인 것) */
export const LEAVE_DELAY_MS = 5000;

const NOBODY = '모험가';

/** 방 접속자 목록의 변화를 「들어왔어요/나갔어요」 한 줄로 바꾼다. 나는 알리지 않는다. 들어온 줄이면 joined 에 그 이름이 온다 */
export function createPresenceNotices(notify: (text: string, joined: string | null) => void, selfId: () => string | null) {
  let known: Map<string, string> | null = null;
  let settledAt = 0;
  const leaving = new Map<string, ReturnType<typeof setTimeout>>();

  function reset(): void {
    leaving.forEach((timer) => clearTimeout(timer));
    leaving.clear();
    known = null;
  }

  return {
    reset,
    update(members: Map<string, string>): void {
      const others = new Map([...members].filter(([id]) => id !== selfId()));
      if (known === null) {
        known = others;
        settledAt = Date.now() + SETTLE_MS;
        return;
      }
      const quiet = Date.now() < settledAt;
      others.forEach((name, id) => {
        const timer = leaving.get(id);
        if (timer !== undefined) {
          clearTimeout(timer);
          leaving.delete(id);
        } else if (!known!.has(id) && !quiet) notify(`${name || NOBODY}님이 들어왔어요`, name || NOBODY);
      });
      known.forEach((name, id) => {
        if (others.has(id) || leaving.has(id)) return;
        if (quiet) return;
        leaving.set(
          id,
          setTimeout(() => {
            leaving.delete(id);
            notify(`${name || NOBODY}님이 나갔어요`, null);
          }, LEAVE_DELAY_MS),
        );
      });
      known = others;
    },
  };
}
