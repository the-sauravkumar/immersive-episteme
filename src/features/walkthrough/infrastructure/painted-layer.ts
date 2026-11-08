export interface PaintSpec {
  readonly lines: readonly string[];
  readonly height: number;
  readonly weight: number;
  readonly family: string;
  readonly pixelsPerMetre: number;
  readonly wear: number;
  readonly lineHeight: number;
  readonly align: "left" | "center" | "right";
  readonly maxWidthMetres: number | null;
}

export interface PaintFont {
  readonly family: string;
  readonly url: string;
  readonly weight: string;
}

export interface PaintedLayer {
  readonly drawing: ImageData;
  readonly width: number;
  readonly height: number;
}

export const PAINT_FONTS: readonly PaintFont[] = [
  { family: "Eczar", url: "/walkthrough/fonts/Eczar-400-800.woff2", weight: "400 800" },
  { family: "Mukta", url: "/walkthrough/fonts/Mukta-600.woff2", weight: "600" },
];

export function paintedLayerOf(spec: PaintSpec): PaintedLayer {
  const edgeBlurPixels = 2.2;
  const lowestWearAlpha = 0.42;
  const longestSide = 8192;
  const font = (pixels: number) => `${spec.weight} ${pixels}px ${spec.family}`;
  const measure = new OffscreenCanvas(1, 1).getContext("2d")!;
  let size = spec.height * spec.pixelsPerMetre;
  measure.font = font(size);
  const lines: string[] = [];
  if (spec.maxWidthMetres === null) lines.push(...spec.lines);
  else {
    const maxPixels = spec.maxWidthMetres * spec.pixelsPerMetre;
    for (const line of spec.lines) {
      let current = "";
      for (const word of line.split(" ")) {
        const candidate = current ? `${current} ${word}` : word;
        if (measure.measureText(candidate).width > maxPixels && current) {
          lines.push(current);
          current = word;
        } else current = candidate;
      }
      lines.push(current);
    }
  }
  const textWidth = Math.max(...lines.map((line) => measure.measureText(line).width));
  const padding = size * 0.22;
  let width = textWidth + padding * 2;
  let height = size * spec.lineHeight * lines.length + padding * 1.4;
  const scale = Math.min(1, longestSide / width, longestSide / height);
  size *= scale;
  width = Math.ceil(width * scale);
  height = Math.ceil(height * scale);
  const context = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true })!;
  context.font = font(size);
  context.fillStyle = "#ffffff";
  context.filter = `blur(${edgeBlurPixels}px)`;
  context.textBaseline = "alphabetic";
  context.textAlign = spec.align;
  const anchor = spec.align === "center" ? width / 2 : spec.align === "right" ? width - padding * scale : padding * scale;
  lines.forEach((line, index) => context.fillText(line, anchor, size * (0.98 + index * spec.lineHeight) + padding * scale * 0.2));
  context.filter = "none";
  context.globalCompositeOperation = "destination-out";
  const marks = ((width * height) / 900) * spec.wear;
  for (let i = 0; i < marks; i++) {
    context.fillStyle = `rgba(0,0,0,${Math.random() * lowestWearAlpha})`;
    context.beginPath();
    context.ellipse(Math.random() * width, Math.random() * height, 0.5 + Math.random() * size * 0.014, 0.4 + Math.random() * size * 0.006, Math.random() * 3, 0, 7);
    context.fill();
  }
  const effective = spec.pixelsPerMetre * scale;
  return { drawing: context.getImageData(0, 0, width, height), width: width / effective, height: height / effective };
}
