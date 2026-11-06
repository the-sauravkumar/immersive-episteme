import { filteredMips, type MipFilter } from "../domain/filtered-mips";

export async function levelBitmapsOf(bitmap: ImageBitmap, filter: MipFilter, build: typeof filteredMips): Promise<ImageBitmap[]> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("no 2d context for mip filtering");
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
  return Promise.all(build(pixels, bitmap.width, bitmap.height, filter).map((level) => createImageBitmap(new ImageData(level.pixels, level.width, level.height))));
}

export async function filteredDrawingOf(image: ImageData, filter: MipFilter, options: ImageBitmapOptions, build: typeof filteredMips): Promise<{ bitmap: ImageBitmap; levels: ImageBitmap[] }> {
  const levels = build(image.data, image.width, image.height, filter);
  const [bitmap, ...rest] = await Promise.all([image, ...levels.map((level) => new ImageData(level.pixels, level.width, level.height))].map((data) => createImageBitmap(data, options)));
  return { bitmap: bitmap!, levels: rest };
}

const DECODER_SOURCE = `const build=(${filteredMips.toString()});const levelBitmapsOf=(${levelBitmapsOf.toString()});const filteredDrawingOf=(${filteredDrawingOf.toString()});self.onmessage=async(event)=>{const{id,url,image,options,filter}=event.data;try{if(image){const drawn=await filteredDrawingOf(image,filter,options,build);self.postMessage({id,...drawn},[drawn.bitmap,...drawn.levels]);return;}const response=await fetch(url);if(!response.ok)throw new Error(response.status+' '+url);const bitmap=await createImageBitmap(await response.blob(),options);const levels=filter?await levelBitmapsOf(bitmap,filter,build):[];self.postMessage({id,bitmap,levels},[bitmap,...levels]);}catch(error){self.postMessage({id,error:String(error)});}};`;

export interface DecodedImage {
  readonly bitmap: ImageBitmap;
  readonly levels: readonly ImageBitmap[];
}

interface Waiting {
  readonly here: () => Promise<DecodedImage>;
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
    return this.inWorker({ url, filter }, () => this.decodeHere(url, filter));
  }

  filterDrawing(image: ImageData, filter: MipFilter): Promise<DecodedImage> {
    return this.inWorker({ image, filter }, () => filteredDrawingOf(image, filter, this.options, filteredMips));
  }

  private inWorker(message: { readonly url?: string; readonly image?: ImageData; readonly filter: MipFilter | null }, here: () => Promise<DecodedImage>): Promise<DecodedImage> {
    const worker = this.running();
    if (!worker) return here();
    return new Promise<DecodedImage>((resolve, reject) => {
      const id = this.nextId++;
      this.waiting.set(id, { here, resolve, reject });
      worker.postMessage({ id, ...message, options: this.options });
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
      for (const { here, resolve, reject } of stranded) here().then(resolve, reject);
    };
    return this.worker;
  }
}
