"use client";

/**
 * Create / edit a typed, directed relationship. The type comes from the relationship-type
 * registry (semantics shown so causal, sequential and associative links are never conflated);
 * ordinals only for ordered (sequential) types; every citation needs a page/locator and a
 * verbatim quotation. Server-side: saveRelationshipAction -> saveRelationship (graph.edit).
 */
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveRelationshipAction } from "@/server/cms/actions";

import { ActionForm, FieldMessage, PrefixErrors } from "./action-form";
import { NativeSelect } from "@/components/ui/native-select";

export interface ConceptChoice {
  id: string;
  key: string;
  title: string;
}
export interface TypeChoice {
  code: string;
  label: string;
  semantics: string;
  ordered: boolean;
  directed: boolean;
  requiresEvidence: boolean;
  description: string;
}
export interface RelationshipInitial {
  id: string;
  sourceConceptId: string;
  targetConceptId: string;
  typeCode: string;
  explanation: string | null;
  conditions: string | null;
  ordinal: number | null;
  strength: number | null;
  provenanceKind: string;
  sources: { sourceId: string; locator: string; quote: string }[];
}

const PROVENANCE = ["practitioner_testimony", "historical_documentation", "scientific_evidence", "researcher_interpretation", "hypothesis"] as const;

export function RelationshipForm({
  concepts,
  types,
  sources,
  initial,
  source,
  target,
  onSourceChange,
  onTargetChange,
}: {
  concepts: ConceptChoice[];
  types: TypeChoice[];
  sources: { id: string; label: string }[];
  initial?: RelationshipInitial;
  /** Controlled endpoints (graph workspace); uncontrolled when omitted. */
  source?: string;
  target?: string;
  onSourceChange?: (id: string) => void;
  onTargetChange?: (id: string) => void;
}) {
  const id = useId();
  const [src, setSrc] = useState(initial?.sourceConceptId ?? "");
  const [tgt, setTgt] = useState(initial?.targetConceptId ?? "");
  const [type, setType] = useState(initial?.typeCode ?? types[0]?.code ?? "");
  const [cites, setCites] = useState(initial?.sources ?? []);
  const s = source ?? src;
  const t = target ?? tgt;
  const def = types.find((x) => x.code === type);
  const setCite = (i: number, next: Partial<(typeof cites)[number]>) => setCites((cs) => cs.map((c, j) => (j === i ? { ...c, ...next } : c)));

  return (
    <ActionForm action={saveRelationshipAction} submitLabel={initial ? "Save relationship" : "Create relationship"} resetOnSuccess={!initial}>
      <input type="hidden" name="relationshipId" value={initial?.id ?? ""} />
      <input type="hidden" name="sources" value={JSON.stringify(cites)} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-src`}>From (source concept)</Label>
          <NativeSelect id={`${id}-src`} name="sourceConceptId" value={s} required onChange={(e) => (onSourceChange ? onSourceChange(e.target.value) : setSrc(e.target.value))}>
            <option value="">Choose…</option>
            {concepts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} — {c.key}
              </option>
            ))}
          </NativeSelect>
          <FieldMessage name="sourceConceptId" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-tgt`}>To (target concept)</Label>
          <NativeSelect id={`${id}-tgt`} name="targetConceptId" value={t} required onChange={(e) => (onTargetChange ? onTargetChange(e.target.value) : setTgt(e.target.value))}>
            <option value="">Choose…</option>
            {concepts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} — {c.key}
              </option>
            ))}
          </NativeSelect>
          <FieldMessage name="targetConceptId" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-type`}>Relationship type</Label>
          <NativeSelect id={`${id}-type`} name="typeCode" value={type} onChange={(e) => setType(e.target.value)} aria-describedby={`${id}-type-hint`}>
            {types.map((x) => (
              <option key={x.code} value={x.code}>
                {x.code} ({x.semantics}{x.directed ? "" : ", undirected"})
              </option>
            ))}
          </NativeSelect>
          <p id={`${id}-type-hint`} className="text-credit">
            {def ? `“${def.label}”: ${def.description}${def.requiresEvidence ? " Requires a cited source." : ""}` : null}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-prov`}>Provenance kind</Label>
          <NativeSelect id={`${id}-prov`} name="provenanceKind" defaultValue={initial?.provenanceKind ?? "historical_documentation"}>
            {PROVENANCE.map((p) => (
              <option key={p} value={p}>
                {p.replace(/_/g, " ")}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor={`${id}-expl`}>Explanation (why the relation holds)</Label>
          <Textarea id={`${id}-expl`} name="explanation" rows={2} defaultValue={initial?.explanation ?? ""} maxLength={4000} />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor={`${id}-cond`}>Conditions (qualifications; name a loop/repeat here for repeated steps)</Label>
          <Textarea id={`${id}-cond`} name="conditions" rows={2} defaultValue={initial?.conditions ?? ""} maxLength={4000} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-ord`}>Order in the sequence {def?.ordered ? "" : "(only for ordered types)"}</Label>
          <Input id={`${id}-ord`} name="ordinal" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={initial?.ordinal ?? ""} disabled={!def?.ordered} />
          <FieldMessage name="ordinal" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-str`}>Strength, 0 to 1 (optional)</Label>
          <Input id={`${id}-str`} name="strength" type="text" inputMode="decimal" pattern="[0-9]*([.][0-9]+)?" defaultValue={initial?.strength ?? ""} />
        </div>
      </div>
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-1 font-sans text-[0.9375rem] leading-5 font-bold text-ink">Evidence</legend>
        {cites.length === 0 ? <p className="text-body text-ink-3">No citation yet.</p> : null}
        {cites.map((c, i) => (
          <div key={i} className="grid gap-3 rounded-card border border-rule bg-ground p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-cs-${i}`}>Source</Label>
              <NativeSelect id={`${id}-cs-${i}`} value={c.sourceId} onChange={(e) => setCite(i, { sourceId: e.target.value })} required>
                <option value="">Choose…</option>
                {sources.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-cl-${i}`}>Page or locator</Label>
              <Input id={`${id}-cl-${i}`} value={c.locator} onChange={(e) => setCite(i, { locator: e.target.value })} placeholder="p. 12 (PDF p. 4)" required />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label htmlFor={`${id}-cq-${i}`}>Verbatim quotation</Label>
              <Textarea id={`${id}-cq-${i}`} value={c.quote} onChange={(e) => setCite(i, { quote: e.target.value })} rows={2} required />
            </div>
            <div>
              <Button type="button" variant="ghost" onClick={() => setCites((cs) => cs.filter((_, j) => j !== i))}>
                Remove citation {i + 1}
              </Button>
            </div>
          </div>
        ))}
        <PrefixErrors prefix="sources" describe={(k) => { const p = k.split("."); return p[1] !== undefined ? `Citation ${Number(p[1]) + 1}${p[2] ? ` (${p[2]})` : ""}` : "Evidence"; }} />
        <div>
          <Button type="button" variant="outline" onClick={() => setCites((cs) => [...cs, { sourceId: "", locator: "", quote: "" }])}>
            Add citation
          </Button>
        </div>
      </fieldset>
    </ActionForm>
  );
}
