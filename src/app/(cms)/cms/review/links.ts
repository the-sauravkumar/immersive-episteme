import type { ReviewItem } from "@/server/cms/queries";

export const REVIEW_KIND_LABEL = { tradition: "Tradition", concept: "Concept", relationship: "Relationship", source: "Source" } as const;

export function reviewHref(i: Pick<ReviewItem, "kind" | "id">): string {
  switch (i.kind) {
    case "concept":
      return `/cms/concepts/${i.id}#review`;
    case "tradition":
      return `/cms/traditions?edit=${i.id}#tradition`;
    case "source":
      return `/cms/sources?edit=${i.id}#source`;
    case "relationship":
      return `/cms/review?rel=${i.id}#relationship`;
  }
}
