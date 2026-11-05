const DECODER_SOURCE = "self.onmessage=async(event)=>{const{id,url,options}=event.data;try{const response=await fetch(url);if(!response.ok)throw new Error(response.status+' '+url);const bitmap=await createImageBitmap(await response.blob(),options);self.postMessage({id,bitmap},[bitmap]);}catch(error){self.postMessage({id,error:String(error)});}};";

interface Waiting {
  readonly url: string;
  readonly resolve: (bitmap: ImageBitmap) => void;
  readonly reject: (error: Error) => void;
}

export class BitmapDecoder {
  private worker: Worker | null = null;
  private broken = typeof Worker === "undefined";
  private nextId = 0;
  private readonly waiting = new Map<number, Waiting>();

  constructor(private readonly options: ImageBitmapOptions) {}

  decode(path: string): Promise<ImageBitmap> {
    const url = new URL(path, location.href).href;
    const worker = this.running();
    if (!worker) return this.decodeHere(url);
    return new Promise<ImageBitmap>((resolve, reject) => {
      const id = this.nextId++;
      this.waiting.set(id, { url, resolve, reject });
      worker.postMessage({ id, url, options: this.options });
    });
  }

  close(): void {
    this.worker?.terminate();
    this.worker = null;
    this.broken = true;
    for (const { reject } of this.waiting.values()) reject(new Error("decoder closed"));
    this.waiting.clear();
  }

  private async decodeHere(url: string): Promise<ImageBitmap> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return createImageBitmap(await response.blob(), this.options);
  }

  private running(): Worker | null {
    if (this.worker || this.broken) return this.worker;
    try {
      const source = URL.createObjectURL(new Blob([DECODER_SOURCE], { type: "text/javascript" }));
      this.worker = new Worker(source);
    } catch {
      this.broken = true;
      return null;
    }
    this.worker.onmessage = (event: MessageEvent<{ id: number; bitmap?: ImageBitmap; error?: string }>) => {
      const waiting = this.waiting.get(event.data.id);
      if (!waiting) return;
      this.waiting.delete(event.data.id);
      if (event.data.bitmap) waiting.resolve(event.data.bitmap);
      else waiting.reject(new Error(event.data.error ?? "decode failed"));
    };
    this.worker.onerror = () => {
      this.worker?.terminate();
      this.worker = null;
      this.broken = true;
      const stranded = [...this.waiting.values()];
      this.waiting.clear();
      for (const { url, resolve, reject } of stranded) this.decodeHere(url).then(resolve, reject);
    };
    return this.worker;
  }
}
