/**
 * Study photographs load straight from the licence-gated figure route, never through the Next
 * image optimiser (final review knowledge-05; DR-037). The optimiser keeps its own copy for at
 * least minimumCacheTTL and re-serves a stale copy when /figures/<id> starts answering 404, so a
 * withdrawn or expired photograph would stay fetchable at /_next/image. Both conditions render the
 * same KnowledgeFigure, so one test covers both.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { KnowledgeFigure } from "@/components/knowledge/knowledge-figure";
import type { KnowledgeFigureData } from "@/features/knowledge/read/view";

const PHOTO: KnowledgeFigureData = {
  kind: "photo",
  id: "0190f3f6-0000-7000-8000-000000000001",
  conceptId: "0190f3f6-0000-7000-8000-000000000002",
  anchorClaimIndex: 0,
  caption: "A block-printed cotton cloth, the object the claim describes.",
  alt: "A cotton cloth printed with dark red and black repeating floral motifs in rows",
  src: "/figures/0190f3f6-0000-7000-8000-000000000001",
  width: 768,
  height: 512,
  credit: "Example Museum",
  licence: "Used with permission",
  licenceUrl: null,
};

describe("KnowledgeFigure photographs", () => {
  it("requests /figures/<id> directly in the slot and in the lightbox", async () => {
    render(<KnowledgeFigure figure={PHOTO} number={1} />);
    const slot = screen.getByRole("img", { name: PHOTO.alt });
    expect(slot.getAttribute("src")).toBe(PHOTO.src);
    expect(slot.getAttribute("srcset")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /enlarge/i }));
    const all = screen.getAllByRole("img", { name: PHOTO.alt });
    expect(all.length).toBeGreaterThan(1);
    for (const img of all) {
      expect(img.getAttribute("src")).toBe(PHOTO.src);
      expect(img.getAttribute("src")).not.toContain("/_next/image");
    }
  });
});
