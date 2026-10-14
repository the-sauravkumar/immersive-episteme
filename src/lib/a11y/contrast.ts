/**
 * WCAG 2.x contrast helpers. Pure functions, safe on server and client.
 * https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 */

export type Rgba = { r: number; g: number; b: number; a: number };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+%?))?\s*\)$/i;

/** Parse `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(r g b / a)` or `rgba(r, g, b, a)`. */
export function parseColor(input: string): Rgba {
  const value = input.trim();
  const hex = HEX.exec(value);
  if (hex?.[1]) {
    let h = hex[1];
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const rgb = RGB.exec(value);
  if (rgb?.[1] && rgb[2] && rgb[3]) {
    const alphaRaw = rgb[4];
    const a =
      alphaRaw === undefined
        ? 1
        : alphaRaw.endsWith("%")
          ? parseFloat(alphaRaw) / 100
          : parseFloat(alphaRaw);
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a };
  }
  throw new Error(`Unsupported colour: ${input}`);
}

/** Alpha-composite `fg` over an opaque `bg`. */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio of `fg` on `bg` (translucent colours are composited onto `bg`, then white). */
export function contrastRatio(fg: string | Rgba, bg: string | Rgba): number {
  const white: Rgba = { r: 255, g: 255, b: 255, a: 1 };
  const b0 = typeof bg === "string" ? parseColor(bg) : bg;
  const background = b0.a < 1 ? composite(b0, white) : b0;
  const f0 = typeof fg === "string" ? parseColor(fg) : fg;
  const foreground = f0.a < 1 ? composite(f0, background) : f0;
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
