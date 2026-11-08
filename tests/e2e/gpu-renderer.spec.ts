import { classifyRenderer } from "./gpu-mode";
import { expect, test } from "./fixtures";

test("the project renders WebGL on its expected GPU", async ({ gpuRenderer }, info) => {
  info.annotations.push({ type: "renderer", description: gpuRenderer ?? "none" });
  const expected = info.project.metadata?.gpu as string | undefined;
  if (expected) expect(classifyRenderer(gpuRenderer)).toBe(expected);
});
