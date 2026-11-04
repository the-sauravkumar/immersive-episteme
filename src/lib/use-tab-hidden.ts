import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

export function useTabHidden(): boolean {
  return useSyncExternalStore(subscribe, () => document.visibilityState === "hidden", () => false);
}
