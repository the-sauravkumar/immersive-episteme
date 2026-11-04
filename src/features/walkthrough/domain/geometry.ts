export type Vec3 = readonly [number, number, number];

export interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
}

export const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export const cosineFall = (t: number): number => 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

function centripetalPoint(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: number): Vec3 {
  const knot = (a: Vec3, b: Vec3, previous: number) => previous + Math.max(1e-4, Math.sqrt(length(sub(b, a))));
  const t0 = 0;
  const t1 = knot(p0, p1, t0);
  const t2 = knot(p1, p2, t1);
  const t3 = knot(p2, p3, t2);
  const t = t1 + (t2 - t1) * u;
  const lerp = (a: Vec3, b: Vec3, ta: number, tb: number): Vec3 => {
    const k = (t - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

export function samplePath(points: readonly Vec3[], step: number): Vec3[] {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const padded: Vec3[] = [
    [first[0] * 2 - points[1]![0], first[1] * 2 - points[1]![1], first[2] * 2 - points[1]![2]],
    ...points,
    [last[0] * 2 - points[points.length - 2]![0], last[1] * 2 - points[points.length - 2]![1], last[2] * 2 - points[points.length - 2]![2]],
  ];
  const dense: Vec3[] = [];
  for (let i = 1; i < padded.length - 2; i++) {
    for (let j = 0; j < 24; j++) dense.push(centripetalPoint(padded[i - 1]!, padded[i]!, padded[i + 1]!, padded[i + 2]!, j / 24));
  }
  dense.push(last);
  const out: Vec3[] = [dense[0]!];
  let carried = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1]!;
    const b = dense[i]!;
    const d = length(sub(b, a));
    let walked = step - carried;
    while (walked <= d) {
      const k = walked / d;
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
      walked += step;
    }
    carried = d - (walked - step);
  }
  out.push(last);
  return out;
}

export function boxesOverlapDepth(a: Box, b: Box): number {
  const depths = [0, 1, 2].map((axis) => Math.min(a.max[axis]!, b.max[axis]!) - Math.max(a.min[axis]!, b.min[axis]!));
  return Math.min(...depths);
}

export function insideDepth(box: Box, p: Vec3): number {
  return Math.min(p[0] - box.min[0], box.max[0] - p[0], p[1] - box.min[1], box.max[1] - p[1], p[2] - box.min[2], box.max[2] - p[2]);
}
