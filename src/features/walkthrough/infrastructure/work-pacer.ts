const LOADING_SLICE_MS = 12;
const WALKING_SLICE_MS = 5;

export class WorkPacer {
  private sliceStarted = performance.now();
  private walkingStarted = false;
  private turns: Promise<void> = Promise.resolve();

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
          const open = () => {
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

  async run<T>(steps: Generator<void, T>): Promise<T> {
    let step = steps.next();
    while (!step.done) {
      await this.pace();
      step = steps.next();
    }
    return step.value;
  }
}
