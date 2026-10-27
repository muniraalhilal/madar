import type { Point } from '@madar/sim-engine';

/** WKT builders. Values are numbers we generate, but we still validate before interpolating. */
const num = (v: number) => {
  if (!Number.isFinite(v)) throw new RangeError('Non-finite coordinate');
  return String(Math.round(v * 100) / 100);
};

export const pointWkt = (p: Point) => `POINT(${num(p.x)} ${num(p.y)})`;
export const lineWkt = (pts: Point[]) => `LINESTRING(${pts.map((p) => `${num(p.x)} ${num(p.y)}`).join(', ')})`;
export function polygonWkt(pts: Point[]): string {
  const ring = [...pts, pts[0] as Point];
  return `POLYGON((${ring.map((p) => `${num(p.x)} ${num(p.y)}`).join(', ')}))`;
}
