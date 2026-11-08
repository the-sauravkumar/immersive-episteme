const FEWEST_PIXELS = 200;

const linear = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
function lab([r, g, b]) {
  const [R, G, B] = [linear(r), linear(g), linear(b)];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const delta = (a, b) => {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
const parseHex = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const hexOf = (rgb) => "#" + rgb.map((value) => value.toString(16).padStart(2, "0").toUpperCase()).join("");

const seenThrough = (look) => look.transparency === "clear" && (look.fill === "liquid" || look.fill === "paste");

const figureOf = (seen, look) => {
  if (!seen || seen.pixels < FEWEST_PIXELS) return { pixels: seen ? seen.pixels : 0 };
  const wanted = (tenth) => (seen.through ? seen.through[tenth] : parseHex(look.renderHex));
  const deltaE = (tenth) => +delta(seen[tenth], wanted(tenth)).toFixed(1);
  return { pixels: seen.pixels, middle: hexOf(seen.middle), lit: hexOf(seen.lit), target: seen.through ? hexOf(seen.through.middle) : look.renderHex, deltaEMiddle: deltaE("middle"), deltaELit: deltaE("lit") };
};

module.exports = { figureOf, seenThrough };
