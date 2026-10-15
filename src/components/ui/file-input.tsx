"use client"

import * as React from "react"
import { UploadIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/*
 * File input (DESIGN.md 9.6): the native <input type="file">, visually hidden but focusable and
 * still the form control, behind a 44 px secondary label button ("Choose file"), with a file-name
 * readout as words ("No file chosen" until one is). The focus ring is drawn on the button
 * (globals.css `.ie-file__*`). Keyboard: Tab reaches the input; Enter or Space opens the picker.
 */
function FileInput({
  id,
  buttonLabel = "Choose file",
  className,
  onChange,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { id: string; buttonLabel?: string }) {
  const [names, setNames] = React.useState<string[]>([])
  const ref = React.useRef<HTMLInputElement>(null)
  // A form reset clears the file list, so it clears the readout too.
  React.useEffect(() => {
    const form = ref.current?.form
    if (!form) return
    const clear = () => setNames([])
    form.addEventListener("reset", clear)
    return () => form.removeEventListener("reset", clear)
  }, [])
  return (
    <span data-slot="file-input" className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <span className="relative inline-flex">
        <input
          ref={ref}
          id={id}
          type="file"
          className="ie-file__input absolute inset-0 size-full cursor-pointer opacity-0"
          onChange={(e) => {
            setNames(Array.from(e.currentTarget.files ?? []).map((f) => f.name))
            onChange?.(e)
          }}
          {...props}
        />
        <span
          aria-hidden="true"
          className="ie-file__button pointer-events-none inline-flex h-11 items-center gap-2 rounded-control border-[1.5px] border-ink bg-ground px-5 text-ui text-ink"
        >
          <UploadIcon className="size-5 stroke-[1.75]" />
          {buttonLabel}
        </span>
      </span>
      <span className="text-credit min-w-0 break-words" aria-live="polite">
        {names.length === 0 ? "No file chosen" : names.join(", ")}
      </span>
    </span>
  )
}

export { FileInput }
