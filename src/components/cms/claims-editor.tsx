"use client";

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
  sources: { sourceId: string; locator: string; quote?: string; keptPassages?: number }[];
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
      <Disclosure className="t-b border border-lime-dim" summary={<>Learner text generated from these claims</>}>
        <div className="border-t border-line px-3 py-3">
        <p className="t-label">Summary (first claim)</p>
        <p>{preview[0]?.text.trim() || "None yet"}</p>
        <p className="t-label mt-3">Body</p>
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
    <ul className="list-disc pl-5 t-s font-semibold text-madder-text">
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
    <li className="flex flex-col gap-4 border border-line bg-vat p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline">
          <h3 className="t-label text-lime">
            <span className="tabular-nums">{titleCase(`Claim ${index + 1}`)}</span>
          </h3>
          {index === 0 ? <span className="t-s text-lime-dim ml-2 font-sans">also the summary</span> : null}
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
        <p id={`${id}-quote-hint`} className={words > MAX_QUOTE_WORDS ? "t-s font-semibold text-madder-text" : "t-s text-lime-dim"}>
          Copy the words exactly as in the source; mark omissions with … and insertions with [ ].{" "}
          <span className="tabular-nums">
            {words} of {MAX_QUOTE_WORDS} words
          </span>
          {words > MAX_QUOTE_WORDS ? " (too long)" : ""}.
        </p>
      </div>
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-1 t-label text-lime">Citations</legend>
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
        {claim.sources.length > 1 ? (
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            <p id={`${id}-percite-hint`} className="t-s text-lime-dim">
              This claim cites {claim.sources.length} sources, so each citation needs its own verbatim quotation. Leave a field empty only if the citation already
              has passages imported from content/ (they are kept while the statement, source and locator stay the same).
            </p>
            {claim.sources.map((s, j) => {
              const n = wordCount(s.quote ?? "");
              return (
                <div key={j} className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-cq-${j}`}>{`Quotation from citation ${j + 1}`}</Label>
                  <Textarea
                    id={`${id}-cq-${j}`}
                    value={s.quote ?? ""}
                    onChange={(e) => setSource(j, { quote: e.target.value })}
                    rows={2}
                    aria-describedby={`${id}-percite-hint ${id}-cq-${j}-count`}
                  />
                  <p id={`${id}-cq-${j}-count`} className={n > MAX_QUOTE_WORDS ? "t-s font-semibold text-madder-text" : "t-s text-lime-dim"}>
                    <span className="tabular-nums">
                      {n} of {MAX_QUOTE_WORDS} words
                    </span>
                    {n > MAX_QUOTE_WORDS ? " (too long)" : ""}.
                    {s.keptPassages && !s.quote ? ` ${s.keptPassages} imported passages are stored for this citation and kept while the statement, source and locator stay the same.` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        ) : null}
      </fieldset>
    </li>
  );
}

function ClaimsReadOnly({ claims, keyOf }: { claims: ClaimDraft[]; keyOf: Map<string, string> }) {
  return (
    <ol className="flex flex-col" aria-label="Claims">
      {claims.map((c, i) => (
        <li key={i} className="grid grid-cols-[var(--hang)_minmax(0,1fr)] border-t border-line py-4 first:border-t-0 first:pt-0">
          <span aria-hidden="true" className="t-b font-semibold tabular-nums text-lime-dim text-right pr-3">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="t-b text-lime">{c.text}</p>
            <blockquote className="t-b mt-2 bg-vat-2 px-3 py-2 text-lime">“{c.quote || "no quotation"}”</blockquote>
            <p className="t-s text-lime-dim mt-1">{c.sources.map((s) => `${keyOf.get(s.sourceId) ?? "?"}, ${s.locator || "no locator"}`).join("; ")}</p>
            {c.sources.length > 1 ? (
              <ul className="mt-2 flex flex-col gap-2" aria-label={`Quotations per citation, claim ${i + 1}`}>
                {c.sources.map((s, j) => (
                  <li key={j} className="t-b">
                    <span className="t-label">{`Citation ${j + 1} (${keyOf.get(s.sourceId) ?? "?"})`}</span>
                    <blockquote className="mt-1 bg-vat-2 px-3 py-2 text-lime">
                      {s.quote ? `“${s.quote}”` : s.keptPassages ? `${s.keptPassages} imported passages` : "no quotation"}
                    </blockquote>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
