import type { Metadata } from "next";
import { Suspense } from "react";

import { MediaLibrary } from "@/components/cms/media/media-library";
import { ConsolePage } from "@/components/shell/gates";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Media" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ searchParams }: PageProps<"/cms/media">) {
  return (
    <ConsolePage
      path="/cms/media"
      title="Media"
      description="Upload checksummed, licensed media with alt text and provenance; review assets and imported media candidates."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <MediaLibrary searchParams={searchParams} />
      </Suspense>
    </ConsolePage>
  );
}
