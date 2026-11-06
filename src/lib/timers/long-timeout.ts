export const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

export function setLongTimeout(run: () => void, delayMs: number): () => void {
  let handle: ReturnType<typeof setTimeout>;
  const arm = (remainingMs: number) => {
    const stepMs = Math.min(Math.max(0, remainingMs || 0), MAX_TIMER_DELAY_MS);
    handle = setTimeout(() => (remainingMs > stepMs ? arm(remainingMs - stepMs) : run()), stepMs);
  };
  arm(delayMs);
  return () => clearTimeout(handle);
}
