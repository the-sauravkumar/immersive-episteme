"use client";

/**
 * Every in-condition link of the 2D pages. Before the router navigates it records how the next
 * page is entered (`via`) and, when the link is a typed relationship, logs
 * `relationship_followed` (relationship id, type code, from/to concept, forward or inverse),
 * the 2D counterpart of following a path or portal in 3D (EVT-07/14). Card and list selections
 * log `content_item_selected` (EVT-03).
 */
import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";

import type { EntryVia } from "../visit-store";

import { useVisitStore } from "./session";
import { useStableTracker } from "./use-stable-tracker";

export interface FollowedRelationship {
  relationshipId: string;
  typeCode: string;
  fromConceptId: string;
  toConceptId: string;
  direction: "forward" | "inverse";
}

export type TrackedLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  via?: EntryVia;
  relationship?: FollowedRelationship;
  /** A concept card or list item selection. */
  item?: { conceptId?: string; traditionId?: string; elementKind: string };
  pageId?: string;
};

export function TrackedLink({ via = "navigation", relationship, item, pageId, onClick, ...props }: TrackedLinkProps) {
  const tracker = useStableTracker();
  const visits = useVisitStore();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    // A modified click opens another tab: this page is not left, so nothing is recorded.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    visits.setPendingVia(relationship ? "link" : via);
    const where = pageId ? { roomOrPageId: pageId } : {};
    if (relationship) {
      void tracker.relationshipFollowed({
        ...where,
        conceptId: relationship.fromConceptId,
        target: relationship.relationshipId,
        metadata: {
          relationshipId: relationship.relationshipId,
          relationshipTypeCode: relationship.typeCode,
          fromConceptId: relationship.fromConceptId,
          toConceptId: relationship.toConceptId,
          direction: relationship.direction,
        },
      });
    }
    if (item) {
      void tracker.contentItemSelected({
        ...where,
        ...(item.conceptId ? { conceptId: item.conceptId } : {}),
        ...(item.traditionId ? { traditionId: item.traditionId } : {}),
        metadata: { elementKind: item.elementKind },
      });
    }
  };
  return <Link {...props} onClick={handle} />;
}
