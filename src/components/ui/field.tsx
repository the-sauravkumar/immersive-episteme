"use client"

import { useMemo } from "react"
import { CircleAlertIcon } from "lucide-react"
import { cn } from "@/lib/utils"

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>
}) {
  const content = useMemo(() => {
    if (children) {
      return children
    }

    if (!errors?.length) {
      return null
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ]

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map(
          (error, index) =>
            error?.message && <li key={index}>{error.message}</li>
        )}
      </ul>
    )
  }, [children, errors])

  if (!content) {
    return null
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn(
        "t-s flex items-start gap-2 font-semibold text-madder-text",
        className
      )}
      {...props}
    >
      <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 stroke-2" />
      <div className="min-w-0">{content}</div>
    </div>
  )
}

export { FieldError }
