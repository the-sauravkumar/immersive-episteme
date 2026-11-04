import * as THREE from "three";

const WELD_METRES = 1e-5;
const SAME_NORMAL_COSINE = 0.999;
const PHONG_SHAPE = 0.75;
const LEAST_CURVED_COSINE = 0.906;

export function phongTessellate(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = source.index ? source : source.toNonIndexed();
  const position = geometry.attributes.position!;
  const normal = geometry.attributes.normal!;
  const uv = geometry.attributes.uv!;
  const index = geometry.index;
  const indexAt = (i: number) => (index ? index.getX(i) : i);
  const count = index ? index.count : position.count;
  const weldIds = new Map<string, number>();
  const welded = new Int32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) / WELD_METRES)},${Math.round(position.getY(i) / WELD_METRES)},${Math.round(position.getZ(i) / WELD_METRES)}`;
    let id = weldIds.get(key);
    if (id === undefined) {
      id = weldIds.size;
      weldIds.set(key, id);
    }
    welded[i] = id;
  }
  const na = new THREE.Vector3();
  const nb = new THREE.Vector3();
  const pairKey = (p: number, q: number) => (p < q ? p * 67108864 + q : q * 67108864 + p);
  const firstNormals = new Map<number, [number, number]>();
  const hardEdges = new Set<number>();
  const sameNormal = (p: number, q: number) => {
    na.fromBufferAttribute(normal, p);
    nb.fromBufferAttribute(normal, q);
    return na.dot(nb) >= SAME_NORMAL_COSINE;
  };
  for (let t = 0; t + 2 < count; t += 3) {
    const corners = [indexAt(t), indexAt(t + 1), indexAt(t + 2)];
    for (let e = 0; e < 3; e++) {
      const p = corners[e]!;
      const q = corners[(e + 1) % 3]!;
      const key = pairKey(welded[p]!, welded[q]!);
      const known = firstNormals.get(key);
      if (!known) firstNormals.set(key, welded[p]! < welded[q]! ? [p, q] : [q, p]);
      else {
        const [low, high] = welded[p]! < welded[q]! ? [p, q] : [q, p];
        if (!sameNormal(known[0], low) || !sameNormal(known[1], high)) hardEdges.add(key);
      }
    }
  }
  const positions: number[] = Array.from(position.array as Float32Array);
  const normals: number[] = Array.from(normal.array as Float32Array);
  const uvs: number[] = Array.from(uv.array as Float32Array);
  const middles = new Map<number, number>();
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const middle = new THREE.Vector3();
  const towardA = new THREE.Vector3();
  const towardB = new THREE.Vector3();
  const middleOf = (p: number, q: number): number => {
    const key = pairKey(p, q);
    const known = middles.get(key);
    if (known !== undefined) return known;
    pa.fromBufferAttribute(position, p);
    pb.fromBufferAttribute(position, q);
    na.fromBufferAttribute(normal, p);
    nb.fromBufferAttribute(normal, q);
    middle.addVectors(pa, pb).multiplyScalar(0.5);
    if (!hardEdges.has(pairKey(welded[p]!, welded[q]!)) && na.dot(nb) > LEAST_CURVED_COSINE) {
      const heightA = towardA.subVectors(middle, pa).dot(na);
      const heightB = towardB.subVectors(middle, pb).dot(nb);
      towardA.copy(middle).addScaledVector(na, -heightA);
      towardB.copy(middle).addScaledVector(nb, -heightB);
      middle.lerp(towardA.add(towardB).multiplyScalar(0.5), PHONG_SHAPE);
    }
    const added = positions.length / 3;
    positions.push(middle.x, middle.y, middle.z);
    const blended = na.add(nb).normalize();
    normals.push(blended.x, blended.y, blended.z);
    uvs.push((uv.getX(p) + uv.getX(q)) / 2, (uv.getY(p) + uv.getY(q)) / 2);
    middles.set(key, added);
    return added;
  };
  const indices: number[] = [];
  for (let t = 0; t + 2 < count; t += 3) {
    const a = indexAt(t);
    const b = indexAt(t + 1);
    const c = indexAt(t + 2);
    const ab = middleOf(a, b);
    const bc = middleOf(b, c);
    const ca = middleOf(c, a);
    indices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const refined = new THREE.BufferGeometry();
  refined.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  refined.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  refined.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  refined.setIndex(indices);
  return refined;
}
