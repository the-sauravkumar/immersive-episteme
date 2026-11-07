import type { StudyConfig } from "@/features/study/contracts";

export function guidanceFromForm(current: Partial<StudyConfig["guidance"]> | undefined, d: FormData): Record<string, unknown> {
  const text = (k: string) => {
    const v = d.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const stall = text("stallSeconds");
  return {
    ...current,
    cueEnabled: d.get("cueEnabled") === "on",
    ...(d.has("hintText") ? { hintText: text("hintText") || undefined } : {}),
    ...(d.has("stallSeconds") && stall ? { stallSeconds: Number(stall) } : {}),
  };
}
