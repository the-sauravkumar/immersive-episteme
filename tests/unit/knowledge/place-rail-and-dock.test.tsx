/**
 * DR-021 shared layout parts, identical in both conditions by construction:
 *  - PlaceRail: the same DOM for "In This Section" (2D, links) and "In This Room" (3D, buttons),
 *    apart from the heading word and the row element (P28); current and visited marks; Hide and
 *    Escape (drawer only);
 *  - the docked sheet column class (P30) and the sheet's Close content and box (P32).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KnowledgeSheet, SHEET_CLOSE_CLASS, SHEET_DOCK_CLASS, SHEET_DOCK_CLASS_LG, SheetCloseContent } from "@/components/knowledge";
import { PlaceRail, RAIL_ROW_CLASS, type PlaceRailItem } from "@/components/learning/place-rail";
import { RAIL_TEXT, railDetail } from "@/features/learning/strings";

const items: PlaceRailItem[] = [
  { key: "a", title: "first concept", detail: railDetail("process_stage", { index: 1, total: 2 }), visited: true },
  { key: "b", title: "second concept", detail: railDetail("process_stage", { index: 2, total: 2 }), current: true },
];
const destinations: PlaceRailItem[] = [{ key: "d", title: "next place" }];

function rail(condition: "2d" | "immersive", onHide = () => {}) {
  return render(
    <PlaceRail
      id="rail"
      condition={condition}
      items={items}
      destinations={destinations}
      onHide={onHide}
      renderItem={(item, content, className) =>
        condition === "2d" ? (
          <a href={`#${item.key}`} className={className} aria-current={item.current ? "location" : undefined}>
            {content}
          </a>
        ) : (
          <button type="button" className={className} aria-current={item.current ? "location" : undefined}>
            {content}
          </button>
        )
      }
      renderDestination={(item, content, className) =>
        condition === "2d" ? (
          <a href={`#${item.key}`} className={className}>
            {content}
          </a>
        ) : (
          <button type="button" className={className}>
            {content}
          </button>
        )
      }
    />,
  );
}

/** The rail's markup with the condition's own parts normalised: the heading word and the row element. */
const normalised = (html: string) =>
  html
    .replace(/In This (Section|Room)/g, "In This PLACE")
    .replace(/<a href="#\w+"/g, "<ROW")
    .replace(/<button type="button"(?= class="group\/row)/g, "<ROW")
    .replace(/<\/(a|button)>/g, "</ROW>")
    .replace(/id="[^"]*"/g, 'id=""')
    .replace(/aria-labelledby="[^"]*"/g, 'aria-labelledby=""');

describe("PlaceRail (P28: one component in both conditions)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders the same DOM in 2D and 3D apart from the heading word and the row element", () => {
    const a = rail("2d").container.innerHTML;
    screen.getByRole("navigation", { name: "In This Section" });
    const b = rail("immersive").container.innerHTML;
    expect(normalised(a)).toBe(normalised(b));
  });

  it("marks the current row with 'You are here' and a visited row with a quiet check and hidden text", () => {
    const { container } = rail("2d");
    const current = container.querySelector("[aria-current=location]")!;
    expect(current).toHaveTextContent("Second ConceptProcess stage, step 2 of 2You are here");
    const first = container.querySelector('a[href="#a"]')!;
    expect(first.querySelector("[data-slot=rail-visited]")).not.toBeNull();
    expect(first.querySelector(".sr-only")).toHaveTextContent(RAIL_TEXT.visited);
    expect(current.querySelector("[data-slot=rail-visited]")).toBeNull();
    for (const row of container.querySelectorAll("a")) expect(row.className).toBe(RAIL_ROW_CLASS);
    expect(RAIL_ROW_CLASS).toContain("min-h-11");
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Leads To");
  });

  it("Hide calls onHide; Escape closes it only while it is a drawer (below 1280 px)", () => {
    const onHide = vi.fn();
    const mm = (matches: boolean) => vi.fn().mockReturnValue({ matches, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("matchMedia", mm(true));
    rail("immersive", onHide);
    fireEvent.click(screen.getByRole("button", { name: RAIL_TEXT.hide }));
    expect(onHide).toHaveBeenCalledTimes(1);
    const nav = screen.getByRole("navigation", { name: "In This Room" });
    fireEvent.keyDown(nav, { key: "Escape" });
    expect(onHide).toHaveBeenCalledTimes(1);
    vi.stubGlobal("matchMedia", mm(false));
    fireEvent.keyDown(nav, { key: "Escape" });
    expect(onHide).toHaveBeenCalledTimes(2);
  });

  it("has the shared geometry classes: 18rem (85vw at most), field ground, a 1 px right edge, internal scroll", () => {
    const nav = rail("2d").container.querySelector("[data-slot=place-rail]")!;
    for (const c of ["w-[min(18rem,85vw)]", "bg-field", "border-r", "border-rule-strong", "overflow-y-auto", "overscroll-contain"]) expect(nav.className).toContain(c);
  });
});

describe("docked sheet (P30) and Close (P32)", () => {
  it("the 2D column's dock classes are the 3D panel's, from 1024 px", () => {
    expect(SHEET_DOCK_CLASS_LG).toBe(
      SHEET_DOCK_CLASS.split(" ")
        .map((c) => `lg:${c}`)
        .join(" "),
    );
  });

  it("Close fills the action slot with the same content and box whether it is a link (2D) or a button (3D)", () => {
    const concept = { id: "c", title: "A concept", type: "material" as const, category: "materials" as const, localTerms: [], tradition: null, verificationState: "draft" };
    const page = render(
      <KnowledgeSheet
        concept={concept}
        placement="page"
        autoFocusTitle={false}
        action={
          <a href="/x" className={SHEET_CLOSE_CLASS}>
            <SheetCloseContent />
          </a>
        }
      />,
    );
    const panel = render(
      <KnowledgeSheet
        concept={concept}
        placement="panel"
        autoFocusTitle={false}
        action={
          <button type="button" className={SHEET_CLOSE_CLASS}>
            <SheetCloseContent />
          </button>
        }
      />,
    );
    const a = page.container.querySelector("[data-slot=sheet-action]")!.firstElementChild!;
    const b = panel.container.querySelector("[data-slot=sheet-action]")!.firstElementChild!;
    expect(a.innerHTML).toBe(b.innerHTML);
    expect(a.className).toBe(b.className);
    expect(a.textContent).toBe("Close");
  });
});
