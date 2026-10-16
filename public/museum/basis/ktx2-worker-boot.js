/*
 * Bootstrap of the KTX2 transcoder worker (src/components/museum/three/ktx2-worker.ts). It is
 * served with its own narrow Content-Security-Policy (next.config.ts), so the transcoder's embind
 * glue may compile its invokers here while the pages keep a script-src without 'unsafe-eval'.
 * The first message carries the worker source that KTX2Loader composes; it installs the
 * transcoder's own message handler, which then receives the "init" message and every job.
 */
self.addEventListener("message", function boot(event) {
  if (!event.data || event.data.type !== "source") return;
  self.removeEventListener("message", boot);
  new Function(event.data.body)();
});
