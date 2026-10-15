"use client";

/**
 * Structured claim editor. Each claim = one statement + the verbatim evidence quotation + one or
 * more citations, each with a page or locator (docs/research/citation-policy.md). There is no
 * free-prose field: the learner-facing summary and body are generated from these claims on save
 * (content/FORMAT.md claims-only policy); the preview below shows exactly what learners will get.
 */
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { titleCase } from "@/lib/text/title-case";
import { MAX_QUOTE_WORDS, wordCount } from "@/lib/validation/primitives";
import { saveClaimsAction } from "@/server/cms/actions";

import { ActionForm, useFormState } from "./action-form";
import { NativeSelect } from "@/components/ui/native-select";
import { Disclosure } from "@/components/ui/disclosure";

export interface ClaimDraft {
  text: string;
  quote: string;
  sources: { sourceId: string; locator: string }[];
}

export interface SourceChoice {
  id: string;
  label: string;
  key: string;
}

const emptyClaim = (): ClaimDraft => ({ text: "", quote: "", sources: [{ sourceId: "", locator: "" }] });

export function ClaimsEditor({ conceptId, initial, sources, readOnly }: { conceptId: string; initial: ClaimDraft[]; sources: SourceChoice[]; readOnly?: boolean }) {
  const [claims, setClaims] = useState<ClaimDraft[]>(initial.length ? initial : [emptyClaim()]);
  const keyOf = useMemo(() => new Map(sources.map((s) => [s.id, s.key])), [sources]);
  const update = (i: number, next: Partial<ClaimDraft>) => setClaims((cs) => cs.map((c, j) => (j === i ? { ...c, ...next } : c)));
  const move = (i: number, d: -1 | 1) =>
    setClaims((cs) => {
      const j = i + d;
      if (j < 0 || j >= cs.length) return cs;
      const out = [...cs];
      [out[i], out[j]] = [out[j]!, out[i]!];
      return out;
    });
  const preview = claims.filter((c) => c.text.trim());

  if (readOnly) {
    return <ClaimsReadOnly claims={claims} keyOf={keyOf} />;
  }
  return (
    <ActionForm action={saveClaimsAction} submitLabel="Save claims" pendingLabel="Saving claims…">
      <input type="hidden" name="conceptId" value={conceptId} />
      <input type="hidden" name="claims" value={JSON.stringify(claims)} />
      <ClaimErrors />
      <ol className="flex flex-col gap-4" aria-label="Claims">
        {claims.map((c, i) => (
          <ClaimRow
            key={i}
            index={i}
            claim={c}
            count={claims.length}
            sources={sources}
            onChange={(next) => update(i, next)}
            onMove={(d) => move(i, d)}
            onRemove={() => setClaims((cs) => cs.filter((_, j) => j !== i))}
          />
        ))}
      </ol>
      <div>
        <Button type="button" variant="outline" onClick={() => setClaims((cs) => [...cs, emptyClaim()])}>
          Add claim
        </Button>
      </div>
      <Disclosure className="text-body rounded-card border border-rule-strong" summary={<>Learner text generated from these claims</>}>
        <div className="border-t border-rule px-3 py-3">
        <p className="text-label">Summary (first claim)</p>
        <p>{preview[0]?.text.trim() || "None yet"}</p>
        <p className="text-label mt-3">Body</p>
        <div className="flex flex-col gap-2 whitespace-pre-wrap">
          {preview.map((c, i) => (
            <p key={i}>
              {c.text.trim()} [{c.sources.map((s) => keyOf.get(s.sourceId) ?? "?").join(", ")}]
            </p>
          ))}
        </div>
        </div>
      </Disclosure>
    </ActionForm>
  );
}

function ClaimErrors() {
  const state = useFormState();
  const msgs = Object.entries(state?.fieldErrors ?? {}).filter(([k]) => k.startsWith("claims"));
  if (!msgs.length) return null;
  return (
    <ul className="list-disc pl-5 font-sans text-[0.9375rem] leading-5 font-semibold text-danger">
      {msgs.map(([k, m]) => (
        <li key={k}>
          {describePath(k)}: {m.join(" ")}
        </li>
      ))}
    </ul>
  );
}

function describePath(path: string): string {
  const p = path.split(".");
  if (p.length < 2) return "Claims";
  const n = Number(p[1]) + 1;
  if (p[2] === "sources" && p[3] !== undefined) return `Claim ${n}, citation ${Number(p[3]) + 1}${p[4] ? ` (${p[4]})` : ""}`;
  return `Claim ${n}${p[2] ? ` (${p[2]})` : ""}`;
}

function ClaimRow({
  index,
  claim,
  count,
  sources,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  claim: ClaimDraft;
  count: number;
  sources: SourceChoice[];
  onChange: (next: Partial<ClaimDraft>) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const words = wordCount(claim.quote);
  const setSource = (j: number, next: Partial<ClaimDraft["sources"][number]>) => onChange({ sources: claim.sources.map((s, k) => (k === j ? { ...s, ...next } : s)) });
  return (
    <li className="flex flex-col gap-4 rounded-card border border-rule bg-ground p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline">
          {/* The note sits beside the heading, not in it, so the heading stays a Title Case phrase. */}
          <h3 className="text-h3 text-ink">
            <span className="tabular-nums">{titleCase(`Claim ${index + 1}`)}</span>
          </h3>
          {index === 0 ? <span className="text-credit ml-2 font-sans">also the summary</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move claim ${index + 1} up`}>
            Up
          </Button>
          <Button type="button" variant="ghost" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move claim ${index + 1} down`}>
            Down
          </Button>
          <Button type="button" variant="destructive" onClick={onRemove} disabled={count === 1} aria-label={`Remove claim ${index + 1}`}>
            Remove
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-text`}>Statement</Label>
        <Textarea id={`${id}-text`} value={claim.text} onChange={(e) => onChange({ text: e.target.value })} rows={2} required maxLength={4000} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-quote`}>Verbatim evidence quotation</Label>
        <Textarea id={`${id}-quote`} value={claim.quote} onChange={(e) => onChange({ quote: e.target.value })} rows={2} required aria-describedby={`${id}-quote-hint`} />
        <p id={`${id}-quote-hint`} className={words > MAX_QUOTE_WORDS ? "font-sans text-[0.9375rem] leading-5 font-semibold text-danger" : "text-credit"}>
          Copy the words exactly as in the source; mark omissions with … and insertions with [ ].{" "}
          <span className="tabular-nums">
            {words} of {MAX_QUOTE_WORDS} words
          </span>
          {words > MAX_QUOTE_WORDS ? " (too long)" : ""}.
        </p>
      </div>
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-1 font-sans text-[0.9375rem] leading-5 font-bold text-ink">Citations</legend>
        {claim.sources.map((s, j) => (
          <div key={j} className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] md:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-src-${j}`}>Source</Label>
              <NativeSelect
                id={`${id}-src-${j}`}
                value={s.sourceId}
                onChange={(e) => setSource(j, { sourceId: e.target.value })}
                required
              >
                <option value="">Choose a source…</option>
                {sources.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-loc-${j}`}>Page or locator</Label>
              <Input id={`${id}-loc-${j}`} value={s.locator} onChange={(e) => setSource(j, { locator: e.target.value })} placeholder="p. 12 (PDF p. 4)" required maxLength={200} />
            </div>
            <Button type="button" variant="ghost" onClick={() => onChange({ sources: claim.sources.filter((_, k) => k !== j) })} disabled={claim.sources.length === 1} aria-label={`Remove citation ${j + 1} of claim ${index + 1}`}>
              Remove
            </Button>
          </div>
        ))}
        <div>
          <Button type="button" variant="outline" onClick={() => onChange({ sources: [...claim.sources, { sourceId: "", locator: "" }] })}>
            Add citation
          </Button>
        </div>
      </fieldset>
    </li>
  );
}

function ClaimsReadOnly({ claims, keyOf }: { claims: ClaimDraft[]; keyOf: Map<string, string> }) {
  return (
    <ol className="flex flex-col" aria-label="Claims">
      {claims.map((c, i) => (
        <li key={i} className="grid grid-cols-[var(--hang)_minmax(0,1fr)] border-t border-rule py-4 first:border-t-0 first:pt-0">
          <span aria-hidden="true" className="text-claim-number pr-3">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-body text-ink">{c.text}</p>
            <blockquote className="text-body mt-2 bg-sunk px-3 py-2 text-ink">“{c.quote || "no quotation"}”</blockquote>
            <p className="text-credit mt-1">{c.sources.map((s) => `${keyOf.get(s.sourceId) ?? "?"}, ${s.locator || "no locator"}`).join("; ")}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
