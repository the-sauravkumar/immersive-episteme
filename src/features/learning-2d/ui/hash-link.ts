"use client";

/**
 * In-page section links of the 2D pages (`/learn/2d/traditions/<slug>#section-<id>`): a section
 * disclosure opens itself on `hashchange`, but the router changes the URL of the page already shown
 * without one. `announceHash` waits (at most about a second) for the router to set the hash and
 * then dispatches the event; `useLocationHash` reads the hash and follows those events.
 */
import { useSyncExternalStore } from "react";

export function announceHash(href: string, pathname: string): void {
  const [path, hash] = href.split("#");
  if (!hash || path !== pathname) return;
  const announce = (framesLeft: number) => {
    if (window.location.hash === `#${hash}`) window.dispatchEvent(new HashChangeEvent("hashchange"));
    else if (framesLeft > 0) window.requestAnimationFrame(() => announce(framesLeft - 1));
  };
  window.requestAnimationFrame(() => announce(60));
}

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  window.addEventListener("popstate", cb);
  return () => {
    window.removeEventListener("hashchange", cb);
    window.removeEventListener("popstate", cb);
  };
};

/** The URL hash ("" on the server and when there is none). */
export function useLocationHash(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
}
