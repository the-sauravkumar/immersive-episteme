import { filteredMips, type MipFilter } from "../domain/filtered-mips";
import { paintedLayerOf, type PaintFont, type PaintSpec } from "./painted-layer";
import { decodedSkyOf, type DecodedSky } from "./rgbe-sky";

async function levelBitmapsOf(bitmap: ImageBitmap, filter: MipFilter, build: typeof filteredMips): Promise<ImageBitmap[]> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("no 2d context for mip filtering");
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
  return Promise.all(build(pixels, bitmap.width, bitmap.height, filter).map((level) => createImageBitmap(new ImageData(level.pixels, level.width, level.height))));
}

async function filteredDrawingOf(image: ImageData, filter: MipFilter, options: ImageBitmapOptions, build: typeof filteredMips): Promise<{ bitmap: ImageBitmap; levels: ImageBitmap[] }> {
  const levels = build(image.data, image.width, image.height, filter);
  const [bitmap, ...rest] = await Promise.all([image, ...levels.map((level) => new ImageData(level.pixels, level.width, level.height))].map((data) => createImageBitmap(data, options)));
  return { bitmap: bitmap!, levels: rest };
}

const DECODER_SOURCE = `const build=(${filteredMips.toString()});const levelBitmapsOf=(${levelBitmapsOf.toString()});const filteredDrawingOf=(${filteredDrawingOf.toString()});const paintedLayerOf=(${paintedLayerOf.toString()});const decodedSkyOf=(${decodedSkyOf.toString()});let fontsLoading=null;const fontsReady=(fonts)=>fontsLoading??=Promise.all(fonts.map((font)=>{const face=new FontFace(font.family,'url('+font.url+')',{weight:font.weight});self.fonts.add(face);return face.load();}));self.onmessage=async(event)=>{const{id,url,image,paint,fonts,sky,options,filter}=event.data;try{if(sky){const response=await fetch(sky.url);if(!response.ok)throw new Error(response.status+' '+sky.url);const decoded=decodedSkyOf(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(),sky.knee);self.postMessage({id,sky:decoded},[decoded.plain.buffer,decoded.softened.buffer]);return;}if(paint){await fontsReady(fonts);const layer=paintedLayerOf(paint);const drawn=await filteredDrawingOf(layer.drawing,filter,options,build);self.postMessage({id,...drawn,width:layer.width,height:layer.height},[drawn.bitmap,...drawn.levels]);return;}if(image){const drawn=await filteredDrawingOf(image,filter,options,build);self.postMessage({id,...drawn},[drawn.bitmap,...drawn.levels]);return;}const response=await fetch(url);if(!response.ok)throw new Error(response.status+' '+url);const bitmap=await createImageBitmap(await response.blob(),options);const levels=filter?await levelBitmapsOf(bitmap,filter,build):[];self.postMessage({id,bitmap,levels},[bitmap,...levels]);}catch(error){self.postMessage({id,error:String(error)});}};`;

export interface DecodedImage {
  readonly bitmap: ImageBitmap;
  readonly levels: readonly ImageBitmap[];
}

export interface PaintedImage extends DecodedImage {
  readonly width: number;
  readonly height: number;
}

interface Waiting {
  readonly here: () => Promise<unknown>;
  readonly resolve: (decoded: never) => void;
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

  decodeSky(path: string, sunSoftKnee: number): Promise<DecodedSky> {
    const url = new URL(path, location.href).href;
    return this.inWorker({ sky: { url, knee: sunSoftKnee }, filter: null }, async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return decodedSkyOf(await new Response(response.body!.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer(), sunSoftKnee);
    });
  }

  paint(paint: PaintSpec, fonts: readonly PaintFont[], filter: MipFilter): Promise<PaintedImage> {
    const absolute = fonts.map((font) => ({ ...font, url: new URL(font.url, location.href).href }));
    return this.inWorker({ paint, fonts: absolute, filter }, () => this.paintHere(paint, absolute, filter));
  }

  private async paintHere(paint: PaintSpec, fonts: readonly PaintFont[], filter: MipFilter): Promise<PaintedImage> {
    await Promise.all(fonts.map((font) => document.fonts.load(`${font.weight.split(" ").pop()} 40px ${font.family}`)));
    const layer = paintedLayerOf(paint);
    return { ...(await filteredDrawingOf(layer.drawing, filter, this.options, filteredMips)), width: layer.width, height: layer.height };
  }

  private inWorker<T>(message: { readonly url?: string; readonly paint?: PaintSpec; readonly fonts?: readonly PaintFont[]; readonly sky?: { readonly url: string; readonly knee: number }; readonly filter: MipFilter | null }, here: () => Promise<T>): Promise<T> {
    const worker = this.running();
    if (!worker) return here();
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      this.waiting.set(id, { here, resolve: resolve as (decoded: never) => void, reject });
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
    this.worker.onmessage = (event: MessageEvent<{ id: number; bitmap?: ImageBitmap; levels?: ImageBitmap[]; width?: number; height?: number; sky?: DecodedSky; error?: string }>) => {
      const waiting = this.waiting.get(event.data.id);
      if (!waiting) return;
      this.waiting.delete(event.data.id);
      if (event.data.sky) waiting.resolve(event.data.sky as never);
      else if (event.data.bitmap) waiting.resolve({ bitmap: event.data.bitmap, levels: event.data.levels ?? [], width: event.data.width ?? 0, height: event.data.height ?? 0 } as never);
      else waiting.reject(new Error(event.data.error ?? "decode failed"));
    };
    this.worker.onerror = () => {
      this.worker?.terminate();
      this.worker = null;
      this.broken = true;
      const stranded = [...this.waiting.values()];
      this.waiting.clear();
      for (const { here, resolve, reject } of stranded) here().then((decoded) => resolve(decoded as never), reject);
    };
    return this.worker;
  }
}
