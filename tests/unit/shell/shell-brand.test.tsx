/**
 * WP0b: shells, Display Settings (DESIGN.md 9.15, 9.16, 9.19; DR-019) and the brand components
 * (DESIGN.md 7). jsdom has no layout, so sizes are checked through classes here and measured in
 * the browser by the Playwright suites.
 */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chartFigureLabel, claimNumber, countOf, figureLabel, plateLabel, tableLabel } from "@/components/brand/numbering";
import { KnockoutBand, KnockoutField } from "@/components/brand/knockout-band";
import { OutlineDiagram } from "@/components/brand/outline-diagram";
import { RegistrationTicks } from "@/components/brand/registration-ticks";
import { Rule } from "@/components/brand/rule";
import { TraditionMarker, TraditionName } from "@/components/knowledge/tradition-marker";
import { DISPLAY_BOOT_SCRIPT, DISPLAY_STORAGE_KEY, isStudyPath, parseDisplayPreferences } from "@/components/shell/display-preferences";
import { DisplayPreferencesSync, DisplaySettings } from "@/components/shell/display-settings";
import { PageHeader } from "@/components/shell/page-header";
import { StudyShell } from "@/components/shell/study-shell";
import { BreadcrumbTrail } from "@/components/ui/breadcrumb";

vi.mock("@/server/auth/actions", () => ({ endPublicDemo: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/about", useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const html = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  html.className = "";
  html.style.colorScheme = "";
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("display preferences", () => {
  it("parses stored JSON defensively", () => {
    expect(parseDisplayPreferences(null)).toEqual({ contrast: false, reduceMotion: false });
    expect(parseDisplayPreferences("not json")).toEqual({ contrast: false, reduceMotion: false });
    expect(parseDisplayPreferences('{"contrast":true,"reduceMotion":"yes"}')).toEqual({ contrast: true, reduceMotion: false });
  });

  it("treats /learn/* and /study/* as study mode only", () => {
    for (const p of ["/learn", "/learn/2d", "/learn/immersive/practice", "/study", "/study/consent"]) expect(isStudyPath(p)).toBe(true);
    for (const p of ["/", "/learning", "/studyx", "/research/studies", "/explore"]) expect(isStudyPath(p)).toBe(false);
  });
});

describe("DisplaySettings (DESIGN.md 9.19)", () => {
  it("shows three labelled switches outside study and writes the classes on <html>", async () => {
    render(<DisplaySettings zone="public" />);
    await userEvent.click(screen.getByRole("button", { name: "Display settings" }));
    const dialog = screen.getByRole("dialog", { name: "Display Settings" });
    expect(within(dialog).getAllByRole("switch")).toHaveLength(3);
    expect(within(dialog).getByRole("switch", { name: "Dark theme" })).toHaveAttribute("aria-checked", "false");

    await userEvent.click(within(dialog).getByRole("switch", { name: "High contrast" }));
    expect(within(dialog).getByRole("switch", { name: "High contrast" })).toHaveAttribute("aria-checked", "true");
    expect(html).toHaveClass("a11y-contrast");
    expect(JSON.parse(localStorage.getItem(DISPLAY_STORAGE_KEY)!)).toEqual({ contrast: true, reduceMotion: false });

    await userEvent.click(within(dialog).getByRole("switch", { name: "Reduce motion" }));
    expect(html).toHaveClass("a11y-reduce-motion");
  });

  it("offers ONLY High contrast in study mode and reports the choice to the study engine", async () => {
    const onChange = vi.fn();
    render(<DisplaySettings zone="study" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Display settings" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("switch")).toHaveLength(1);
    expect(within(dialog).queryByRole("switch", { name: "Dark theme" })).toBeNull();
    expect(within(dialog).queryByRole("switch", { name: "Reduce motion" })).toBeNull();

    await userEvent.click(within(dialog).getByRole("switch", { name: "High contrast" }));
    expect(onChange).toHaveBeenLastCalledWith({ dark: false, contrast: true, reduceMotion: false });
    expect(html).toHaveClass("a11y-contrast");
    expect(html).not.toHaveClass("dark");
    expect(html).not.toHaveClass("a11y-reduce-motion");
  });

  it("every switch row is a 44 px target", async () => {
    render(<DisplaySettings zone="public" />);
    await userEvent.click(screen.getByRole("button", { name: "Display settings" }));
    for (const s of screen.getAllByRole("switch")) expect(s.className).toContain("min-h-11");
  });
});

describe("DisplayPreferencesSync", () => {
  it("forces light in the study zone, keeps it light, and gives the stored theme back on leaving", async () => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ contrast: true, reduceMotion: true }));
    html.classList.add("dark");
    const { unmount } = render(<DisplayPreferencesSync zone="study" />);
    expect(html).not.toHaveClass("dark");
    expect(html).toHaveClass("light", "a11y-contrast");
    expect(html).not.toHaveClass("a11y-reduce-motion");
    expect(html.style.colorScheme).toBe("light");

    // Something (next-themes) re-adds dark: the guard strips it again.
    await act(async () => {
      html.classList.add("dark");
      await Promise.resolve();
    });
    expect(html).not.toHaveClass("dark");

    unmount();
    expect(html).toHaveClass("dark", "a11y-reduce-motion");
  });

  it("applies every stored choice in the public zone", () => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ contrast: false, reduceMotion: true }));
    render(<DisplayPreferencesSync zone="public" />);
    expect(html).toHaveClass("dark", "a11y-reduce-motion");
    expect(html).not.toHaveClass("a11y-contrast");
  });
});

describe("DISPLAY_BOOT_SCRIPT (pre-paint)", () => {
  function runBoot() {
    new Function(DISPLAY_BOOT_SCRIPT)();
  }

  it("applies high contrast and reduce motion on public routes", () => {
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ contrast: true, reduceMotion: true }));
    runBoot();
    expect(html).toHaveClass("a11y-contrast", "a11y-reduce-motion");
  });

  it("forces light on study routes even when the theme script adds dark afterwards", async () => {
    window.history.replaceState(null, "", "/learn/2d");
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ contrast: true, reduceMotion: true }));
    runBoot();
    expect(html).toHaveClass("a11y-contrast");
    expect(html).not.toHaveClass("a11y-reduce-motion");
    html.classList.add("dark");
    await Promise.resolve();
    expect(html).not.toHaveClass("dark");
    (window as unknown as Record<string, MutationObserver>).__ieStudyThemeGuard?.disconnect();
  });
});

describe("StudyShell (DESIGN.md 9.16)", () => {
  it("is a study root with no outbound link, a Study eyebrow and an optional tabular step count", () => {
    const { container } = render(
      <StudyShell step={{ current: 2, total: 7 }}>
        <p>Body</p>
      </StudyShell>,
    );
    const root = container.firstElementChild!;
    expect(root).toHaveClass("study-root", "a11y-reduce-motion");
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("Study")).toHaveClass("text-eyebrow");
    expect(screen.getByText("Step 2 of 7")).toHaveClass("text-timer");
    expect(screen.getByText(/ask the study facilitator/)).toBeInTheDocument();
  });
});

describe("PageHeader", () => {
  it("title-cases the h1 and draws the band or rule only when asked", () => {
    const band = renderToStaticMarkup(<PageHeader title="research overview" eyebrow="console" top="band" />);
    expect(band).toContain("Research Overview");
    expect(band).toContain('class="ie-band"');
    const rule = renderToStaticMarkup(<PageHeader title="users" top="rule" />);
    expect(rule).toContain('data-rule="running-head"');
    expect(rule).not.toContain("ie-band");
    const plain = renderToStaticMarkup(<PageHeader title="questions before learning" kicker="study" />);
    expect(plain).not.toContain("ie-band");
    expect(plain).not.toContain("data-rule");
  });

});

describe("brand components (DESIGN.md 7)", () => {
  it("knock-out bands are decorative and use unique pattern ids", () => {
    const { container } = render(
      <>
        <KnockoutBand size={24} />
        <KnockoutBand size={48} />
        <KnockoutField columns={2} rows={1} />
      </>,
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(3);
    for (const svg of svgs) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("focusable", "false");
    }
    const ids = [...container.querySelectorAll("pattern")].map((p) => p.id);
    expect(new Set(ids).size).toBe(3);
    // Neutral units only: no stars, rosettes or floral shapes; flat fills.
    expect(container.innerHTML).not.toMatch(/gradient|filter|polygon|ellipse/);
    // The HC replacement rule is present unless the band sits under a running-head rule.
    expect(container.querySelectorAll(".ie-band-rule")).toHaveLength(2);
    expect(svgs[2]).toHaveAttribute("width", "192");
  });

  it("registration ticks are four hidden corner marks", () => {
    const { container } = render(<RegistrationTicks />);
    const ticks = container.querySelector(".ie-ticks")!;
    expect(ticks).toHaveAttribute("aria-hidden", "true");
    expect(ticks.querySelectorAll("svg.ie-tick")).toHaveLength(4);
  });

  it("the tradition marker is identical for every key (P17)", () => {
    const keys = ["ajrakh", "bagh", "bagru", "dabu", "machilipatnam-kalamkari", "sanganeri"];
    const markup = keys.map((k) => renderToStaticMarkup(<TraditionMarker traditionKey={k} />).replace(/ data-tradition-key="[^"]*"/, ""));
    expect(new Set(markup).size).toBe(1);
    expect(markup[0]).toBe('<span aria-hidden="true" data-slot="tradition-marker" class="ie-marker"></span>');
    render(<TraditionName traditionKey="dabu">Dabu</TraditionName>);
    expect(screen.getByText("Dabu").previousElementSibling).toHaveClass("ie-marker");
  });

  it("rules are borders, never fills", () => {
    const markup = renderToStaticMarkup(
      <>
        <Rule kind="running-head" />
        <Rule kind="hairline" />
        <Rule kind="booktabs" />
      </>,
    );
    expect(markup).toContain("border-t-2 border-ink");
    expect(markup).toContain("border-t border-rule");
    expect(markup).toContain("border-t-[1.5px] border-ink");
    expect(markup).not.toMatch(/bg-/);
  });

  it("numbering labels", () => {
    expect(claimNumber(0)).toBe("1");
    expect(figureLabel(2)).toBe("Fig. 2");
    expect(plateLabel(1)).toBe("Plate 1");
    expect(chartFigureLabel(3)).toBe("Figure 3");
    expect(tableLabel(1)).toBe("Table 1");
    expect(countOf("Question", 4, 20)).toBe("Question 4 of 20");
    expect(() => figureLabel(0)).toThrow(RangeError);
  });

  it("outline-then-fill diagrams draw the fill layer under the outline layer, fully drawn by default", () => {
    const { container } = render(
      <OutlineDiagram
        width={200}
        height={100}
        nodes={[
          { id: "a", x: 10, y: 10, width: 60, height: 40, fill: "wash", label: "Page" },
          { id: "b", x: 130, y: 10, width: 60, height: 40, fill: "indigo", label: ["Floor", "plan"] },
        ]}
        edges={[{ id: "e", d: "M70 30 H130", arrow: true, draw: true }]}
      />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    const layers = [...svg.querySelectorAll("g[data-layer]")].map((g) => g.getAttribute("data-layer"));
    expect(layers).toEqual(["fill", "outline", "text"]);
    const fills = svg.querySelectorAll('g[data-layer="fill"] rect');
    const outlines = svg.querySelectorAll('g[data-layer="outline"] rect');
    expect(fills).toHaveLength(2);
    for (const [i, f] of [...fills].entries()) {
      for (const attr of ["x", "y", "width", "height"]) expect(outlines[i]!.getAttribute(attr)).toBe(f.getAttribute(attr));
    }
    const edge = svg.querySelector("path[data-draw]") as SVGPathElement;
    expect(edge.style.strokeDashoffset).toBe("0");
    expect(container.innerHTML).not.toMatch(/madder/);
  });
});

describe("BreadcrumbTrail (DESIGN.md 9.16)", () => {
  it("collapses middle crumbs behind a 44 px button, keeps the full path in title and a parent link for phones", () => {
    const items = [
      { label: "Traditions", href: "/learn/2d" },
      { label: "Alpha", href: "/learn/2d/traditions/a" },
      { label: "Process", href: "/learn/2d/traditions/a#process" },
      { label: "Stage", href: "/learn/2d/concepts/s" },
      { label: "Current" },
    ];
    const { container } = render(<BreadcrumbTrail items={items} />);
    const nav = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(nav).toHaveAttribute("title", "Traditions › Alpha › Process › Stage › Current");
    const summary = container.querySelector("summary")!;
    expect(summary).toHaveAccessibleName("Show 2 more levels");
    expect(summary.className).toContain("size-11");
    expect(container.querySelector("p.xs\\:hidden a")).toHaveAttribute("href", "/learn/2d/concepts/s");
    expect(screen.getByText("Current")).toHaveAttribute("aria-current", "page");
  });

  it("shows every crumb when there are three or fewer", () => {
    const { container } = render(<BreadcrumbTrail items={[{ label: "Traditions", href: "/x" }, { label: "Alpha" }]} />);
    expect(container.querySelector("summary")).toBeNull();
  });
});
