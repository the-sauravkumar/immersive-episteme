export const MAX_ASSET_BYTES = 500 * 1024 * 1024;

export const FIGURE_CAPTION_MAX = 180;
export const ALT_TARGET_WORDS = 15;
const ALT_MIN_WORDS = 8;
const ALT_MAX_WORDS = 30;

export const countWords = (s: string): number => s.trim().split(/\s+/u).filter(Boolean).length;
const normaliseText = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function altTextProblem(alt: string, caption: string | null | undefined): string | null {
  const words = countWords(alt);
  if (words < ALT_MIN_WORDS) return `Alt text is ${words} word${words === 1 ? "" : "s"}; describe what is visible in about ${ALT_TARGET_WORDS} words (at least ${ALT_MIN_WORDS}).`;
  if (words > ALT_MAX_WORDS) return `Alt text is ${words} words; keep it to about ${ALT_TARGET_WORDS} (at most ${ALT_MAX_WORDS}).`;
  if (caption && normaliseText(alt) === normaliseText(caption)) return "Alt text must not repeat the caption: describe what is visible instead.";
  return null;
}

export function captionProblem(caption: string | null | undefined): string | null {
  if (caption && caption.trim().length > FIGURE_CAPTION_MAX) return `Captions are at most ${FIGURE_CAPTION_MAX} characters (this one has ${caption.trim().length}).`;
  return null;
}
