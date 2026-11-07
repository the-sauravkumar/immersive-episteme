import * as React from "react"
import { cn } from "@/lib/utils"

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
  hideLegend?: boolean
  className?: string
  required?: boolean
}) {
  return (
    <fieldset data-slot="segmented" className={cn("flex min-w-0 flex-col gap-2", className)}>
      <legend className={cn("t-label mb-2", hideLegend && "sr-only")}>{legend}</legend>
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
