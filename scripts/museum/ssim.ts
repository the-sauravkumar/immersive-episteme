/**
 * Structural similarity (SSIM) for C12, per channel on 8-bit RGB, with the usual constants
 * (K1 = 0.01, K2 = 0.03, L = 255) and an 8 x 8 window moved in
 * steps of 4 (a common fast variant of the 11 x 11 Gaussian window), averaged over windows and
 * channels. Also a block-artefact index: the mean absolute error on 4-pixel block boundaries
 * divided by the mean absolute error inside blocks (1.0 = no boundary structure; GPU block
 * compression works on 4 x 4 blocks).
 */
export interface Image8 {
  data: Uint8Array | Buffer;
  width: number;
  height: number;
  channels: 3;
}

export function ssim(a: Image8, b: Image8, win = 8, step = 4): { mean: number; perChannel: [number, number, number]; min: number } {
  if (a.width !== b.width || a.height !== b.height) throw new Error("size mismatch");
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  const per: number[] = [];
  let min = 1;
  for (let ch = 0; ch < 3; ch++) {
    let sum = 0;
    let n = 0;
    for (let y = 0; y + win <= a.height; y += step) {
      for (let x = 0; x + win <= a.width; x += step) {
        let ma = 0;
        let mb = 0;
        for (let j = 0; j < win; j++) {
          for (let i = 0; i < win; i++) {
            const k = ((y + j) * a.width + (x + i)) * 3 + ch;
            ma += a.data[k]!;
            mb += b.data[k]!;
          }
        }
        const N = win * win;
        ma /= N;
        mb /= N;
        let va = 0;
        let vb = 0;
        let cov = 0;
        for (let j = 0; j < win; j++) {
          for (let i = 0; i < win; i++) {
            const k = ((y + j) * a.width + (x + i)) * 3 + ch;
            const da = a.data[k]! - ma;
            const db = b.data[k]! - mb;
            va += da * da;
            vb += db * db;
            cov += da * db;
          }
        }
        va /= N - 1;
        vb /= N - 1;
        cov /= N - 1;
        const s = ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
        sum += s;
        n++;
        if (s < min) min = s;
      }
    }
    per.push(sum / n);
  }
  return { mean: (per[0]! + per[1]! + per[2]!) / 3, perChannel: per as [number, number, number], min };
}

export function blockArtefactIndex(a: Image8, b: Image8): number {
  let edge = 0;
  let edgeN = 0;
  let inner = 0;
  let innerN = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 1; x < a.width; x++) {
      for (let ch = 0; ch < 3; ch++) {
        const k = (y * a.width + x) * 3 + ch;
        const k0 = k - 3;
        // Horizontal gradient of the error across x-1 -> x.
        const g = Math.abs(a.data[k]! - b.data[k]! - (a.data[k0]! - b.data[k0]!));
        if (x % 4 === 0) {
          edge += g;
          edgeN++;
        } else {
          inner += g;
          innerN++;
        }
      }
    }
  }
  const ie = inner / innerN;
  return ie === 0 ? 1 : edge / edgeN / ie;
}
