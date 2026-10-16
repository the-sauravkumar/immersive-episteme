/**
 * Which keys the museum's walk receives (museum-scene.tsx). Pure DOM logic, so it is unit-tested
 * without the scene.
 */

/** Controls that use arrow keys themselves: lists, tabs, menus, radio groups, dialogs, popup triggers. */
const ARROW_KEY_CONTROLS = "ul, ol, [role=list], [role=listbox], [role=tablist], [role=menu], [role=menubar], [role=radiogroup], [role=grid], [role=tree], [role=dialog], dialog, [aria-haspopup]:not([aria-haspopup=false])";

/**
 * True when a key belongs to the focused overlay, not to the walk. Text fields always keep it.
 * Overlays that use arrow keys themselves (`data-museum-keys="ui"`: the panel, the Plan, screens,
 * cue notes) keep them. In the StudyBar (`"bar"`) and the PlaceRail (`"rail"`), only controls that
 * use arrows (the rail's rows are a list) keep them: a plain toggle (Plan, In This Room, Controls
 * help) or the rail's heading and Hide button lets the movement keys through, so a visitor who
 * opens the Plan or the rail and then presses an arrow turns, as before the click (final review
 * novice-3d-arrow-keys-dead-after-bar-buttons).
 */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.closest) return false;
  if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA" || el.isContentEditable) return true;
  const region = el.closest("[data-museum-keys]");
  if (!region) return false;
  const kind = region.getAttribute("data-museum-keys");
  if (kind === "bar" || kind === "rail") {
    const control = el.closest(ARROW_KEY_CONTROLS);
    return !!control && region.contains(control);
  }
  return true;
}
