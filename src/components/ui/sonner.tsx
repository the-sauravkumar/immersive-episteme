"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-5 stroke-[2.4]" />,
        info: <InfoIcon className="size-5 stroke-[2.4]" />,
        warning: <TriangleAlertIcon className="size-5 stroke-[2.4]" />,
        error: <OctagonXIcon className="size-5 stroke-[2.4]" />,
        loading: <Loader2Icon className="size-5 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--cotton)",
          "--normal-text": "var(--stamp)",
          "--normal-border": "var(--cotton)",
          "--success-bg": "var(--cotton)",
          "--success-text": "var(--stamp)",
          "--success-border": "var(--cotton)",
          "--error-bg": "var(--cotton)",
          "--error-text": "var(--stamp)",
          "--error-border": "var(--madder)",
          "--border-radius": "0px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "font-sans text-[18px] leading-[1.4] shadow-none!",
          title: "font-sans font-semibold",
          description: "text-stamp",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
