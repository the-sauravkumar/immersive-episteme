import { filteredMips, type MipFilter } from "../domain/filtered-mips";

export async function levelBitmapsOf(bitmap: ImageBitmap, filter: MipFilter, build: typeof filteredMips): Promise<ImageBitmap[]> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("no 2d context for mip filtering");
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
  return Promise.all(build(pixels, bitmap.width, bitmap.height, filter).map((level) => createImageBitmap(new ImageData(level.pixels, level.width, level.height))));
}

const DECODER_SOURCE = `const build=(${filteredMips.toString()});const levelBitmapsOf=(${levelBitmapsOf.toString()});self.onmessage=async(event)=>{const{id,url,options,filter}=event.data;try{const response=await fetch(url);if(!response.ok)throw new Error(response.status+' '+url);const bitmap=await createImageBitmap(await response.blob(),options);const levels=filter?await levelBitmapsOf(bitmap,filter,build):[];self.postMessage({id,bitmap,levels},[bitmap,...levels]);}catch(error){self.postMessage({id,error:String(error)});}};`;

export interface DecodedImage {
  readonly bitmap: ImageBitmap;
  readonly levels: readonly ImageBitmap[];
}

interface Waiting {
  readonly url: string;
  readonly filter: MipFilter | null;
  readonly resolve: (decoded: DecodedImage) => void;
  readonly reject: (error: Error) => void;
}

export class BitmapDecoder {
  private worker: Worker | null = null;
  private broken = typeof Worker === "undefined";
  private nextId = 0;
  private readonly waiting = new Map<number, Waiting>();

  constructor(private readonly options: ImageBitmapOptions) {}

  async decode(path: string): Promise<ImageBitmap> {
    return (await this.decodeFiltered(path, null)).bitmap;
  }

  decodeFiltered(path: string, filter: MipFilter | null): Promise<DecodedImage> {
    const url = new URL(path, location.href).href;
    const worker = this.running();
    if (!worker) return this.decodeHere(url, filter);
    return new Promise<DecodedImage>((resolve, reject) => {
      const id = this.nextId++;
      this.waiting.set(id, { url, filter, resolve, reject });
      worker.postMessage({ id, url, options: this.options, filter });
    });
  }

  close(): void {
    this.worker?.terminate();
    this.worker = null;
    this.broken = true;
    for (const { reject } of this.waiting.values()) reject(new Error("decoder closed"));
    this.waiting.clear();
  }

  private async decodeHere(url: string, filter: MipFilter | null): Promise<DecodedImage> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    const bitmap = await createImageBitmap(await response.blob(), this.options);
    return { bitmap, levels: filter ? await levelBitmapsOf(bitmap, filter, filteredMips) : [] };
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
    this.worker.onmessage = (event: MessageEvent<{ id: number; bitmap?: ImageBitmap; levels?: ImageBitmap[]; error?: string }>) => {
      const waiting = this.waiting.get(event.data.id);
      if (!waiting) return;
      this.waiting.delete(event.data.id);
      if (event.data.bitmap) waiting.resolve({ bitmap: event.data.bitmap, levels: event.data.levels ?? [] });
      else waiting.reject(new Error(event.data.error ?? "decode failed"));
    };
    this.worker.onerror = () => {
      this.worker?.terminate();
      this.worker = null;
      this.broken = true;
      const stranded = [...this.waiting.values()];
      this.waiting.clear();
      for (const { url, filter, resolve, reject } of stranded) this.decodeHere(url, filter).then(resolve, reject);
    };
    return this.worker;
  }
}
