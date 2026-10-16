/**
 * Minimal ZIP writer (PKWARE APPNOTE 6.3: local headers, central directory, end record; DEFLATE,
 * UTF-8 names; no ZIP64, so each file and the archive stay under 4 GiB). Used to serve every CSV
 * table of one export bundle as ONE download, so the tables come from one database snapshot and
 * travel with the manifest that ties them together (final review telemetry-04). Node's zlib
 * provides DEFLATE and CRC-32; no dependency is added.
 */
import { crc32, deflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  data: string | Uint8Array;
}

/** MS-DOS date and time fields (local fields are written from the UTC parts, 2 s resolution). */
function dosDateTime(d: Date): { date: number; time: number } {
  const year = Math.min(Math.max(d.getUTCFullYear(), 1980), 2107);
  return {
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
  };
}

export function buildZip(entries: readonly ZipEntry[], modified: Date = new Date()): Uint8Array {
  const { date, time } = dosDateTime(modified);
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const raw = typeof e.data === "string" ? enc.encode(e.data) : e.data;
    const packed = deflateRawSync(raw);
    const crc = crc32(raw) >>> 0;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header signature
    local.setUint16(4, 20, true); // version needed (2.0: deflate)
    local.setUint16(6, 0x0800, true); // flags: UTF-8 names
    local.setUint16(8, 8, true); // method: deflate
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, packed.byteLength, true);
    local.setUint32(22, raw.byteLength, true);
    local.setUint16(26, name.byteLength, true);
    local.setUint16(28, 0, true); // extra field length
    locals.push(new Uint8Array(local.buffer), name, packed);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true); // central directory header signature
    central.setUint16(4, 20, true); // version made by
    central.setUint16(6, 20, true); // version needed
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 8, true);
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, packed.byteLength, true);
    central.setUint32(24, raw.byteLength, true);
    central.setUint16(28, name.byteLength, true);
    // 30 extra length, 32 comment length, 34 disk number, 36 internal and 38 external attributes: 0
    central.setUint32(42, offset, true); // offset of the local header
    centrals.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.byteLength + packed.byteLength;
  }
  const cdSize = centrals.reduce((n, b) => n + b.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory signature
  end.setUint16(8, entries.length, true); // entries on this disk
  end.setUint16(10, entries.length, true); // entries in total
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true); // offset of the central directory
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, b) => n + b.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}
