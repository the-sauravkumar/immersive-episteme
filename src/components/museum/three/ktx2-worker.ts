/**
 * Runs three's KTX2 transcoder worker under the app's strict Content-Security-Policy.
 *
 * The Basis Universal transcoder (public/museum/basis/basis_transcoder.js) is an Emscripten build
 * whose embind glue compiles its function invokers with `new Function`. KTX2Loader starts the
 * worker from a blob: URL, and a blob worker inherits the page's policy, whose script-src has no
 * 'unsafe-eval' in a production build. The transcoder therefore failed in production and the museum
 * stayed on "Loading surfaces" (it worked only under the development policy).
 *
 * The fix keeps the page policy unchanged: the worker is started from a same-origin file,
 * public/museum/basis/ktx2-worker-boot.js, which carries its own narrow policy (next.config.ts:
 * default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'). A dedicated worker
 * loaded from a URL takes the policy delivered with its script, so only the worker may evaluate
 * code. The boot file evaluates one message: the worker source KTX2Loader itself builds (its
 * constants, the transcoder wrapper and `KTX2Loader.BasisWorker`), composed here exactly as
 * KTX2Loader.init does in three 0.186.1, so nothing of the loader is copied by hand.
 */
import type { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

/** The bootstrap worker (served with its own CSP, next.config.ts). */
export const KTX2_WORKER_BOOT_URL = "/museum/basis/ktx2-worker-boot.js";

interface LoaderInternals {
  init(): Promise<void>;
  transcoderPath: string;
  transcoderPending: Promise<void> | null;
  transcoderBinary: ArrayBuffer;
  workerConfig: unknown;
  workerPool: { setWorkerCreator(creator: () => Worker): void };
}

interface LoaderStatics {
  BasisWorker: () => void;
  EngineFormat: unknown;
  EngineType: unknown;
  TranscoderFormat: unknown;
  BasisFormat: unknown;
}

/** The worker source, composed as KTX2Loader.init composes its blob. */
export function ktx2WorkerSource(statics: LoaderStatics, transcoderJs: string): string {
  const fn = statics.BasisWorker.toString();
  return [
    "/* constants */",
    `let _EngineFormat = ${JSON.stringify(statics.EngineFormat)}`,
    `let _EngineType = ${JSON.stringify(statics.EngineType)}`,
    `let _TranscoderFormat = ${JSON.stringify(statics.TranscoderFormat)}`,
    `let _BasisFormat = ${JSON.stringify(statics.BasisFormat)}`,
    "/* basis_transcoder.js */",
    transcoderJs,
    "/* worker */",
    fn.substring(fn.indexOf("{") + 1, fn.lastIndexOf("}")),
  ].join("\n");
}

/**
 * Makes `loader` start its workers from the bootstrap file instead of a blob: URL. Call once, right
 * after constructing the loader and before its first load.
 */
export function runInBootWorker(loader: KTX2Loader, statics: LoaderStatics): void {
  const l = loader as unknown as LoaderInternals;
  const init = l.init.bind(l);
  let pending: Promise<void> | null = null;
  l.init = () => {
    if (!pending) {
      const base = init();
      const js = fetch(`${l.transcoderPath}basis_transcoder.js`).then((r) => {
        if (!r.ok) throw new Error(`KTX2 transcoder: HTTP ${r.status}`);
        return r.text();
      });
      pending = Promise.all([base, js]).then(([, transcoderJs]) => {
        const body = ktx2WorkerSource(statics, transcoderJs);
        l.workerPool.setWorkerCreator(() => {
          const worker = new Worker(KTX2_WORKER_BOOT_URL);
          worker.postMessage({ type: "source", body });
          const transcoderBinary = l.transcoderBinary.slice(0);
          worker.postMessage({ type: "init", config: l.workerConfig, transcoderBinary }, [transcoderBinary]);
          return worker;
        });
      });
      l.transcoderPending = pending;
    }
    return pending;
  };
}
