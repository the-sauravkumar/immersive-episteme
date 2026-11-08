const LOADING_SLICE_MS = 12;
const WALKING_SLICE_MS = 5;
const GPU_POLL_MS = 2;
const GPU_BEHIND_MS = 2 * WALKING_SLICE_MS;

type FenceContext = Pick<WebGL2RenderingContext, "fenceSync" | "getSyncParameter" | "deleteSync" | "flush" | "SYNC_GPU_COMMANDS_COMPLETE" | "SYNC_STATUS" | "SIGNALED">;

export class WorkPacer {
  private sliceStarted = performance.now();
  private walkingStarted = false;
  private turns: Promise<void> = Promise.resolve();
  private gl: FenceContext | null = null;
  private pending: { readonly sync: WebGLSync; readonly at: number } | null = null;

  trackGpu(gl: FenceContext): void {
    this.gl = gl;
  }

  beginWalking(): void {
    this.walkingStarted = true;
  }

  get walking(): boolean {
    return this.walkingStarted;
  }

  get sliceMs(): number {
    return this.walkingStarted ? WALKING_SLICE_MS : LOADING_SLICE_MS;
  }

  pace(): Promise<void> {
    if (performance.now() - this.sliceStarted < this.sliceMs) return Promise.resolve();
    return this.yieldSlice();
  }

  yieldSlice(): Promise<void> {
    const turn = this.turns.then(
      () =>
        new Promise<void>((resolve) => {
          const gl = this.walkingStarted ? this.gl : null;
          if (gl && !this.pending) {
            this.pending = { sync: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!, at: performance.now() };
            gl.flush();
          }
          const open = () => {
            const pending = this.pending;
            if (gl && pending) {
              if (gl.getSyncParameter(pending.sync, gl.SYNC_STATUS) === gl.SIGNALED) {
                gl.deleteSync(pending.sync);
                this.pending = null;
              } else if (performance.now() - pending.at > GPU_BEHIND_MS) {
                setTimeout(open, GPU_POLL_MS);
                return;
              }
            }
            this.sliceStarted = performance.now();
            resolve();
          };
          if (this.walkingStarted) requestAnimationFrame(() => setTimeout(open, 0));
          else setTimeout(open, 0);
        }),
    );
    this.turns = turn;
    return turn;
  }

  async settle(): Promise<void> {
    const gl = this.gl;
    if (!gl) return this.yieldSlice();
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
    gl.flush();
    while (gl.getSyncParameter(sync, gl.SYNC_STATUS) !== gl.SIGNALED) await new Promise((resolve) => setTimeout(resolve, GPU_POLL_MS));
    gl.deleteSync(sync);
    this.sliceStarted = performance.now();
  }

  async run<T>(steps: Generator<void, T>): Promise<T> {
    let step = steps.next();
    while (!step.done) {
      await this.pace();
      step = steps.next();
    }
    return step.value;
  }
}
