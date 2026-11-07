/** The knowledge sheet (DESIGN.md 9.10-9.12). */
export const SHEET_TEXT = {
  /** Running head over the claims (9.11 item 4). */
  fieldHeading: "From the Sources",
  claimsLabel: "Statements",
  noClaims: "No statements are recorded for this concept.",
  relatedHeading: "Related Concepts",
  /** One disclosure per relation-verb group (9.12). */
  aboutLinks: "About these links",
  conditions: "Conditions:",
  statedBy: "Stated by:",
  readingProgress: "Reading progress",
  layersLabel: "Information layers",
  metaLabel: "About this concept",
  /** Metadata labels: sentence case (DESIGN.md 6.3 `text-label`). */
  meta: { localTerms: "Local terms", tradition: "Tradition", category: "Category", step: "Step" },
  pagerLabel: "Previous and next",
  previous: "Previous",
  next: "Next",
  close: "Close",
} as const;

/** "3 of 9": the value of the sheet's Step metadata row (DR-022: a row, not an eyebrow). */
export function stepValue(index: number, total: number): string {
  return `${index} of ${total}`;
}

/** The citation markers, records and reference list (DESIGN.md 9.9; DR-022 Addendum A). */
export const CITATION_TEXT = {
  /** Start of a marker's accessible name ("Source 1: ...") and of the record's head ("Source 1"). */
  source: "Source",
  /** The visible label over the verbatim evidence (DR-022: names what the block is). */
  verbatim: "Verbatim from the source",
  passagesLabel: "Supporting passages",
  note: "Note:",
  open: "Open the source",
  newTab: "(opens in a new tab)",
  /** The deduplicated reference list at the end of the sheet. */
  reference: {
    heading: "References",
    kind: "Kind of source:",
    reliability: "Reliability:",
    accessed: "Accessed",
  },
} as const;

/** Knowledge figures and the lightbox (DESIGN.md 9.9). */
export const FIGURE_TEXT = {
  enlarge: (n: number) => `Enlarge figure ${n}`,
  /** The Enlarge button's visible word (the start of its accessible name). */
  enlargeWord: "Enlarge",
  lightboxLabel: (n: number) => `Figure ${n}, enlarged`,
  close: "Close",
  /** Credit line of a graph-derived diagram (DR-018). */
  diagramCredit: (snapshotLabel: string) => `Diagram generated from the project's knowledge graph (snapshot ${snapshotLabel})`,
  /** "Photo: © Victoria and Albert Museum, London.": the credit as a sentence; the licence follows. */
  photoCredit: (credit: string) => `Photo: ${credit.trim().replace(/\.$/, "")}.`,
  licenceLabel: "Licence:",
} as const;

/** The learning-task prompts panel (shared by both conditions). */
export const TASK_TEXT = {
  label: "Learning task",
  heading: "Your Learning Task",
} as const;

/** The AccessNotice strip (DESIGN.md 9.15) at three widths, plain and merged with "under review". */
export const ACCESS_NOTICE_TEXT = {
  label: "Session type",
  endDemo: "End demo",
  demo: {
    plain: {
      long: "Demo: you are exploring outside a study. Nothing here is recorded as study data.",
      medium: "Demo: nothing here is recorded as study data.",
      short: "Demo: not study data.",
    },
    review: {
      long: "Demo: not recorded as study data. Some content is under review and not yet verified.",
      medium: "Demo: not study data. Content under review.",
      short: "Demo, under review",
    },
  },
  preview: {
    plain: {
      long: "Staff preview: not part of a study session and not recorded as study data.",
      medium: "Staff preview: not recorded as study data.",
      short: "Staff preview: not study data.",
    },
    review: {
      long: "Staff preview: not recorded as study data. Some content is under review and not yet verified.",
      medium: "Staff preview: not study data. Content under review.",
      short: "Preview, under review",
    },
  },
} as const;

export const UNVERIFIED_NOTICE_TEXT = {
  label: "Content state",
  long: "Some of this content is under review and has not yet been verified by a curator.",
  short: "Under review: not yet verified.",
} as const;

/** 2D content that cannot be shown (StateMessage). */
export const UNAVAILABLE_TEXT = {
  title: "Learning Content Is Not Available",
  session_not_found: "Your study session could not be found. Please ask the study facilitator for help.",
  no_content: "There is no learning content to show yet. Please ask the study facilitator for help.",
} as const;

/*
 * 3D-only interface wording (the condition navigation and the museum's own screens, 12.1 rule 3).
 * Kept here with the shared wording so every learner-visible string of both conditions is in one
 * module (P20).
 */
