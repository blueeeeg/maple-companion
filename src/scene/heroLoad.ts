/**
 * 캐릭터 그림과 사냥 스킬을 받는 대로 따로 건다. 스킬은 수백 KB~수 MB 라 둘을 같이 기다리면, 직업을 바꾼 뒤 새 스킬을 받는 동안
 * 캐릭터가 앞 직업 무기·동작으로 남는다. 둘 다 끝나면 결과를 돌려 다시 받을지 정하게 한다
 */
export function applyEachLoaded<H, S>(
  hero: Promise<H>,
  skill: Promise<S>,
  apply: { hero(value: H): void; skill(value: S): void },
): Promise<[PromiseSettledResult<H>, PromiseSettledResult<S>]> {
  return Promise.allSettled([
    hero.then((value) => {
      apply.hero(value);
      return value;
    }),
    skill.then((value) => {
      apply.skill(value);
      return value;
    }),
  ]);
}
