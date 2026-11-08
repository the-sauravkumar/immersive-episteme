"use client";

import dynamic from "next/dynamic";

export const LazyMapCanvas = dynamic(() => import("./map-canvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <div className="h-[32rem] w-full border border-lime-dim bg-vat-2" aria-hidden />,
});

export const PARTICIPANT_MAP_WIDTH = "[--bw:min(72rem,calc(100vw-2rem))] xs:[--bw:min(72rem,calc(100vw-3rem))] w-[max(100%,var(--bw))]";
