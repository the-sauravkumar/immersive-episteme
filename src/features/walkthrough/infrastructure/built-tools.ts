import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { roundSegments } from "../domain/surface-density";
import { creasedNormals } from "./creased-normals";
import type { MaterialLibrary } from "./material-library";
import { projectedMaterial, restOnBench, setTones, solidMesh } from "./built-materials";

const TURNED_PROFILE_POINTS = 64;

const BLOCK_WOOD = { key: "block timber", scan: "table", hex: "#4A2C20", tileMetres: 0.28, contrast: 0.8, leastRough: 0.46, normalScale: 0.45, specular: 0.5 } as const;
const BLOCK_FACE = { key: "dyed block face", scan: "table", hex: "#2E2622", contrast: 0.55, leastRough: 0.5, normalScale: 0.8, specular: 0.4 } as const;
const BLOCK_HANDLE = { key: "block handle", scan: "table", hex: "#A98549", tileMetres: 0.24, contrast: 0.45, leastRough: 0.55, normalScale: 0.35, specular: 0.4, toned: true, realFacets: true } as const;
const PADDLE_WOOD = { key: "paddle timber", scan: "table", hex: "#7A5C42", tileMetres: 0.34, contrast: 0.85, leastRough: 0.5, normalScale: 0.6, specular: 0.4, toned: true } as const;
const FORGED_STEEL = { key: "forged steel", scan: "steel", hex: "#3B3936", contrast: 0.6, leastRough: 0.5, normalScale: 0.5, specular: 1, metalness: 0.82, rubbedShare: 0.6, rubbedHex: "#8C8A85" } as const;
const KALAM_BAMBOO = { key: "kalam bamboo", scan: "bamboo", hex: "#96845E", tileMetres: 0.16, contrast: 0.85, leastRough: 0.62, normalScale: 1.2, specular: 0.4, toned: true } as const;
const KALAM_WRAP = { key: "kalam wool wrap", scan: "weave", hex: "#2A2C2A", tileMetres: 0.035, contrast: 0.7, leastRough: 0.88, normalScale: 2.4, specular: 0.14 } as const;
const BRUSH_FIBRE = { key: "palm fibre", scan: "bamboo", hex: "#7B5C3A", tileMetres: 0.18, contrast: 0.6, leastRough: 0.62, normalScale: 0.8, specular: 0.4, openWork: true } as const;
const BRUSH_CORD = { key: "brush cord", scan: "weave", hex: "#6F5A3D", tileMetres: 0.06, contrast: 0.55, leastRough: 0.72, normalScale: 1.5, specular: 0.25 } as const;
const BRUSH_STUB = { key: "brush bamboo", scan: "bamboo", hex: "#96845E", tileMetres: 0.16, contrast: 0.85, leastRough: 0.62, normalScale: 1.2, specular: 0.4 } as const;

function turnedGeometry(profile: readonly (readonly [number, number])[]): THREE.BufferGeometry {
  const smoothed = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(TURNED_PROFILE_POINTS).map((point) => new THREE.Vector2(Math.max(1e-4, point.x), point.y));
  return new THREE.LatheGeometry(smoothed, Math.max(...profile.map(([r]) => roundSegments(r))));
}

function loftedPaddle(): THREE.BufferGeometry {
  const sections = 96;
  const around = 44;
  const length = 0.62;
  const widthAt = (z: number) => {
    if (z < 0.014) return 0.11 * Math.sqrt(1 - (1 - z / 0.014) ** 2) ** 0.7 + 0.001;
    if (z < 0.3) return 0.11 - 0.006 * (z / 0.3);
    if (z < 0.35) return THREE.MathUtils.lerp(0.104, 0.033, THREE.MathUtils.smoothstep(z, 0.3, 0.35));
    if (z < 0.6) return 0.033 + 0.004 * ((z - 0.35) / 0.25);
    return 0.037 * Math.sqrt(Math.max(0, 1 - ((z - 0.6) / 0.02) ** 2)) + 0.001;
  };
  const thicknessAt = (z: number) => {
    if (z < 0.014) return 0.012 * Math.sqrt(1 - (1 - z / 0.014) ** 2) + 0.001;
    if (z < 0.3) return 0.012 + 0.012 * (z / 0.3);
    if (z < 0.35) return THREE.MathUtils.lerp(0.024, 0.03, THREE.MathUtils.smoothstep(z, 0.3, 0.35));
    if (z < 0.6) return 0.03;
    return 0.03 * Math.sqrt(Math.max(0, 1 - ((z - 0.6) / 0.02) ** 2)) + 0.001;
  };
  const stationAt = (section: number) => {
    const share = section / sections;
    const ends = 0.1;
    if (share < ends) return 0.014 * (share / ends) ** 2;
    if (share > 1 - ends) return length - 0.02 * ((1 - share) / ends) ** 2;
    return THREE.MathUtils.lerp(0.014, length - 0.02, (share - ends) / (1 - 2 * ends));
  };
  const positions = new Float32Array((sections + 1) * around * 3);
  const squareness = (z: number) => THREE.MathUtils.lerp(0.42, 1, THREE.MathUtils.smoothstep(z, 0.3, 0.35));
  for (let section = 0; section <= sections; section++) {
    const z = stationAt(section);
    const halfWidth = widthAt(z) / 2;
    const halfThick = thicknessAt(z) / 2;
    const power = squareness(z);
    for (let step = 0; step < around; step++) {
      const phi = (step / around) * Math.PI * 2;
      const cos = Math.cos(phi);
      const sin = Math.sin(phi);
      const wander = 1 + 0.012 * Math.sin(z * 31 + step * 0.4) * (z < 0.3 ? 1 : 0.3);
      positions.set([Math.sign(cos) * Math.abs(cos) ** power * halfWidth * wander, 0.015 + Math.sign(sin) * Math.abs(sin) ** power * halfThick, z], (section * around + step) * 3);
    }
  }
  const indices: number[] = [];
  for (let section = 0; section < sections; section++) {
    for (let step = 0; step < around; step++) {
      const next = (step + 1) % around;
      const a = section * around + step;
      const b = (section + 1) * around + step;
      const c = section * around + next;
      const d = (section + 1) * around + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  setTones(geometry, (_x, _y, z) => (z < 0.3 ? 0.62 + 0.38 * THREE.MathUtils.smoothstep(z, 0.02, 0.3) : 1 + 0.14 * THREE.MathUtils.smoothstep(z, 0.42, 0.56)));
  geometry.translate(0, 0, -length / 2);
  return geometry.rotateY(Math.PI / 2);
}

export async function buildWashingPaddle(library: MaterialLibrary): Promise<THREE.Object3D> {
  const [geometry, wood] = await Promise.all([library.shared("tool:paddle", async () => loftedPaddle()), projectedMaterial(library, PADDLE_WOOD)]);
  const paddle = solidMesh(geometry, wood);
  paddle.rotation.y = -Math.PI / 2;
  return paddle;
}

const ROD_LENGTHS = [0.165, 0.19, 0.215] as const;
const ROD_COUNT = 15;
const ROD_FAN_RADIUS = 0.21;
const ROD_FAN_STEP = 0.046;
const ROD_END_RADIUS = 0.0043;

function chiselRod(length: number, flatTip: boolean): THREE.BufferGeometry {
  const geometry = turnedGeometry([[0.0001, 0], [0.0036, 0.0007], [ROD_END_RADIUS, 0.003], [0.0035, 0.0065], [0.0031, 0.014], [0.0032, length * 0.55], [0.0029, length * 0.78], [0.0013, length - 0.006], [0.0003, length]]);
  if (flatTip) {
    const position = geometry.attributes.position!;
    for (let i = 0; i < position.count; i++) {
      const toTip = THREE.MathUtils.smoothstep(position.getY(i), length * 0.72, length);
      position.setX(i, position.getX(i) * (1 + 0.75 * toTip));
      position.setZ(i, position.getZ(i) * (1 - 0.68 * toTip));
    }
    geometry.computeVertexNormals();
  }
  return geometry;
}

export async function buildCarvingChisels(library: MaterialLibrary): Promise<THREE.Object3D> {
  const steel = await projectedMaterial(library, FORGED_STEEL);
  const group = new THREE.Group();
  const holder = new THREE.Object3D();
  holder.rotation.order = "YXZ";
  for (const [variant, length] of ROD_LENGTHS.entries()) {
    const geometry = await library.shared(`tool:rod:${variant}`, async () => chiselRod(length, variant !== 1));
    const own = Array.from({ length: ROD_COUNT }, (_, i) => i).filter((i) => (i * 7 + 2) % 3 === variant);
    const rods = new THREE.InstancedMesh(geometry, steel, own.length);
    own.forEach((rod, i) => {
      const yaw = (rod - (ROD_COUNT - 1) / 2) * ROD_FAN_STEP;
      const pullBack = 0.004 * ((rod * 5) % 4);
      holder.position.set(Math.sin(yaw) * (ROD_FAN_RADIUS + pullBack), ROD_END_RADIUS, Math.cos(yaw) * (ROD_FAN_RADIUS + pullBack) - ROD_FAN_RADIUS - 0.09);
      holder.rotation.set(Math.PI / 2, yaw, 0);
      holder.updateMatrix();
      rods.setMatrixAt(i, holder.matrix);
    });
    rods.castShadow = rods.receiveShadow = true;
    group.add(rods);
  }
  return group;
}

const SPINDLE_FROM = 0.035;
const SPINDLE_TO = 0.122;
const SPINDLE_RADIUS = 0.0135;
const STICK_RADIUS = 0.0048;
const KALAM_LENGTH = 0.225;
const THREADS = 42;
const THREAD_RADIUS = 0.00026;

const spindleRadiusAt = (share: number) => STICK_RADIUS + (SPINDLE_RADIUS - STICK_RADIUS) * Math.sin(Math.PI * share) ** 0.72;
const spindleLump = (theta: number, share: number) => 1 + 0.035 * Math.sin(theta * 3 + share * 9) * Math.sin(Math.PI * share) + 0.02 * Math.sin(theta * 7 - share * 17);

function kalamStick(): THREE.BufferGeometry {
  const rings = 56;
  const profile = Array.from({ length: rings }, (_, i) => {
    const y = (i / (rings - 1)) * KALAM_LENGTH;
    const radius = y < SPINDLE_FROM + 0.004 ? 0.0006 + (STICK_RADIUS - 0.0006) * (y / (SPINDLE_FROM + 0.004)) ** 1.1 : STICK_RADIUS;
    return new THREE.Vector2(radius, y);
  });
  profile.push(new THREE.Vector2(1e-4, KALAM_LENGTH));
  const lathe = new THREE.LatheGeometry(profile, 18);
  const position = lathe.attributes.position!;
  for (let i = 0; i < position.count; i++) {
    const cut = KALAM_LENGTH - 0.0075 + position.getX(i) * 0.8;
    if (position.getY(i) > cut) position.setY(i, cut);
  }
  const geometry = creasedNormals(lathe, 0.6);
  setTones(geometry, (_x, y) => (y < SPINDLE_FROM ? 1.32 : 1 - 0.28 * THREE.MathUtils.smoothstep(y, KALAM_LENGTH - 0.045, KALAM_LENGTH)));
  return geometry.rotateZ(-Math.PI / 2);
}

function kalamSpindle(): THREE.BufferGeometry {
  const rings = 40;
  const profile = Array.from({ length: rings + 1 }, (_, i) => new THREE.Vector2(spindleRadiusAt(i / rings), SPINDLE_FROM + (i / rings) * (SPINDLE_TO - SPINDLE_FROM)));
  const geometry = new THREE.LatheGeometry(profile, 44);
  const position = geometry.attributes.position!;
  for (let i = 0; i < position.count; i++) {
    const share = (position.getY(i) - SPINDLE_FROM) / (SPINDLE_TO - SPINDLE_FROM);
    const lump = spindleLump(Math.atan2(position.getZ(i), position.getX(i)), share);
    position.setX(i, position.getX(i) * lump);
    position.setZ(i, position.getZ(i) * lump);
  }
  return creasedNormals(geometry, 1);
}

function kalamThreads(): THREE.BufferGeometry {
  const threads: THREE.BufferGeometry[] = [];
  for (let thread = 0; thread < THREADS; thread++) {
    const hand = thread % 2 === 0 ? 1 : -1;
    const start = (thread / THREADS) * Math.PI * 2;
    const turns = 2.1 + (thread % 5) * 0.14;
    const points = Array.from({ length: 34 }, (_, i) => {
      const share = 0.015 + (i / 33) * 0.97;
      const theta = start + hand * share * turns * Math.PI * 2;
      const reach = spindleRadiusAt(share) * spindleLump(theta, share) + THREAD_RADIUS * 0.35;
      return new THREE.Vector3(Math.cos(theta) * reach, SPINDLE_FROM + share * (SPINDLE_TO - SPINDLE_FROM), Math.sin(theta) * reach);
    });
    threads.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 44, THREAD_RADIUS, 4, false));
  }
  const merged = mergeGeometries(threads)!;
  for (const thread of threads) thread.dispose();
  return merged;
}

const FIBRES = 360;
const FIBRE_LENGTHS = [0.118, 0.132, 0.146] as const;
const BUNDLE_RADIUS = 0.0074;

function fibreGeometry(length: number): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(0.00022, 0.00052, length, 6, 3);
  geometry.translate(0, length / 2, 0);
  return geometry;
}

function brushFibres(geometry: THREE.BufferGeometry, material: THREE.Material, own: readonly number[]): THREE.InstancedMesh {
  const fibres = new THREE.InstancedMesh(geometry, material, own.length);
  const holder = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const tone = new THREE.Color();
  own.forEach((fibre, i) => {
    const angle = fibre * 2.399963;
    const reach = BUNDLE_RADIUS * Math.sqrt((fibre + 0.5) / FIBRES);
    const flare = 0.04 + 0.13 * (reach / BUNDLE_RADIUS);
    direction.set(Math.cos(angle) * flare * (reach / BUNDLE_RADIUS), Math.sin(angle) * flare * (reach / BUNDLE_RADIUS) * 0.72, 1).normalize();
    holder.position.set(Math.cos(angle) * reach, Math.sin(angle) * reach, 0.03);
    holder.quaternion.setFromUnitVectors(up, direction);
    holder.updateMatrix();
    fibres.setMatrixAt(i, holder.matrix);
    const shade = 0.72 + 0.45 * ((fibre * 37) % 11) / 11;
    fibres.setColorAt(i, tone.setRGB(shade, shade * 0.97, shade * 0.9));
  });
  fibres.castShadow = fibres.receiveShadow = true;
  return fibres;
}

async function brush(library: MaterialLibrary): Promise<THREE.Object3D> {
  const [fibre, cord, stubMaterial] = await Promise.all([projectedMaterial(library, BRUSH_FIBRE), projectedMaterial(library, BRUSH_CORD), projectedMaterial(library, BRUSH_STUB)]);
  const part = new THREE.Group();
  const stubGeometry = await library.shared("tool:brush-stub", async () => turnedGeometry([[0.0001, 0], [0.0072, 0.002], [0.0078, 0.01], [0.0078, 0.16], [0.0082, 0.205], [0.0001, 0.207]]).rotateZ(Math.PI / 2));
  const stub = solidMesh(stubGeometry, stubMaterial);
  stub.rotation.y = -Math.PI / 2;
  stub.position.z = 0.037;
  const ridges: [number, number][] = [[0.0001, 0]];
  for (let turn = 0; turn < 15; turn++) ridges.push([0.0086, 0.0005 + turn * 0.002], [0.0094, 0.0015 + turn * 0.002]);
  ridges.push([0.0086, 0.0305], [0.0001, 0.031]);
  const bindingGeometry = await library.shared("tool:brush-binding", async () => new THREE.LatheGeometry(ridges.map(([r, y]) => new THREE.Vector2(r, y)), roundSegments(0.0094)));
  const binding = solidMesh(bindingGeometry, cord);
  binding.rotation.x = Math.PI / 2;
  binding.position.z = 0.016;
  part.add(stub, binding);
  for (const [variant, length] of FIBRE_LENGTHS.entries()) {
    const geometry = await library.shared(`tool:fibre:${variant}`, async () => fibreGeometry(length));
    part.add(brushFibres(geometry, fibre, Array.from({ length: FIBRES }, (_, i) => i).filter((i) => (i * 13) % FIBRE_LENGTHS.length === variant)));
  }
  part.position.x = -0.085;
  return restOnBench(part);
}

async function kalam(library: MaterialLibrary): Promise<THREE.Object3D> {
  const [bamboo, wrap] = await Promise.all([projectedMaterial(library, KALAM_BAMBOO), projectedMaterial(library, KALAM_WRAP)]);
  const [stickGeometry, spindleGeometry, threadGeometry] = await Promise.all([
    library.shared("tool:kalam-stick", async () => kalamStick()),
    library.shared("tool:kalam-spindle", async () => kalamSpindle()),
    library.shared("tool:kalam-threads", async () => kalamThreads()),
  ]);
  const part = new THREE.Group();
  const stick = solidMesh(stickGeometry, bamboo);
  stick.rotation.z = Math.PI / 2;
  part.add(stick, solidMesh(spindleGeometry, wrap), solidMesh(threadGeometry, wrap));
  part.rotation.x = Math.PI / 2 + Math.atan((SPINDLE_RADIUS - STICK_RADIUS) / (KALAM_LENGTH - (SPINDLE_FROM + SPINDLE_TO) / 2));
  part.position.set(0.075, 0, -0.11);
  return restOnBench(part);
}

export async function buildBrushAndKalam(library: MaterialLibrary): Promise<THREE.Object3D> {
  const group = new THREE.Group();
  group.add(await brush(library), await kalam(library));
  return group;
}

const BLOCK_OUTLINE: readonly (readonly [number, number])[] = [[-0.072, -0.03], [-0.05, -0.052], [-0.024, -0.044], [-0.004, -0.056], [0.026, -0.046], [0.05, -0.054], [0.074, -0.026], [0.062, -0.004], [0.075, 0.024], [0.048, 0.05], [0.02, 0.042], [-0.006, 0.056], [-0.034, 0.046], [-0.058, 0.052], [-0.075, 0.02], [-0.064, -0.006]];
const BLOCK_HOLES: readonly (readonly [number, number, number])[] = [[-0.052, 0.018, 0.0042], [-0.046, -0.026, 0.0034], [0.05, 0.022, 0.0044], [0.044, -0.03, 0.0032], [-0.018, 0.034, 0.0028], [0.016, -0.034, 0.003]];
const COMB_HEIGHT = 0.011;
const BODY_HEIGHT = 0.027;
const COMB_TEETH = 74;
const COMB_DEPTH = 0.0032;
const HANDLE_RISE = 0.028;
const HANDLE_NAIL_HOLES = [-0.02, 0.02] as const;
const HANDLE_NAIL_RADIUS = 0.0019;
const HANDLE_FUNNEL_REACH = 0.0068;

function holesIn(shape: THREE.Shape): void {
  for (const [x, y, radius] of BLOCK_HOLES) {
    const hole = new THREE.Path();
    hole.absarc(x, y, radius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
}

function outlineCurve(): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(BLOCK_OUTLINE.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, "catmullrom", 0.35);
}

function blockBody(): THREE.BufferGeometry {
  const shape = new THREE.Shape(outlineCurve().getSpacedPoints(160).slice(0, -1).map((point) => new THREE.Vector2(point.x, point.y)));
  holesIn(shape);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: BODY_HEIGHT - 0.003, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelOffset: -0.0015, bevelSegments: 2, curveSegments: 20 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, COMB_HEIGHT + 0.0015, 0);
  return creasedNormals(geometry, 0.75);
}

function blockComb(): THREE.BufferGeometry {
  const curve = outlineCurve();
  const points: THREE.Vector2[] = [];
  for (let tooth = 0; tooth < COMB_TEETH; tooth++) {
    for (const [along, inset] of [[0.08, 0], [0.42, 0], [0.5, COMB_DEPTH], [0.92, COMB_DEPTH]] as const) {
      const u = (tooth + along) / COMB_TEETH;
      const at = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u);
      points.push(new THREE.Vector2(at.x + tangent.y * inset * -1, at.y - tangent.x * inset * -1));
    }
  }
  const shape = new THREE.Shape(points);
  holesIn(shape);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: COMB_HEIGHT + 0.0004, bevelEnabled: false, curveSegments: 20 });
  geometry.rotateX(-Math.PI / 2);
  return creasedNormals(geometry, 0.75);
}

function blockHandle(): THREE.BufferGeometry {
  const shape = new THREE.Shape([new THREE.Vector2(-0.046, 0), new THREE.Vector2(-0.03, -0.0135), new THREE.Vector2(0.03, -0.0135), new THREE.Vector2(0.046, 0), new THREE.Vector2(0.03, 0.0135), new THREE.Vector2(-0.03, 0.0135)]);
  for (const x of HANDLE_NAIL_HOLES) {
    const hole = new THREE.Path();
    hole.absarc(x, 0, HANDLE_NAIL_RADIUS, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const lofted = new THREE.ExtrudeGeometry(shape, { depth: HANDLE_RISE, bevelEnabled: true, bevelThickness: 0.0045, bevelSize: 0.0045, bevelOffset: -0.0045, bevelSegments: 1, curveSegments: 16 });
  lofted.rotateX(-Math.PI / 2);
  const position = lofted.attributes.position!;
  for (let i = 0; i < position.count; i++) {
    for (const x of HANDLE_NAIL_HOLES) {
      const fromHole = Math.hypot(position.getX(i) - x, position.getZ(i));
      if (fromHole < HANDLE_FUNNEL_REACH) {
        position.setX(i, x + ((position.getX(i) - x) / fromHole) * HANDLE_NAIL_RADIUS);
        position.setZ(i, (position.getZ(i) / fromHole) * HANDLE_NAIL_RADIUS);
      }
    }
    const height = (position.getY(i) + 0.0045) / (HANDLE_RISE + 0.009);
    position.setX(i, position.getX(i) * (0.9 + 0.1 * height));
    position.setZ(i, position.getZ(i) * (1.08 - 0.14 * height));
  }
  lofted.translate(0, COMB_HEIGHT + BODY_HEIGHT + 0.0041, 0);
  const geometry = creasedNormals(lofted, 0.35);
  return setTones(geometry, (x, y, z) => {
    const streak = 0.5 + 0.5 * Math.sin(x * 240 + z * 90);
    const stain = 1 - THREE.MathUtils.smoothstep(y, COMB_HEIGHT + BODY_HEIGHT + 0.002, COMB_HEIGHT + BODY_HEIGHT + 0.04);
    return 1 - 0.72 * stain * (0.55 + 0.45 * streak);
  });
}

export async function buildCarvedBlock(library: MaterialLibrary): Promise<THREE.Object3D> {
  const [body, face, handle] = await Promise.all([projectedMaterial(library, BLOCK_WOOD), projectedMaterial(library, BLOCK_FACE), projectedMaterial(library, BLOCK_HANDLE)]);
  const [bodyGeometry, combGeometry, handleGeometry] = await Promise.all([
    library.shared("tool:block-body", async () => blockBody()),
    library.shared("tool:block-comb", async () => blockComb()),
    library.shared("tool:block-handle", async () => blockHandle()),
  ]);
  const group = new THREE.Group();
  group.add(solidMesh(bodyGeometry, body), solidMesh(combGeometry, face), solidMesh(handleGeometry, handle));
  return group;
}
