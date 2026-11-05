import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { clothShadingSteps } from "@/features/walkthrough/domain/cloth-shading";
import { seededRandom } from "@/features/walkthrough/domain/pile-packing";

function rippledCloth(rows: number, columns: number) {
  const random = seededRandom(7);
  const positions = new Float32Array(rows * columns * 3);
  const uvs = new Float32Array(rows * columns * 2);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const k = row * columns + column;
      positions[k * 3] = column * 0.02 + random() * 0.003;
      positions[k * 3 + 1] = Math.sin(row * 0.31) * 0.2 + random() * 0.004;
      positions[k * 3 + 2] = row * 0.02 + Math.cos(column * 0.17) * 0.05;
      uvs[k * 2] = column / (columns - 1);
      uvs[k * 2 + 1] = row === rows - 1 ? (row - 1) / (rows - 1) : row / (rows - 1);
    }
  }
  const indices: number[] = [];
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const a = row * columns + column;
      indices.push(a, a + columns, a + 1, a + 1, a + columns, a + columns + 1);
    }
  }
  indices.push(0, 0, 1);
  return { positions, uvs, indices: Uint32Array.from(indices) };
}

function settled<T>(steps: Generator<void, T>): { value: T; yields: number } {
  let yields = 0;
  let step = steps.next();
  while (!step.done) {
    yields++;
    step = steps.next();
  }
  return { value: step.value, yields };
}

describe("cloth shading worked out in steps", () => {
  it("matches three.js computeVertexNormals and computeTangents bit for bit", () => {
    const cloth = rippledCloth(140, 97);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(cloth.positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(cloth.uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(cloth.indices, 1));
    geometry.computeVertexNormals();
    geometry.computeTangents();
    const { value, yields } = settled(clothShadingSteps(cloth.positions, cloth.uvs, cloth.indices));
    expect(yields).toBeGreaterThan(10);
    expect(Buffer.from(value.normals.buffer).equals(Buffer.from((geometry.attributes.normal!.array as Float32Array).buffer))).toBe(true);
    expect(Buffer.from(value.tangents.buffer).equals(Buffer.from((geometry.attributes.tangent!.array as Float32Array).buffer))).toBe(true);
  });
});
