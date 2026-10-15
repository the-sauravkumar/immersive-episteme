"use client";

/**
 * The descriptive metadata every asset needs (upload and edit), in the console form skin (DESIGN.md
 * 9.5: 44 px controls, rule-strong borders, surface fill, labels above, help in `text-credit`):
 *  - title, credit, licence, licence URL and provenance (kind plus a source URL or a cited source);
 *  - images: alt text (or an explicit "decorative" choice) and caption, with live counts against the
 *    figure rules of 9.9 (alt text about 15 words and different from the caption; caption at most 180
 *    characters). The server applies the same rules (src/features/media/contracts.ts), so the counts
 *    only help; they never replace the check;
 *  - licence governance (11.10, DR-020): the longest side the licence allows on screen, the last
 *    day of the licence, and the public-plate flag.
 * Plain named inputs, so the values travel as FormData.
 */
import { useId, useState, type ReactNode } from "react";

import { FieldMessage } from "@/components/cms/action-form";
import { CHECK_BOX, CHECK_ROW, NativeSelect, PROVENANCE_LABELS } from "@/components/cms/bits";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { altTextProblem, ALT_TARGET_WORDS, captionProblem, countWords, FIGURE_CAPTION_MAX, STUDY_FIGURE_CAP } from "@/features/media/contracts";
import { PROVENANCE_KINDS } from "@/lib/validation/enums";
import { cn } from "@/lib/utils";

export interface AssetMetadataDefaults {
  title?: string | null;
  altText?: string | null;
  caption?: string | null;
  credit?: string | null;
  licence?: string | null;
  licenceUrl?: string | null;
  sourceUrl?: string | null;
  sourceId?: string | null;
  provenanceKind?: string | null;
  maxPixels?: number | null;
  licenceExpiresOn?: string | null;
  publicPlate?: boolean | null;
}


function Row({
  label,
  name,
  hint,
  children,
  required,
  className,
  live,
}: {
  label: string;
  name: string;
  hint?: ReactNode;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  required?: boolean;
  className?: string;
  /** A live count under the field (polite). */
  live?: ReactNode;
}) {
  const id = useId();
  const hintId = hint || live ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      {children(id, hintId)}
      {hint || live ? (
        <div id={hintId} className="text-credit flex flex-col gap-0.5">
          {hint ? <span>{hint}</span> : null}
          {live ? <span aria-live="polite">{live}</span> : null}
        </div>
      ) : null}
      <FieldMessage name={name} />
    </div>
  );
}

export function AssetMetadataFields({
  defaults = {},
  isImage = true,
  sources,
}: {
  defaults?: AssetMetadataDefaults;
  /** Show the alt-text / decorative controls and the figure rules (images and textures). */
  isImage?: boolean;
  sources: { id: string; label: string }[];
}) {
  const [decorative, setDecorative] = useState(defaults.altText === "");
  const [alt, setAlt] = useState(defaults.altText ?? "");
  const [caption, setCaption] = useState(defaults.caption ?? "");
  const decorativeId = useId();
  const plateId = useId();
  const words = countWords(alt);
  const altIssue = !decorative && alt.trim() ? altTextProblem(alt, caption) : null;
  const captionIssue = captionProblem(caption);
  const chars = caption.trim().length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-4 md:grid-cols-2">
      <Row label="Title" name="title" required>
        {(id) => <Input id={id} name="title" required maxLength={300} defaultValue={defaults.title ?? ""} />}
      </Row>
      <Row
        label="Credit"
        name="credit"
        required={isImage}
        hint={`Author or rights holder exactly as the licence asks, e.g. “© Victoria and Albert Museum, London”.${isImage ? " Printed under every figure; an image without it cannot be verified." : ""}`}
      >
        {(id, d) => <Input id={id} name="credit" required={isImage} maxLength={500} aria-describedby={d} defaultValue={defaults.credit ?? ""} />}
      </Row>

      {isImage ? (
        <div className="flex min-w-0 flex-col gap-1 md:col-span-2">
          <Row
            label="Alt text"
            name="altText"
            required={!decorative}
            hint={`What is visible, in about ${ALT_TARGET_WORDS} words. Never repeat the caption and never add knowledge the claims do not state.`}
            live={decorative ? null : altIssue ? <span className="text-danger">{altIssue}</span> : `${words} word${words === 1 ? "" : "s"}.`}
          >
            {(id, d) => (
              <Textarea
                id={id}
                name="altText"
                rows={2}
                maxLength={1000}
                aria-describedby={d}
                disabled={decorative}
                required={!decorative}
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
              />
            )}
          </Row>
          <label htmlFor={decorativeId} className={CHECK_ROW}>
            <input id={decorativeId} type="checkbox" name="decorative" className={CHECK_BOX} checked={decorative} onChange={(e) => setDecorative(e.target.checked)} />
            Purely decorative (no alt text; screen readers skip it). Never for a study figure.
          </label>
        </div>
      ) : null}

      <Row
        label="Caption"
        name="caption"
        required={isImage && !decorative}
        className={isImage ? "md:col-span-2" : undefined}
        hint={isImage ? "A study figure's caption restates or points to its anchor claim; it never adds knowledge." : undefined}
        live={isImage ? captionIssue ? <span className="text-danger">{captionIssue}</span> : `${chars} of ${FIGURE_CAPTION_MAX} characters.` : null}
      >
        {(id, d) => (
          <Textarea id={id} name="caption" rows={2} maxLength={2000} required={isImage && !decorative} aria-describedby={d} value={caption} onChange={(e) => setCaption(e.target.value)} />
        )}
      </Row>

      <fieldset className="flex min-w-0 flex-col gap-4 border-t-2 border-ink pt-3 md:col-span-2">
        <legend className="text-eyebrow float-left mb-1 w-full">Licence</legend>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-4 md:grid-cols-2">
          <Row label="Licence" name="licence" required hint="e.g. CC BY-SA 4.0, or the permission under which it is used.">
            {(id, d) => <Input id={id} name="licence" required maxLength={200} aria-describedby={d} defaultValue={defaults.licence ?? ""} />}
          </Row>
          <Row label="Licence URL" name="licenceUrl">
            {(id) => <Input id={id} name="licenceUrl" type="url" inputMode="url" defaultValue={defaults.licenceUrl ?? ""} />}
          </Row>
          <Row label="Max pixels (long edge)" name="maxPixels" hint={`The longest side the licence allows on screen; empty when it sets none. Study figures are shown at ${STUDY_FIGURE_CAP} px at most.`}>
            {(id, d) => <Input id={id} name="maxPixels" type="number" inputMode="numeric" min={1} max={100000} step={1} aria-describedby={d} defaultValue={defaults.maxPixels ?? ""} className="tabular-nums" />}
          </Row>
          <Row label="Licence expiry" name="licenceExpiresOn" hint="The last day the licence permits use; empty when it does not expire. Expired figures are no longer served.">
            {(id, d) => <Input id={id} name="licenceExpiresOn" type="date" aria-describedby={d} defaultValue={defaults.licenceExpiresOn ?? ""} className="tabular-nums" />}
          </Row>
        </div>
        {isImage ? (
          <label htmlFor={plateId} className={CHECK_ROW}>
            <input id={plateId} type="checkbox" name="publicPlate" className={CHECK_BOX} defaultChecked={defaults.publicPlate ?? false} />
            Cleared for public-page plates as well (only when the licence allows promotional and home-page use).
          </label>
        ) : null}
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-4 border-t-2 border-ink pt-3 md:col-span-2">
        <legend className="text-eyebrow float-left mb-1 w-full">Provenance (required)</legend>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-4 md:grid-cols-2">
          <Row label="Provenance kind" name="provenanceKind" required className="md:col-span-2">
            {(id) => (
              <NativeSelect id={id} name="provenanceKind" required defaultValue={defaults.provenanceKind ?? ""}>
                <option value="" disabled>
                  Choose…
                </option>
                {PROVENANCE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PROVENANCE_LABELS[k]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Row>
          <Row label="Source URL" name="sourceUrl" hint="The record page the file was obtained from.">
            {(id, d) => <Input id={id} name="sourceUrl" type="url" inputMode="url" aria-describedby={d} defaultValue={defaults.sourceUrl ?? ""} />}
          </Row>
          <Row label="Cited source" name="sourceId" hint="Or a source from the knowledge base.">
            {(id, d) => (
              <NativeSelect id={id} name="sourceId" aria-describedby={d} defaultValue={defaults.sourceId ?? ""}>
                <option value="">None</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Row>
        </div>
      </fieldset>
    </div>
  );
}
