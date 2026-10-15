import type { Metadata } from "next";
import { Suspense } from "react";

import {
  CompilePanel,
  ManifestList,
  ManifestOverview,
  OverridesPanel,
  PublishPanel,
  TraceabilityInspector,
  ValidationReport,
} from "@/components/cms/spatial/studio";
import { ConsolePage } from "@/components/shell/gates";
import { Skeleton } from "@/components/ui/skeleton";
import { can } from "@/lib/permissions/can";
import { requirePermission } from "@/server/auth/staff";
import { listCompilableSnapshots, listManifests, loadManifestDetail, snapshotTraditions } from "@/server/cms/spatial/queries";
import { getPool } from "@/server/db/client";

export const metadata: Metadata = { title: "Spatial Compiler" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v) || undefined;

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ searchParams }: PageProps<"/cms/spatial">) {
  return (
    <ConsolePage
      path="/cms/spatial"
      title="Spatial compiler"
      description="Compile the knowledge graph into a museum layout, inspect why every element is where it is, record audited overrides and publish layouts for studies."
    >
      <Suspense fallback={<StudioSkeleton />}>
        <Studio searchParams={searchParams} />
      </Suspense>
    </ConsolePage>
  );
}

function StudioSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

async function Studio({ searchParams }: { searchParams: Promise<Search> }) {
  const principal = await requirePermission(["spatial.compile", "spatial.publish", "spatial.override"]);
  const perms = { compile: can(principal, "spatial.compile"), override: can(principal, "spatial.override"), publish: can(principal, "spatial.publish") };
  const sp = await searchParams;
  const pool = getPool();
  const snapshotId = one(sp.snapshot) ?? null;
  const manifestId = one(sp.manifest) ?? null;

  const [snapshots, manifests, traditions, detail] = await Promise.all([
    perms.compile ? listCompilableSnapshots(pool) : Promise.resolve([]),
    listManifests(pool),
    perms.compile && snapshotId ? snapshotTraditions(pool, snapshotId) : Promise.resolve([]),
    manifestId ? loadManifestDetail(pool, manifestId) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {perms.compile ? <CompilePanel snapshots={snapshots} selected={snapshotId} traditions={traditions} /> : null}
      <ManifestList manifests={manifests} selected={detail?.summary.id ?? null} />
      {manifestId && !detail ? (
        <p role="alert" className="text-body text-danger">
          That manifest does not exist.
        </p>
      ) : null}
      {detail ? (
        <>
          <ManifestOverview d={detail} />
          <ValidationReport d={detail} />
          <TraceabilityInspector
            d={detail}
            filter={{ kind: one(sp.kind), room: one(sp.room), q: one(sp.q) }}
            elementId={one(sp.element) ?? null}
            canOverride={perms.override}
          />
          {perms.override || detail.overrides.length > 0 ? <OverridesPanel d={detail} perms={perms} /> : null}
          {perms.publish ? <PublishPanel d={detail} /> : null}
        </>
      ) : null}
    </div>
  );
}
