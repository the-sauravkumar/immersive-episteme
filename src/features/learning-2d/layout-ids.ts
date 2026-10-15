/**
 * Ids of the 2D layout regions (client-safe; no imports, so any module can use them without an
 * import cycle).
 */

/** The 2D content column (the sheet column at 1024 px and wider), the StudyBar's "Skip to content" target. */
export const CONTENT_ID = "learn-2d-content";

/** The 2D PlaceRail ("In This Section"), the target of its StudyBar button's `aria-controls`. */
export const RAIL_ID = "learn-2d-rail";
