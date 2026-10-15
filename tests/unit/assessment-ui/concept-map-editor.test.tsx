/**
 * Concept-map editor without a mouse: relationships are created, revised, reversed and deleted
 * through labelled native controls; the raw map with its edit log is autosaved and submitted.
 * The React Flow canvas is replaced by a stub (jsdom has no layout); its behaviour is covered in
 * the e2e test.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConceptMapEditor, type SaveResult } from "@/components/assessment/concept-map-editor";
import type { MapConcept, MapPayload } from "@/components/assessment/map-state";

vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="canvas" /> }));

const concepts: MapConcept[] = ["Alpha", "Beta", "Gamma"].map((label, i) => ({ nodeKey: `c${i + 1}`, conceptId: `00000000-0000-4000-8000-00000000000${i + 1}`, label }));
const types = [
  { code: "PRECEDES", label: "precedes", directed: true },
  { code: "USES", label: "uses", directed: true },
];

type OnSave = (payload: MapPayload, final: boolean) => Promise<SaveResult>;

function setup(onSave = vi.fn<OnSave>(async () => ({ ok: true }))) {
  render(<ConceptMapEditor concepts={concepts} relationshipTypes={types} directedLinks initial={null} mode="participant" onSave={onSave} />);
  return { onSave, user: userEvent.setup() };
}

describe("ConceptMapEditor (keyboard path)", () => {
  it("creates a typed, directed relationship with labelled selects and keyboard only", async () => {
    const { user } = setup();
    const form = screen.getByRole("form", { name: "Add a Relationship" });
    await user.selectOptions(within(form).getByLabelText("From concept"), "Alpha");
    await user.selectOptions(within(form).getByLabelText("Relationship"), "precedes");
    await user.selectOptions(within(form).getByLabelText("To concept"), "Beta");
    within(form).getByRole("button", { name: "Add relationship" }).focus();
    await user.keyboard("{Enter}");
    const list = screen.getByRole("list");
    expect(within(list).getByText("Alpha precedes Beta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reverse: Alpha precedes Beta" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete: Alpha precedes Beta" })).toBeInTheDocument();
    expect(screen.getByLabelText("Relationship type for: Alpha precedes Beta")).toHaveValue("PRECEDES");
  });

  it("explains refusals instead of adding duplicates or untyped links", async () => {
    const { user } = setup();
    const form = screen.getByRole("form", { name: "Add a Relationship" });
    await user.selectOptions(within(form).getByLabelText("From concept"), "Alpha");
    await user.selectOptions(within(form).getByLabelText("To concept"), "Beta");
    await user.click(within(form).getByRole("button", { name: "Add relationship" }));
    expect(within(form).getByRole("status")).toHaveTextContent("Choose a relationship type.");
    expect(screen.getByText("No relationships yet.")).toBeInTheDocument();
  });

  it("revises, reverses and deletes, then submits the raw graph with its edit log", async () => {
    const { user, onSave } = setup();
    const form = screen.getByRole("form", { name: "Add a Relationship" });
    await user.selectOptions(within(form).getByLabelText("From concept"), "Alpha");
    await user.selectOptions(within(form).getByLabelText("Relationship"), "precedes");
    await user.selectOptions(within(form).getByLabelText("To concept"), "Beta");
    await user.click(within(form).getByRole("button", { name: "Add relationship" }));

    await user.selectOptions(screen.getByLabelText("Relationship type for: Alpha precedes Beta"), "uses");
    await user.click(screen.getByRole("button", { name: "Reverse: Alpha uses Beta" }));
    expect(screen.getByText("Beta uses Alpha")).toBeInTheDocument();

    await user.selectOptions(within(form).getByLabelText("From concept"), "Gamma");
    await user.selectOptions(within(form).getByLabelText("Relationship"), "precedes");
    await user.selectOptions(within(form).getByLabelText("To concept"), "Alpha");
    await user.click(within(form).getByRole("button", { name: "Add relationship" }));
    await user.click(screen.getByRole("button", { name: "Delete: Gamma precedes Alpha" }));

    await user.click(screen.getByRole("button", { name: "Submit map" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("1 relationship");
    await user.click(within(dialog).getByRole("button", { name: "Submit map" }));

    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(expect.anything(), true));
    const payload = onSave.mock.lastCall![0];
    expect(payload.edges).toEqual([{ key: "e1", source: "c2", target: "c1", relationshipType: "USES", directed: true }]);
    expect(payload.nodes).toHaveLength(3);
    expect(payload.editLog.map((l) => l.op)).toEqual(["add_edge", "retype_edge", "reverse_edge", "add_edge", "delete_edge"]);
    expect(await screen.findByText("Submitted. Thank you.")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Add a Relationship" })).not.toBeInTheDocument();
  });

  it("autosaves after a pause and reports the save state politely", async () => {
    const { user, onSave } = setup();
    const form = screen.getByRole("form", { name: "Add a Relationship" });
    await user.selectOptions(within(form).getByLabelText("From concept"), "Alpha");
    await user.selectOptions(within(form).getByLabelText("Relationship"), "uses");
    await user.selectOptions(within(form).getByLabelText("To concept"), "Gamma");
    await user.click(within(form).getByRole("button", { name: "Add relationship" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ edges: [expect.objectContaining({ relationshipType: "USES" })] }), false), { timeout: 4000 });
    expect(await screen.findByText("All changes saved.")).toBeInTheDocument();
  });

  it("shows a save error without losing the map", async () => {
    const { user } = setup(vi.fn<OnSave>(async () => ({ ok: false, error: "Your study session has ended." })));
    const form = screen.getByRole("form", { name: "Add a Relationship" });
    await user.selectOptions(within(form).getByLabelText("From concept"), "Alpha");
    await user.selectOptions(within(form).getByLabelText("Relationship"), "uses");
    await user.selectOptions(within(form).getByLabelText("To concept"), "Gamma");
    await user.click(within(form).getByRole("button", { name: "Add relationship" }));
    expect(await screen.findByText("Your study session has ended.", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText("Alpha uses Gamma")).toBeInTheDocument();
  });

  it("gives participants the study action row (full width under 520 px) and one rule above it; raters keep their row", () => {
    const { unmount } = render(
      <ConceptMapEditor concepts={concepts} relationshipTypes={types} directedLinks initial={null} mode="participant" onSave={vi.fn<OnSave>(async () => ({ ok: true }))} />,
    );
    const submit = screen.getByRole("button", { name: "Submit map" });
    expect(submit).toHaveClass("max-xs:w-full");
    const row = submit.closest("[data-slot=study-actions]")!;
    expect(row).toHaveClass("flex-col", "xs:flex-row"); // stacked under 520 px, a row from xs
    expect(row.className).not.toMatch(/border-t/);
    const addRow = screen.getByRole("button", { name: "Add relationship" }).parentElement!;
    expect(addRow.className).toContain("max-xs:flex-col");
    unmount();

    render(<ConceptMapEditor concepts={concepts} relationshipTypes={types} directedLinks initial={null} mode="rater" onSave={vi.fn<OnSave>(async () => ({ ok: true }))} />);
    expect(screen.getByRole("button", { name: "Submit map" })).not.toHaveClass("max-xs:w-full");
    expect(screen.getByRole("button", { name: "Add relationship" }).parentElement!.className).not.toContain("max-xs:flex-col");
  });
});

