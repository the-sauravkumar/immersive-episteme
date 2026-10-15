"use client";

/**
 * Researcher item editor: the fields shown depend on the item kind. Everything typed here is
 * researcher-authored content; the platform supplies none. Answer keys are the scoring rule of
 * keyed items (choice and numeric); free-text items are scored with rubrics.
 */
import { useState } from "react";

import { ASSESSMENT_ITEM_KINDS } from "@/lib/validation/enums";
import type { ActionResult } from "@/server/assessment/research-actions";

import { ActionForm, checkBoxClass, checkRowClass, Field, fieldClass } from "./action-form";
import { NativeSelect } from "@/components/ui/native-select";

export interface ItemFormValue {
  id?: string;
  itemKey: string;
  position: number;
  kind: string;
  prompt: string;
  config: Record<string, unknown>;
  answerKey: unknown;
}

const KIND_LABEL: Record<string, string> = {
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  short_text: "Short text",
  long_text: "Long text",
  likert: "Rating scale",
  numeric: "Number",
  ranking: "Ranking",
  concept_map: "Concept map",
};

const asOptions = (c: Record<string, unknown>) =>
  Array.isArray(c.options) ? (c.options as Array<{ id: string; label: string }>).map((o) => `${o.id}: ${o.label}`).join("\n") : "";

export function ItemForm({
  action,
  value,
  relationshipTypes,
  allowedKinds,
  submitLabel,
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  value: ItemFormValue;
  relationshipTypes: Array<{ code: string; label: string }>;
  allowedKinds?: readonly string[];
  submitLabel: string;
}) {
  const [kind, setKind] = useState(value.kind);
  const c = value.config;
  const key = (value.answerKey ?? {}) as { optionId?: string; optionIds?: string[]; value?: number; tolerance?: number };
  const kinds = allowedKinds ?? ASSESSMENT_ITEM_KINDS;
  return (
    <ActionForm action={action} submitLabel={submitLabel} resetOnSuccess={!value.id}>
      {value.id ? <input type="hidden" name="id" value={value.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Item key" hint="e.g. pre.q1">
          <input name="itemKey" required defaultValue={value.itemKey} pattern="[a-z0-9][a-z0-9_.\-]{0,63}" className={fieldClass} />
        </Field>
        <Field label="Position (0 or more)">
          <input name="position" type="text" inputMode="numeric" pattern="[0-9]*" required defaultValue={value.position} className={fieldClass} />
        </Field>
        <Field label="Kind">
          <NativeSelect name="kind" value={kind} onChange={(e) => setKind(e.target.value)} required>
            <option value="" disabled>
              Choose…
            </option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k] ?? k}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Prompt">
        <textarea name="prompt" required rows={3} maxLength={4000} defaultValue={value.prompt} className={fieldClass} />
      </Field>

      {kind === "single_choice" || kind === "multiple_choice" || kind === "ranking" ? (
        <>
          <Field label="Options" hint="One per line as 'id: label', e.g. 'a: First option'.">
            <textarea name="options" required rows={4} defaultValue={asOptions(c)} className={fieldClass} />
          </Field>
          {kind !== "ranking" ? (
            <label className={checkRowClass}>
              <input type="checkbox" name="shuffle" defaultChecked={c.shuffle === true} className={checkBoxClass} /> Shuffle option order
            </label>
          ) : null}
          {kind === "multiple_choice" ? (
            <Field label="Maximum selections (optional)">
              <input name="maxSelections" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={typeof c.maxSelections === "number" ? c.maxSelections : ""} className={fieldClass} />
            </Field>
          ) : null}
          {kind === "single_choice" ? (
            <Field label="Answer key (optional)" hint="The id of the correct option.">
              <input name="answerKey" defaultValue={key.optionId ?? ""} className={fieldClass} />
            </Field>
          ) : null}
          {kind === "multiple_choice" ? (
            <Field label="Answer key (optional)" hint="Comma-separated ids of all correct options; scored as an exact set match.">
              <input name="answerKey" defaultValue={key.optionIds?.join(", ") ?? ""} className={fieldClass} />
            </Field>
          ) : null}
        </>
      ) : null}

      {kind === "short_text" || kind === "long_text" ? (
        <Field label="Maximum length (characters)" hint="Free-text answers are scored by raters with a rubric.">
          <input name="maxLength" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={typeof c.maxLength === "number" ? c.maxLength : ""} className={fieldClass} />
        </Field>
      ) : null}

      {kind === "likert" ? (
        <>
          <Field label="Number of points (2 to 11)">
            <input name="points" type="text" inputMode="numeric" pattern="[0-9]*" required defaultValue={typeof c.points === "number" ? c.points : ""} className={fieldClass} />
          </Field>
          <Field label="Anchors" hint="One per line as 'point: label'.">
            <textarea
              name="anchors"
              rows={3}
              defaultValue={Object.entries((c.anchors as Record<string, string> | undefined) ?? {})
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n")}
              className={fieldClass}
            />
          </Field>
        </>
      ) : null}

      {kind === "numeric" ? (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {(["min", "max", "step"] as const).map((k) => (
            <Field key={k} label={k[0]!.toUpperCase() + k.slice(1)}>
              <input name={k} type="text" inputMode="decimal" pattern="-?[0-9]*([.][0-9]+)?" defaultValue={typeof c[k] === "number" ? (c[k] as number) : ""} className={fieldClass} />
            </Field>
          ))}
          <Field label="Correct value">
            <input name="answerValue" type="text" inputMode="decimal" pattern="-?[0-9]*([.][0-9]+)?" defaultValue={key.value ?? ""} className={fieldClass} />
          </Field>
          <Field label="Tolerance">
            <input name="answerTolerance" type="text" inputMode="decimal" pattern="[0-9]*([.][0-9]+)?" defaultValue={key.tolerance ?? ""} className={fieldClass} />
          </Field>
        </div>
      ) : null}

      {kind === "concept_map" ? (
        <>
          <Field label="Concept set" hint="One concept key per line, in the order participants see them (e.g. tradition.material.name). At least two.">
            <textarea
              name="conceptKeys"
              required
              rows={6}
              defaultValue={Array.isArray(c.conceptKeys) ? (c.conceptKeys as string[]).join("\n") : ""}
              className={fieldClass}
            />
          </Field>
          <fieldset className="flex min-w-0 flex-col gap-1">
            <legend className="mb-1 font-sans text-[0.9375rem] leading-5 font-bold text-ink">Relationship types offered (none = untyped links)</legend>
            <div className="grid gap-x-6 sm:grid-cols-2">
              {relationshipTypes.map((t) => (
                <label key={t.code} className={checkRowClass}>
                  <input
                    type="checkbox"
                    name="relationshipTypes"
                    value={t.code}
                    defaultChecked={Array.isArray(c.relationshipTypes) && (c.relationshipTypes as string[]).includes(t.code)}
                    className={checkBoxClass}
                  />
                  <span className="min-w-0">
                    {t.label} <span className="text-id break-all text-ink-3">{t.code}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className={checkRowClass}>
            <input type="checkbox" name="directed" defaultChecked={c.directed !== false} className={checkBoxClass} /> Directed links (symmetric types stay undirected)
          </label>
        </>
      ) : null}
    </ActionForm>
  );
}
