import type { ClaimDetail } from "@/server/cms/queries";

import type { ClaimDraft } from "./claims-editor";

export function claimDraftsOf(claims: readonly ClaimDetail[]): ClaimDraft[] {
  return claims.map((c) => ({
    text: c.text,
    quote: c.quote ?? "",
    sources: c.sources.map((s) => {
      const passages = Array.isArray(s.evidence) ? s.evidence.filter((p) => typeof p?.quote === "string" && p.quote.trim() !== "") : [];
      const single = c.sources.length > 1 && passages.length === 1 ? passages[0]!.quote : "";
      return { sourceId: s.sourceId, locator: s.locator ?? "", quote: single, keptPassages: passages.length > 1 ? passages.length : 0 };
    }),
  }));
}
