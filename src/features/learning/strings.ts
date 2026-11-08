export const SHEET_TEXT = {
  fieldHeading: "From the Sources",
  claimsLabel: "Statements",
  noClaims: "No statements are recorded for this concept.",
  relatedHeading: "Related Concepts",
  aboutLinks: "About these links",
  conditions: "Conditions:",
  statedBy: "Stated by:",
  readingProgress: "Reading progress",
  layersLabel: "Information layers",
  metaLabel: "About this concept",
  meta: { localTerms: "Local terms", tradition: "Tradition", category: "Category", step: "Step" },
  previous: "Previous",
  next: "Next",
  close: "Close",
} as const;

export function stepValue(index: number, total: number): string {
  return `${index} of ${total}`;
}

export const CITATION_TEXT = {
  source: "Source",
  verbatim: "Verbatim from the source",
  passagesLabel: "Supporting passages",
  note: "Note:",
  open: "Open the source",
  newTab: "(opens in a new tab)",
  reference: {
    heading: "References",
    kind: "Kind of source:",
    reliability: "Reliability:",
    accessed: "Accessed",
  },
} as const;

export const FIGURE_TEXT = {
  enlarge: (n: number) => `Enlarge figure ${n}`,
  enlargeWord: "Enlarge",
  lightboxLabel: (n: number) => `Figure ${n}, enlarged`,
  close: "Close",
  diagramCredit: (snapshotLabel: string) => `Diagram generated from the project's knowledge graph (snapshot ${snapshotLabel})`,
  photoCredit: (credit: string) => `Photo: ${credit.trim().replace(/\.$/, "")}.`,
  licenceLabel: "Licence:",
} as const;

export const TASK_TEXT = {
  label: "Learning task",
  heading: "Your Learning Task",
} as const;

export const ACCESS_NOTICE_TEXT = {
  label: "Session type",
  endDemo: "End demo",
  demo: {
    long: "Demo: you are exploring outside a study. Nothing here is recorded as study data.",
    medium: "Demo: nothing here is recorded as study data.",
    short: "Demo: not study data.",
  },
  preview: {
    long: "Staff preview: not part of a study session and not recorded as study data.",
    medium: "Staff preview: not recorded as study data.",
    short: "Staff preview: not study data.",
  },
} as const;

export const UNAVAILABLE_TEXT = {
  title: "Learning Content Is Not Available",
  session_not_found: "Your study session could not be found. Please ask the study facilitator for help.",
  no_content: "There is no learning content to show yet. Please ask the study facilitator for help.",
} as const;

