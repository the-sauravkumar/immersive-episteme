/**
 * The common epistemic template (requirements digest §3; master spec §6.2) as the 2D section
 * order. Every tradition page renders the same sections in the same order, so traditions are
 * presented identically and no section is promoted for one tradition only.
 *
 * The sections are NOT defined here: they are the one section map shared with the 3D museum
 * (src/features/learning/sections.ts, DR-024), so a tradition's 2D sections and its museum wing
 * rooms have the same order, names and numbers, and every concept sits in the same section in
 * both. This module keeps the 2D names of that map. Client-safe (pure data).
 */
import { KNOWLEDGE_SECTIONS, sectionOfType as sharedSectionOfType, type KnowledgeSection, type KnowledgeSectionId } from "@/features/learning/sections";
import type { ConceptType } from "@/lib/validation/enums";

export type EpistemicSection = KnowledgeSection;

export const EPISTEMIC_SECTIONS = KNOWLEDGE_SECTIONS;

export type EpistemicSectionId = KnowledgeSectionId;

/** The section a concept type is listed under (the `tradition` overview concept opens the context section). */
export function sectionOfType(type: ConceptType): EpistemicSection {
  return sharedSectionOfType(type);
}
