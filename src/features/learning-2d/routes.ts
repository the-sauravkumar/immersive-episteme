/**
 * 2D routes and telemetry page ids. Page ids are what `roomOrPageId` carries for the 2D
 * condition (the 3D condition carries manifest room/element ids). Client-safe.
 */
import type { KnowledgeCategoryCode } from "@/lib/validation/enums";

export const LEARN_2D = "/learn/2d";

export const href2d = {
  catalogue: () => LEARN_2D,
  tradition: (slug: string) => `${LEARN_2D}/traditions/${encodeURIComponent(slug)}`,
  traditionSection: (slug: string, sectionId: string) => `${LEARN_2D}/traditions/${encodeURIComponent(slug)}#section-${sectionId}`,
  concept: (slug: string) => `${LEARN_2D}/concepts/${encodeURIComponent(slug)}`,
  categories: () => `${LEARN_2D}/categories`,
  category: (code: KnowledgeCategoryCode) => `${LEARN_2D}/categories/${code}`,
  comparisons: () => `${LEARN_2D}/comparisons`,
  search: (q?: string) => (q ? `${LEARN_2D}/search?q=${encodeURIComponent(q)}` : `${LEARN_2D}/search`),
  /** Familiarisation practice (D5): content-free, outside the learning pages. */
  practice: (sectionId?: string) => (sectionId ? `${LEARN_2D}/practice#section-${sectionId}` : `${LEARN_2D}/practice`),
};

export const pageId2d = {
  catalogue: () => "catalogue",
  tradition: (slug: string) => `tradition:${slug}`,
  concept: (key: string) => `concept:${key}`,
  categories: () => "categories",
  category: (code: string) => `category:${code}`,
  comparisons: () => "comparisons",
  search: () => "search",
  practice: () => "practice",
};

const SHORT_CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;

/** The value when it fits the telemetry short-identifier format (metadata ids), else undefined. */
export function shortCodeOrUndefined(value: string | null | undefined): string | undefined {
  return value && SHORT_CODE.test(value) ? value : undefined;
}
