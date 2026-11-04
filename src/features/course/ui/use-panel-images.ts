"use client";

import { useEffect, useState } from "react";

export type ImageStatus = "loading" | "ready" | "missing";

const SETTLE_LIMIT_MS = 12000;
const known = new Map<string, Exclude<ImageStatus, "loading">>();

function load(src: string): Promise<Exclude<ImageStatus, "loading">> {
  const cached = known.get(src);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const image = new Image();
    const settle = (status: Exclude<ImageStatus, "loading">) => {
      known.set(src, status);
      resolve(status);
    };
    image.onload = () => settle("ready");
    image.onerror = () => settle("missing");
    image.src = src;
  });
}

export function preloadImages(sources: readonly string[]): void {
  for (const src of sources) void load(src);
}

export interface PanelImages {
  readonly status: (src: string) => ImageStatus;
  readonly settled: boolean;
}

export function usePanelImages(sources: readonly string[]): PanelImages {
  const signature = sources.join("|");
  const [results, setResults] = useState<ReadonlyMap<string, Exclude<ImageStatus, "loading">>>(new Map());
  const [timedOutSignature, setTimedOutSignature] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const wanted = signature === "" ? [] : signature.split("|");
    for (const src of wanted) {
      void load(src).then((status) => {
        if (active) setResults((current) => new Map(current).set(src, status));
      });
    }
    const timer = window.setTimeout(() => {
      if (active) setTimedOutSignature(signature);
    }, SETTLE_LIMIT_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [signature]);

  return {
    status: (src) => results.get(src) ?? "loading",
    settled: timedOutSignature === signature || sources.every((src) => results.has(src)),
  };
}
