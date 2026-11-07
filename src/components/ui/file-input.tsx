"use client"

import * as React from "react"
import { UploadIcon } from "lucide-react"
import { cn } from "@/lib/utils"

function FileInput({
  id,
  buttonLabel = "Choose file",
  className,
  onChange,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { id: string; buttonLabel?: string }) {
  const [names, setNames] = React.useState<string[]>([])
  const ref = React.useRef<HTMLInputElement>(null)
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
          className="ie-file__button pointer-events-none inline-flex min-h-[46px] items-center gap-2 border-2 border-lime bg-transparent px-5 font-display text-[19px] leading-none font-bold text-lime"
        >
          <UploadIcon className="size-5 stroke-[2.4]" />
          {buttonLabel}
        </span>
      </span>
      <span className="t-s text-lime-dim min-w-0 break-words" aria-live="polite">
        {names.length === 0 ? "No file chosen" : names.join(", ")}
      </span>
    </span>
  )
}

export { FileInput }
