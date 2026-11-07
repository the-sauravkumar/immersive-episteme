interface TimerQueryExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

interface PendingQuery {
  readonly query: WebGLQuery;
  readonly generation: number;
}

const MOST_PENDING = 6;

export class GpuFrameTimer {
  private readonly extension: TimerQueryExtension | null;
  private readonly pending: PendingQuery[] = [];
  private readonly spare: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private generation = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.extension = gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerQueryExtension | null;
  }

  begin(): void {
    if (!this.extension || this.active || this.pending.length >= MOST_PENDING) return;
    const query = this.spare.pop() ?? this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
    this.active = query;
  }

  end(): void {
    if (!this.extension || !this.active) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push({ query: this.active, generation: this.generation });
    this.active = null;
  }

  forgetEarlier(): void {
    this.generation++;
  }

  latestMs(): number | null {
    if (!this.extension) return null;
    let latest: number | null = null;
    while (this.pending.length > 0) {
      const { query, generation } = this.pending[0]!;
      if (!this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      const disjoint = this.gl.getParameter(this.extension.GPU_DISJOINT_EXT) as boolean;
      const nanoseconds = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT) as number;
      this.spare.push(query);
      if (!disjoint && generation === this.generation) latest = nanoseconds / 1e6;
    }
    return latest;
  }

  dispose(): void {
    for (const { query } of this.pending) this.gl.deleteQuery(query);
    for (const query of this.spare) this.gl.deleteQuery(query);
    if (this.active) this.gl.deleteQuery(this.active);
    this.pending.length = 0;
    this.spare.length = 0;
    this.active = null;
  }
}
