import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * Segmented control (DESIGN.md 9.3): a fieldset of native radios, visually hidden but focusable,
 * with the focus ring and the checked state drawn on the label (globals.css `.ie-segmented`).
 * Options are at least 44 px tall with 1 px --rule dividers and a 4 px outer radius. Checked is an
 * --indigo fill with an --on-indigo label at 700; the bold width is reserved, so nothing moves.
 * Forced colours show the radios and outline the checked option in Highlight.
 *
 * Use it when every option fits on one line at 390 px; otherwise use NativeSelect. Server-safe:
 * uncontrolled (`defaultValue`) in forms, or controlled (`value` + `onValueChange`) in a client.
 */
type Option = { value: string; label: string; disabled?: boolean }

function Segmented({
  legend,
  name,
  options,
  value,
  defaultValue,
  onValueChange,
  hideLegend = false,
  className,
  required,
}: {
  legend: React.ReactNode
  name: string
  options: readonly Option[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** The legend stays in the accessibility tree; hide it only when a visible label sits beside it. */
  hideLegend?: boolean
  className?: string
  required?: boolean
}) {
  return (
    <fieldset data-slot="segmented" className={cn("flex min-w-0 flex-col gap-2", className)}>
      <legend className={cn("text-label mb-2", hideLegend && "sr-only")}>{legend}</legend>
      <div className="ie-segmented">
        {options.map((o) => (
          <label key={o.value} className="ie-segmented__option">
            <input
              type="radio"
              className="ie-segmented__input"
              name={name}
              value={o.value}
              disabled={o.disabled}
              required={required}
              {...(value !== undefined
                ? { checked: value === o.value, onChange: () => onValueChange?.(o.value) }
                : { defaultChecked: defaultValue === o.value })}
            />
            <span className="ie-segmented__label" data-label={o.label}>
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export { Segmented }
