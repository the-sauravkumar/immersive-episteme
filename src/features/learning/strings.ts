/**
 * Every learner-visible INTERFACE string of the two learning conditions, in one module
 * (DESIGN.md 12.1 rule 2, parity check P20). The shared knowledge components, the StudyBar, the
 * onboarding, the guidance and the timer read their wording from here, so the 2D pages and the
 * 3D museum cannot drift apart. These are interface words, never craft content: every knowledge
 * string (titles, claims, quotes, relation verbs) comes from the snapshot.
 *
 * Client-safe (pure data and pure functions).
 */
import { GUIDANCE_TEXT } from "./guidance";

export { GUIDANCE_TEXT };

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
  meta: { localTerms: "Local Terms", tradition: "Tradition", category: "Category", status: "Status" },
  pagerLabel: "Previous and next",
  previous: "Previous",
  next: "Next",
  close: "Close",
} as const;

/** "Step 3 of 9" (tabular in the eyebrow). */
export function stepOf(index: number, total: number): string {
  return `Step ${index} of ${total}`;
}

/** The citation note and record (DESIGN.md 9.8). */
export const CITATION_TEXT = {
  source: "Source",
  detailsLabel: "Source details",
  passagesLabel: "Supporting passages",
  note: "Note:",
  open: "Open the source",
  newTab: "(opens in a new tab)",
  rows: {
    title: "Title",
    author: "Author",
    publisher: "Publisher",
    year: "Year",
    locator: "Locator",
    kind: "Kind of Source",
    reliability: "Reliability",
    accessed: "Accessed",
  },
} as const;

/** Knowledge figures and the lightbox (DESIGN.md 9.9). */
export const FIGURE_TEXT = {
  enlarge: (n: number) => `Enlarge figure ${n}`,
  lightboxLabel: (n: number) => `Figure ${n}, enlarged`,
  close: "Close",
  /** Credit line of a graph-derived diagram (DR-018). */
  diagramCredit: (snapshotLabel: string) => `Diagram generated from the project's knowledge graph (snapshot ${snapshotLabel})`,
  photoCredit: (credit: string) => `Photo: ${credit}`,
} as const;

/** Shared learning-phase wording (timer, finish, hand-back), identical in both conditions. */
export const PHASE_TEXT = {
  learning: {
    timeLeft: "Time left",
    timeLeftLong: "Learning time left",
    finish: "Finish",
    finishLong: "Finish learning",
    confirm: "Confirm: finish learning",
    keep: "Keep learning",
    timeUp: "The learning time is over",
    finished: "You have finished learning",
  },
  practice: {
    timeLeft: "Time left",
    timeLeftLong: "Practice time left",
    finish: "Finish",
    finishLong: "Finish practice",
    confirm: "Confirm: finish practice",
    keep: "Keep practising",
    timeUp: "The practice time is over",
    finished: "You have finished the practice",
  },
} as const;

/** The StudyBar (DESIGN.md 9.14): shared group, and both condition navigation groups. */
export const STUDY_BAR_TEXT = {
  skipToContent: "Skip to content",
  barLabel: "Study controls",
  sharedGroupLabel: "Learning controls",
  conditionGroupLabel: "Navigation",
  /** 2D condition group. */
  contents: "Contents",
  search: "Search",
  upTo: (parent: string) => `Up to ${parent}`,
  /** 3D condition group. */
  plan: "Plan",
  controlsHelp: "Controls help",
  mouseLook: "Mouse look",
  pause: "Pause",
} as const;

/**
 * The one onboarding of both conditions (DESIGN.md 9.20, P23). The shared steps are identical;
 * only `movement` differs by condition, and the two versions are written to the same length
 * (within 10% of words; tests/unit/knowledge/knowledge-components.test.tsx checks it).
 */
export const ONBOARDING_TEXT = {
  title: { learning: "Before You Start", practice: "Before You Practise" },
  lead: {
    learning: "Read these steps once. They are the same for everyone in the study.",
    practice: "This practice uses the same controls as the learning task. Nothing here is study content.",
  },
  time: (minutes: number | null, kind: "learning" | "practice") =>
    minutes === null
      ? `There is no time limit. Use Finish in the top bar when you are done.`
      : `You have ${minutes} ${minutes === 1 ? "minute" : "minutes"} for this ${kind === "learning" ? "task" : "practice"}. Time left in the top bar shows what remains.`,
  hint: "Hint, in the top bar, opens a short hint from the researchers. It stays open beside the content until you close it.",
  citation: "Under every statement, Source opens the record it comes from, with the exact quote. Press Escape to close it.",
  figure: "Enlarge, under a figure, shows it full size. Close or Escape takes you back.",
  movement: {
    "2d": "Contents, in the top bar, lists the traditions and their sections. Select a concept to open its page. Links at the end of a page lead to related concepts, and Previous and Next to its neighbours.",
    immersive: "Plan, in the top bar, shows the rooms. Walk with W and S or ↑ and ↓, turn with A and D or ← and →, and drag to look around. Select an exhibit to open its panel; its links walk you to related exhibits.",
  },
  keyLabel: "The controls in the top bar",
  start: "Start",
} as const;

/** The "under review" notice (AccessNotice slot, DESIGN.md 9.15), identical in both conditions. */
export const NOTICE_TEXT = {
  unverifiedLong: "This content is under review and has not yet been verified by a curator.",
  unverifiedShort: "Under review: not yet verified by a curator.",
} as const;

/** The learning-task prompts panel (shared by both conditions). */
export const TASK_TEXT = {
  label: "Learning task",
  heading: "Your Learning Task",
} as const;

/**
 * The layer view's own parts (src/components/knowledge/layer-parts.tsx), identical in both
 * conditions: the chooser of a layer with several concepts, the Process sequence, the head of a
 * concept shown under another concept's layer, and the comparison blocks.
 */
export const LAYER_TEXT = {
  chooserLabel: "Concepts in this layer",
  selected: "Selected",
  sequence: "Sequence",
  thisConcept: "This concept",
  /** 2D navigates to the concept's page, 3D walks to its exhibit (12.1 rule 3); same words. */
  open: "Go to this concept",
  compared: "Compared Concepts",
  similarities: "Similarities and Contrasts",
  similarTo: "is similar to",
  contrastsWith: "contrasts with",
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
      short: "Demo · under review",
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
      short: "Preview · under review",
    },
  },
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

/** The museum view (location fallback and the scene region's name). */
export const MUSEUM_TEXT = { museum: "Museum", sceneLabel: "Museum" } as const;

/** The information panel's own wording (knowledge text is never written here). */
export const PANEL_TEXT = {
  panelLabel: "Exhibit information",
  notInSnapshot: "This concept is not in the current snapshot.",
} as const;

/** "In this room" (the room contents list). */
export const ROOM_TEXT = { label: "In this room", doorways: "Doorways", dismiss: "Dismiss" } as const;

/** The minimap and the full plan dialog (DESIGN.md 11.6). */
export const PLAN_TEXT = {
  plan: "Plan",
  expand: "Expand plan",
  youAreHere: "You Are Here",
  title: "Museum Plan",
  description: "Rooms are numbered on the plan. Select a room to walk there.",
  roomsLabel: "Rooms",
  walkTo: (room: string) => `Walk to ${room}`,
  close: "Close",
} as const;

/** The museum's full-scene screens (StateMessage layout, DESIGN.md 9.7, 11.6). */
export const SCREEN_TEXT = {
  loadingTitle: "Preparing the museum",
  loadingLabel: "Loading progress",
  step: (i: number, n: number) => `Step ${i} of ${n}`,
  helpTitle: "Controls",
  helpBack: "Back to the museum",
  pausedTitle: "Paused",
  pausedBody: "The museum is paused. Nothing moves until you resume.",
  resume: "Resume",
  lostTitle: "Restoring the view",
  lostBody: "The graphics card reset. The museum is paused and will continue where you were as soon as the view is restored.",
  failedTitle: "The museum could not load",
  failedBody: "Part of the museum did not load on this device. Your place in the session is kept.",
  technical: "Technical detail:",
  retry: "Try again",
  noWebglTitle: "This device cannot show the 3D museum",
  noWebglBody: (reason: string) => `The museum needs WebGL 2 with hardware graphics, which this browser does not provide (${reason}).`,
  backToExplore: "Back to Explore",
  backToSession: "Back to the session",
  tellResearcher: "Tell the researcher and continue",
  policy: {
    demo: "You can explore the same content in the conventional pages from Explore.",
    retry: "Please try again in an up-to-date Chrome, Edge or Firefox with hardware acceleration switched on. Your session is kept.",
    reassign: "Return to your session: the researcher will continue the study with you.",
    exclude: "Return to your session: the researcher will tell you what happens next.",
  },
  controls: {
    walk: "Walk forward or back",
    turn: "Turn left or right",
    keysOr: "or",
    turnNote: "While mouse look is on, these keys step sideways instead.",
    sprint: "Walk faster",
    sprintHow: "hold with any walking key, for example W or S",
    look: "Look",
    lookHow: "Drag with the mouse or a finger",
    mouseLook: "Look while walking",
    mouseLookHow: "Hold the right mouse button and move the mouse; release to click again",
    freeLook: "Look without holding a button",
    freeLookHow: "Press L or select Mouse look, then move the mouse or touchpad; a click acts on the crosshair. Esc or L to stop",
    go: "Go somewhere",
    goHow: "Click or tap the floor",
    exhibits: "Exhibits",
    exhibitsHow: "Click a wall panel, or use “In this room” to choose one with the keyboard",
    close: "Close a panel",
  },
} as const;
