import { describe, expect, it } from "vitest";
import { CLAY_BOWL, CLAY_POT, sampledPath, throwingSteps, type ThrownForm, type ThrownMesh } from "@/features/walkthrough/domain/thrown-vessel";
import { measureVesselProfile, wallRadius } from "@/features/walkthrough/domain/vessel-profile";

function throwVessel(form: ThrownForm): ThrownMesh {
  const steps = throwingSteps(form);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

function trianglesOf(form: ThrownForm): Float32Array {
  const mesh = throwVessel(form);
  const out = new Float32Array(mesh.indices.length * 3);
  mesh.indices.forEach((vertex, i) => out.set(mesh.positions.subarray(vertex * 3, vertex * 3 + 3), i * 3));
  return out;
}

describe.each([["bowl", CLAY_BOWL], ["pot", CLAY_POT]] as const)("thrown clay %s", (_name, form) => {
  const mesh = throwVessel(form);
  const profile = measureVesselProfile(trianglesOf(form));

  it("sits flat on the bench and is not perfectly round", () => {
    let lowest = Infinity;
    for (let i = 1; i < mesh.positions.length; i += 3) lowest = Math.min(lowest, mesh.positions[i]!);
    expect(lowest).toBeCloseTo(0, 5);
    const top = (form.rings >> 1) * form.segments;
    const radii = Array.from({ length: form.segments }, (_, segment) => Math.hypot(mesh.positions[(top + segment) * 3]!, mesh.positions[(top + segment) * 3 + 2]!));
    expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(1.005);
  });

  it("measures a real floor and an inner wall inside the outer wall", () => {
    const outer = sampledPath(form.path, form.rings);
    const widestOuter = Math.max(...outer.map(([radius]) => radius));
    expect(profile.floorY).toBeGreaterThan(0.005);
    expect(profile.floorY).toBeLessThan(0.02);
    expect(profile.rimY).toBeGreaterThan(mesh.heightMetres * 0.85);
    for (const y of [profile.floorY + 0.03, (profile.floorY + profile.rimY) / 2, profile.rimY - 0.005]) {
      for (let a = 0; a < 12; a++) {
        const radius = wallRadius(profile, (a / 12) * Math.PI * 2, y);
        expect(radius).toBeGreaterThan(0.02);
        expect(radius).toBeLessThan(widestOuter);
      }
    }
  });

  it("keeps the wall at least 4 mm thick", () => {
    const path = sampledPath(form.path, form.rings);
    const top = path.findIndex(([, y]) => y === mesh.heightMetres);
    const outer = path.slice(0, top);
    const inner = path.slice(top + 1);
    for (const [radius, y] of inner) {
      if (radius < 0.02) continue;
      const nearest = Math.min(...outer.map(([r, h]) => Math.hypot(r - radius, h - y)));
      expect(nearest).toBeGreaterThan(0.004);
    }
  });
});
