"use client";

import { useId, useState, type ReactNode } from "react";

import { FieldMessage } from "@/components/cms/action-form";
import { CHECK_BOX, CHECK_ROW, NativeSelect, PROVENANCE_LABELS } from "@/components/cms/bits";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { altTextProblem, ALT_TARGET_WORDS, captionProblem, countWords, FIGURE_CAPTION_MAX } from "@/features/media/contracts";
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
        <div id={hintId} className="t-s text-lime-dim flex flex-col gap-0.5">
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
  isImage?: boolean;
  sources: { id: string; label: string }[];
}) {
  const [decorative, setDecorative] = useState(defaults.altText === "");
  const [alt, setAlt] = useState(defaults.altText ?? "");
  const [caption, setCaption] = useState(defaults.caption ?? "");
  const decorativeId = useId();
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
            live={decorative ? null : altIssue ? <span className="text-madder-text">{altIssue}</span> : `${words} word${words === 1 ? "" : "s"}.`}
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
        live={isImage ? captionIssue ? <span className="text-madder-text">{captionIssue}</span> : `${chars} of ${FIGURE_CAPTION_MAX} characters.` : null}
      >
        {(id, d) => (
          <Textarea id={id} name="caption" rows={2} maxLength={2000} required={isImage && !decorative} aria-describedby={d} value={caption} onChange={(e) => setCaption(e.target.value)} />
        )}
      </Row>

      <fieldset className="flex min-w-0 flex-col gap-4 border-t border-lime-dim pt-3 md:col-span-2">
        <legend className="t-label float-left mb-1 w-full">Licence</legend>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-4 md:grid-cols-2">
          <Row label="Licence" name="licence" required hint="e.g. CC BY-SA 4.0, or the permission under which it is used.">
            {(id, d) => <Input id={id} name="licence" required maxLength={200} aria-describedby={d} defaultValue={defaults.licence ?? ""} />}
          </Row>
          <Row label="Licence URL" name="licenceUrl">
            {(id) => <Input id={id} name="licenceUrl" type="url" inputMode="url" defaultValue={defaults.licenceUrl ?? ""} />}
          </Row>
        </div>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-4 border-t border-lime-dim pt-3 md:col-span-2">
        <legend className="t-label float-left mb-1 w-full">Provenance (required)</legend>
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
