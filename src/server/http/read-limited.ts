/**
 * Reads a request body, cancelling it as soon as more than `limit` bytes have arrived (no trust
 * in Content-Length: a chunked request has none). Returns null when the limit was exceeded.
 * Route handlers have no default body limit in Next (the 1 MB limit is for Server Actions only),
 * so `request.text()` / `formData()` would buffer any size first. Used by the media upload and
 * the telemetry batch routes.
 */
export async function readLimited(body: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let seen = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    seen += value.byteLength;
    if (seen > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(seen);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}
