import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The Apparatus type tokens (DESIGN.md 5.2) are `@utility` classes in globals.css that set
 * font family, size, line height, weight and sometimes colour together. tailwind-merge would
 * otherwise read `text-eyebrow` as a text colour and drop it when a colour class follows
 * (`cn("text-eyebrow", "text-ink")` -> "text-ink"). They form their own group: two type tokens
 * conflict with each other and with nothing else.
 */
export const TYPE_TOKENS = [
  "title",
  "reading",
  "claim-number",
  "quote",
  "lead",
  "h2",
  "h3",
  "eyebrow",
  "source",
  "caption",
  "credit",
  "ui",
  "timer",
  "dl-label",
  "dl-value",
  "display-1",
  "display-2",
  "deck",
  "body",
  "table",
  "stat",
  "mono",
] as const;

const twMerge = extendTailwindMerge<"type-token">({
  extend: {
    classGroups: {
      "type-token": [{ text: [...TYPE_TOKENS] }],
    },
    theme: {
      radius: ["control", "card"],
      shadow: ["console"],
    },
  },
});

/** Merge conditional class names and resolve Tailwind conflicts (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
