import { z } from "zod";

import { verificationTransitionSchema } from "@/features/knowledge/contracts";
import { nonBlank } from "@/lib/validation/primitives";

export { verificationTransitionSchema };

export const SNAPSHOT_VERSION_LABEL_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const snapshotBuildRequestSchema = z
  .object({
    versionLabel: z.string().regex(SNAPSHOT_VERSION_LABEL_REGEX),
    title: nonBlank(300),
    description: z.string().max(4000).nullish(),
    traditionSlugs: z.array(z.string().min(1)).min(1),
    includeUnverified: z.boolean().default(false),
    isDemo: z.boolean().default(false),
  })
  .superRefine((r, ctx) => {
    if (r.isDemo !== r.versionLabel.startsWith("demo")) {
      ctx.addIssue({ code: "custom", path: ["versionLabel"], message: "Demo snapshot labels start with 'demo' (and only demo ones)" });
    }
    if (r.isDemo && !r.title.startsWith("Demo:")) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "Demo snapshots need a 'Demo:' title" });
    }
  });
export type SnapshotBuildRequest = z.infer<typeof snapshotBuildRequestSchema>;

export const snapshotPublishRequestSchema = z.object({
  snapshotId: z.uuid(),
  confirmVersionLabel: z.string().min(1),
});
