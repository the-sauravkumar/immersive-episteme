/**
 * The GPU each project renders on (DR-049, number to confirm at merge). The check itself is the automatic worker fixture in
 * fixtures.ts, which fails before this test when the renderer is not the project's GPU; this test
 * makes the check visible as its own result and records the renderer string.
 *
 *   npx playwright test tests/e2e/gpu-renderer.spec.ts --workers=1
 */
import { classifyRenderer } from "./gpu-mode";
import { expect, test } from "./fixtures";

test("the project renders WebGL on its expected GPU", async ({ gpuRenderer }, info) => {
  info.annotations.push({ type: "renderer", description: gpuRenderer ?? "none" });
  const expected = info.project.metadata?.gpu as string | undefined;
  if (expected) expect(classifyRenderer(gpuRenderer)).toBe(expected);
});
