"use server";

/**
 * Server actions for knowledge authoring, review and release publishing. Each one:
 * permission (assertPermission via runAction) -> Zod -> service (re-checks, writes, audits).
 */
import type { ActionState } from "@/components/cms/action-state";

import { formObject, runAction } from "./run-action";
import { createConcept, deleteRelationship, saveClaims, saveCuratorNotes, saveRelationship, saveSource, saveTradition, setTraditionSource, updateConcept } from "./knowledge";
import { publishRelease } from "./release";
import {
  conceptCreateSchema,
  conceptUpdateSchema,
  deleteRelationshipSchema,
  notesSchema,
  relationshipSchema,
  releaseSchema,
  saveClaimsSchema,
  sourceSchema,
  traditionSchema,
  traditionSourceSchema,
  transitionSchema,
} from "./schemas";
import { transition } from "./workflow";

const STATE_LABEL: Record<string, string> = {
  under_review: "submitted for review",
  draft: "returned to draft",
  verified: "verified",
  needs_evidence: "marked as needing evidence",
  rejected: "rejected",
  archived: "archived",
};

export async function saveSourceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(["content.draft", "content.edit"], sourceSchema, formObject(fd), async ({ actor, pool }, input) => {
    const r = await saveSource(pool, actor, input);
    return { message: r.created ? "Source created (draft)." : r.returnedToReview ? "Saved. The source was accepted, so it is back under review." : "Saved.", data: { id: r.id } };
  });
}

export async function saveTraditionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(["content.draft", "content.edit"], traditionSchema, formObject(fd), async ({ actor, pool }, input) => {
    const r = await saveTradition(pool, actor, input);
    return { message: r.created ? "Tradition created (draft)." : "Saved.", data: { id: r.id } };
  });
}

export async function traditionSourceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("content.edit", traditionSourceSchema, formObject(fd), async ({ actor, pool }, input) => {
    await setTraditionSource(pool, actor, input);
    return input.remove ? "Source unlinked." : "Source linked.";
  });
}

export async function createConceptAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(["content.draft", "content.edit"], conceptCreateSchema, formObject(fd), async ({ actor, pool }, input) => {
    const r = await createConcept(pool, actor, input);
    return { message: `Concept ${r.key} created (draft). Add its claims next.`, data: { id: r.id, key: r.key, href: `/cms/concepts/${r.id}`, hrefLabel: "Open the new concept" } };
  });
}

export async function updateConceptAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("content.edit", conceptUpdateSchema, formObject(fd), async ({ actor, pool }, input) => {
    await updateConcept(pool, actor, input);
    return "Saved.";
  });
}

export async function saveClaimsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("content.edit", saveClaimsSchema, formObject(fd), async ({ actor, pool }, input) => {
    await saveClaims(pool, actor, input.conceptId, input.claims);
    return "Claims saved; the learner summary and body were regenerated from them.";
  });
}

export async function saveNotesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(["content.edit", "content.review"], notesSchema, formObject(fd), async ({ actor, pool }, input) => {
    const r = await saveCuratorNotes(pool, actor, input.conceptId, input.doc);
    return r.returnedToReview ? "Notes saved. The concept was accepted, so it is back under review." : "Notes saved.";
  });
}

export async function saveRelationshipAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("graph.edit", relationshipSchema, formObject(fd), async ({ actor, pool }, input) => {
    const r = await saveRelationship(pool, actor, input);
    return { message: r.created ? "Relationship created (draft)." : "Relationship saved.", data: { id: r.id } };
  });
}

export async function deleteRelationshipAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("graph.edit", deleteRelationshipSchema, formObject(fd), async ({ actor, pool }, input) => {
    await deleteRelationship(pool, actor, input.relationshipId);
    return "Relationship deleted.";
  });
}

export async function transitionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(["content.draft", "content.edit", "content.review", "content.verify"], transitionSchema, formObject(fd), async ({ actor, pool }, input) => {
    const r = await transition(pool, actor, input);
    return `Item ${STATE_LABEL[r.to] ?? r.to}.`;
  });
}

export async function publishReleaseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("content.publish", releaseSchema, formObject(fd), async ({ actor, pool }, input) => {
    const r = await publishRelease(pool, actor, { versionLabel: input.versionLabel, title: input.title, description: input.description });
    return { message: `Release ${r.versionLabel} published: ${r.itemCount} items, payload sha256 ${r.payloadSha256.slice(0, 12)}….`, data: { id: r.id } };
  });
}
