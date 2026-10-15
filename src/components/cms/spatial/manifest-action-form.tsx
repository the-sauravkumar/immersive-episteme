"use client";

/** ActionForm that opens the manifest an action returned (data.manifestId) in the studio. */
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { ActionForm, type FormAction } from "@/components/cms/action-form";

export function ManifestActionForm({
  action,
  submitLabel,
  pendingLabel,
  children,
  submitVariant,
}: {
  action: FormAction;
  submitLabel: string;
  pendingLabel?: string;
  children?: ReactNode;
  submitVariant?: "default" | "outline" | "secondary" | "destructive";
}) {
  const router = useRouter();
  return (
    <ActionForm
      action={action}
      submitLabel={submitLabel}
      pendingLabel={pendingLabel}
      submitVariant={submitVariant}
      onDone={(s) => {
        const id = s.ok ? s.data?.manifestId : undefined;
        if (typeof id === "string") router.push(`/cms/spatial?manifest=${encodeURIComponent(id)}`);
      }}
    >
      {children}
    </ActionForm>
  );
}
