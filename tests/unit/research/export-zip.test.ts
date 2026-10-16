/**
 * The minimal ZIP writer used for the all-tables CSV export (src/server/research/exports/zip.ts):
 * the archive is read back through its central directory, as unzip tools do, and every entry's
 * CRC-32 and content are checked.
 */
import { crc32, inflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { buildZip } from "@/server/research/exports/zip";

function readZip(buf: Uint8Array): { name: string; text: string; crcOk: boolean }[] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const end = buf.byteLength - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const out: { name: string; text: string; crcOk: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    const crc = v.getUint32(at + 16, true);
    const packed = v.getUint32(at + 20, true);
    const size = v.getUint32(at + 24, true);
    const nameLen = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(buf.subarray(at + 46, at + 46 + nameLen));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    const dataAt = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = inflateRawSync(buf.subarray(dataAt, dataAt + packed));
    expect(raw.byteLength).toBe(size);
    out.push({ name, text: raw.toString("utf8"), crcOk: (crc32(raw) >>> 0) === crc });
    at += 46 + nameLen + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
  }
  return out;
}

describe("export ZIP", () => {
  it("round-trips several entries with UTF-8 names and contents", () => {
    const entries = [
      { name: "manifest.json", data: JSON.stringify({ generatedAt: "2026-10-16T10:00:00.000Z" }) },
      { name: "events.csv", data: "a,b\r\n1,\"x, y\"\r\n".repeat(200) },
      { name: "notes-é.csv", data: "text\r\nnaïve – ok\r\n" },
      { name: "empty.csv", data: "" },
    ];
    const zip = buildZip(entries, new Date("2026-10-16T10:00:00.000Z"));
    const back = readZip(zip);
    expect(back.map((e) => e.name)).toEqual(entries.map((e) => e.name));
    expect(back.map((e) => e.text)).toEqual(entries.map((e) => e.data));
    expect(back.every((e) => e.crcOk)).toBe(true);
  });
});
