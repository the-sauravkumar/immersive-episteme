"use client";

/**
 * Media upload. Nothing measured here is trusted: the server sniffs the bytes, hashes them and
 * reads image dimensions itself.
 *  - local storage: multipart POST to /cms/media/upload;
 *  - S3: SHA-256 in the browser (signed into the presigned PUT, so the store rejects other bytes),
 *    PUT straight to the bucket, then a finalize action that re-checks the stored object.
 * Progress is shown with a native <progress>; refusals land in an alert that receives focus.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Label } from "@/components/ui/label";
import { finalizeUploadAction, presignUploadAction } from "@/server/cms/media/actions";
import { CircleAlert } from "lucide-react";

import { LINK } from "@/components/cms/bits";

import { AssetMetadataFields } from "./asset-metadata-fields";

type Status =
  | { phase: "idle" }
  | { phase: "working"; label: string; progress: number | null }
  | { phase: "done"; message: string; assetId: string }
  | { phase: "error"; message: string; fieldErrors?: Record<string, string[]>; assetId?: string };

const ACCEPT = "image/jpeg,image/png,image/webp,model/gltf-binary,.glb,application/pdf";

function send(method: "POST" | "PUT", url: string, body: XMLHttpRequestBodyInit, headers: Record<string, string>, onProgress: (p: number) => void) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(body);
  });
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** .glb files often arrive without a browser MIME type. */
function mimeOf(file: File): string {
  if (file.type) return file.type;
  return file.name.toLowerCase().endsWith(".glb") ? "model/gltf-binary" : "application/octet-stream";
}

export function UploadForm({ mode, sources }: { mode: "local" | "s3"; sources: { id: string; label: string }[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [isImage, setIsImage] = useState(true);
  const alertRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileId = useId();
  // Remounts the metadata fields after a successful upload (they hold live counts in state).
  const [round, setRound] = useState(0);

  const fail = (s: Extract<Status, { phase: "error" }>) => {
    setStatus(s);
    requestAnimationFrame(() => alertRef.current?.focus());
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return fail({ phase: "error", message: "Choose a file to upload." });
    const mime = mimeOf(file);
    try {
      if (mode === "local") {
        fd.set("file", new File([file], file.name, { type: mime }));
        setStatus({ phase: "working", label: "Uploading", progress: 0 });
        const res = await send("POST", "/cms/media/upload", fd, {}, (p) => setStatus({ phase: "working", label: "Uploading", progress: p }));
        const body = JSON.parse(res.body || "{}") as { assetId?: string; message?: string; fieldErrors?: Record<string, string[]> };
        if (res.status !== 201) return fail({ phase: "error", message: body.message ?? `Upload refused (HTTP ${res.status}).`, fieldErrors: body.fieldErrors, assetId: body.assetId });
        setStatus({ phase: "done", message: body.message ?? "Uploaded.", assetId: body.assetId! });
      } else {
        setStatus({ phase: "working", label: "Computing checksum", progress: null });
        const sha256 = await sha256Hex(file);
        const presign = await presignUploadAction({ declaredMime: mime, byteSize: file.size, sha256 });
        if (!presign?.ok) {
          const d = (presign?.data?.details ?? {}) as { assetId?: string };
          return fail({ phase: "error", message: presign?.error ?? "Upload refused.", fieldErrors: presign?.fieldErrors, assetId: d.assetId });
        }
        const { url, headers } = presign.data as { url: string; headers: Record<string, string> };
        setStatus({ phase: "working", label: "Uploading", progress: 0 });
        const put = await send("PUT", url, file, headers, (p) => setStatus({ phase: "working", label: "Uploading", progress: p }));
        if (put.status < 200 || put.status >= 300) return fail({ phase: "error", message: `Storage refused the upload (HTTP ${put.status}).` });
        setStatus({ phase: "working", label: "Verifying the stored file", progress: null });
        const metadata: Record<string, unknown> = {};
        for (const [k, v] of fd.entries()) if (k !== "file" && typeof v === "string") metadata[k] = v;
        const fin = await finalizeUploadAction({ declaredMime: mime, sha256, metadata });
        if (!fin?.ok) return fail({ phase: "error", message: fin?.error ?? "Upload refused.", fieldErrors: fin?.fieldErrors });
        setStatus({ phase: "done", message: fin.message ?? "Uploaded.", assetId: String(fin.data?.assetId) });
      }
      formRef.current?.reset();
      setRound((n) => n + 1);
      router.refresh();
    } catch {
      fail({ phase: "error", message: "The upload failed (network error). Nothing was saved; try again." });
    }
  }

  const working = status.phase === "working";
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4" aria-busy={working}>
      {status.phase === "error" ? (
        <Alert variant="destructive" ref={alertRef} tabIndex={-1}>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Error: not uploaded</AlertTitle>
          <AlertDescription>
            <p>{status.message}</p>
            {status.assetId ? (
              <p>
                <Link className={LINK} href={`/cms/media?asset=${status.assetId}`}>
                  Open the existing asset
                </Link>
              </p>
            ) : null}
            {status.fieldErrors ? (
              <ul className="mt-1 list-disc pl-5">
                {Object.entries(status.fieldErrors).map(([k, v]) => (
                  <li key={k}>
                    <span className="font-medium">{k}</span>: {v.join(" ")}
                  </li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fileId}>
          File<span aria-hidden="true"> *</span>
        </Label>
        <FileInput
          id={fileId}
          name="file"
          required
          accept={ACCEPT}
          aria-describedby={`${fileId}-hint`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            setIsImage(!f || mimeOf(f).startsWith("image/"));
          }}
        />
        <p id={`${fileId}-hint`} className="text-credit">
          JPEG, PNG or WebP images up to 25 MiB; PDF up to 50 MiB; glTF binary (.glb) up to 200 MiB. The type is checked against the file
          content; image width and height are read from the file.
        </p>
      </div>

      <AssetMetadataFields key={round} isImage={isImage} sources={sources} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={working}>
          {working ? `${status.label}…` : "Upload"}
        </Button>
        {working ? (
          <progress className="h-0.5 w-48 accent-(--ink)" max={1} value={status.progress ?? undefined} aria-label={status.label} />
        ) : null}
        <p role="status" aria-live="polite" className="text-body text-ink-2">
          {status.phase === "done" ? (
            <>
              {status.message}{" "}
              <Link className={LINK} href={`/cms/media?asset=${status.assetId}`}>
                Open it to link it to a concept and its anchor claim
              </Link>
            </>
          ) : working ? (
            status.label
          ) : (
            ""
          )}
        </p>
      </div>
    </form>
  );
}
