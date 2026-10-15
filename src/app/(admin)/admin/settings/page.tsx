import { Info } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { ConsolePage } from "@/components/shell/gates";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { titleCase } from "@/lib/text/title-case";
import { effectiveSettings } from "@/server/admin/settings";
import { requirePermission } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Settings" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page() {
  return (
    <ConsolePage
      path="/admin/settings"
      title="Settings"
      description="Effective platform configuration. These values are fixed by the deployment (environment variables) or by code; changing one is a deployment change, not an action in this console. Secrets are never shown."
    >
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Settings />
      </Suspense>
    </ConsolePage>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/*
 * DESIGN.md 11.11: settings in sections under `text-label` running heads. There is no settings
 * table (src/server/admin/settings.ts): every value is read-only here, so the page has no form,
 * no "Save changes" bar and no Danger zone. A save bar or a destructive control that did nothing
 * would misstate what this console can do (DESIGN.md 13). The note below says so in words.
 */
async function Settings() {
  const actor = await requirePermission("admin.settings");
  const groups = effectiveSettings(actor);
  return (
    <div className="flex max-w-5xl flex-col gap-10">
      <Alert variant="info" role="note">
        <Info aria-hidden="true" />
        <AlertTitle>Note: read-only</AlertTitle>
        <AlertDescription>
          Nothing on this page can be changed or saved from the console. To change a value, change the environment variable or the source file named in its row and
          redeploy.
        </AlertDescription>
      </Alert>
      {groups.map((g) => (
        <section key={g.title} aria-labelledby={`s-${slug(g.title)}`} className="flex flex-col">
          <h2 id={`s-${slug(g.title)}`} className="text-h3 border-b border-b-rule-strong pb-2 text-ink">
            {titleCase(g.title)}
          </h2>
          <dl className="flex flex-col">
            {g.items.map((i) => (
              <div
                key={i.label}
                className="grid min-h-11 gap-x-6 gap-y-1 border-b border-b-rule py-3 md:grid-cols-[15rem_minmax(0,1fr)_minmax(0,16rem)] md:items-baseline"
              >
                <dt className="text-[0.9375rem] leading-6 font-semibold text-ink">{i.label}</dt>
                <dd className="text-value [overflow-wrap:anywhere]">{i.value}</dd>
                <dd className="text-id text-ink-3 [overflow-wrap:anywhere] md:text-right">
                  <span className="sr-only">Source: </span>
                  {i.source}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
