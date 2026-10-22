function channels(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

export function lerpColor(from: number, to: number, t: number): number {
  const [r1, g1, b1] = channels(from);
  const [r2, g2, b2] = channels(to);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return (mix(r1, r2) << 16) | (mix(g1, g2) << 8) | mix(b1, b2);
}
