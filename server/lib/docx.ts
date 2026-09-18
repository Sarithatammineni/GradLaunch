import { inflateRawSync, deflateRawSync } from "node:zlib";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** A .docx is a ZIP package whose body text lives in word/document.xml. */
export function isDocxFile(mimeType: string, filename: string): boolean {
  return mimeType === DOCX_MIME || filename.toLowerCase().endsWith(".docx");
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

/** Reads the ZIP central directory (robust even when local headers use data descriptors). */
function readZipEntries(bytes: Uint8Array): ZipEntry[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Locate the End Of Central Directory record (scanning backwards; comments may follow it).
  let eocd = -1;
  const minStart = Math.max(0, bytes.length - 22 - 65536);
  for (let i = bytes.length - 22; i >= minStart; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP file (no central directory)");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compressedSize, localHeaderOffset: offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (!entries.length) throw new Error("ZIP central directory is empty");
  return entries;
}

function readEntry(bytes: Uint8Array, e: ZipEntry): Uint8Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const o = e.localHeaderOffset;
  if (o + 30 > bytes.length || dv.getUint32(o, true) !== 0x04034b50) {
    throw new Error("Corrupt ZIP local file header");
  }
  const nameLen = dv.getUint16(o + 26, true);
  const extraLen = dv.getUint16(o + 28, true);
  const start = o + 30 + nameLen + extraLen;
  const raw = bytes.subarray(start, start + e.compressedSize);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateRawSync(raw);
  throw new Error(`Unsupported ZIP compression method ${e.method}`);
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Turns word/document.xml into plain text: <w:t> runs are text, paragraphs become newlines. */
function xmlToText(xml: string): string {
  let out = "";
  const re =
    /<w:p\b[^>]*\/?>|<\/w:p>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<[^>]+>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) {
      out += decodeXmlEntities(m[1]);
      continue;
    }
    const tag = m[0];
    if (tag.startsWith("</w:p>")) out += "\n";
    else if (tag.startsWith("<w:tab")) out += "\t";
    else if (tag.startsWith("<w:br")) out += "\n";
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** Extracts plain text from a .docx resume. Throws on files that are not valid docx packages. */
export function extractDocxText(bytes: Uint8Array): string {
  const entries = readZipEntries(bytes);
  const doc = entries.find((e) => e.name === "word/document.xml");
  if (!doc) throw new Error("Not a valid .docx package (word/document.xml missing)");
  const xml = new TextDecoder().decode(readEntry(bytes, doc));
  const text = xmlToText(xml);
  if (!text) throw new Error("The .docx contains no readable text");
  return text;
}

// ---------------------------------------------------------------------------
// Minimal DOCX writer — produces a small but spec-shaped package. Used by the
// test suite for round-trip verification (and handy for demos/scripts).
// ---------------------------------------------------------------------------

let CRC_TABLE: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const u16 = (v: number) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
const u32 = (v: number) =>
  new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);

/** Builds a minimal, standards-shaped .docx containing one paragraph per entry. */
export function buildMinimalDocx(paragraphs: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`)
    .join("");
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}</w:body></w:document>`;
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="${DOCX_MIME}"/>` +
    `</Types>`;

  const enc = new TextEncoder();
  const files: { name: string; data: Uint8Array }[] = [
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "word/document.xml", data: enc.encode(documentXml) }
  ];

  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const deflated = deflateRawSync(f.data);
    const crc = crc32(f.data);
    const nameB = enc.encode(f.name);
    const localStart = offset;
    const localPart = concat([
      u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0),
      u32(crc), u32(deflated.length), u32(f.data.length),
      u16(nameB.length), u16(0), nameB, deflated
    ]);
    local.push(localPart);
    central.push(
      concat([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0),
        u32(crc), u32(deflated.length), u32(f.data.length),
        u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(localStart),
        nameB
      ])
    );
    offset += localPart.length;
  }
  const centralDir = concat(central);
  const eocd = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralDir.length), u32(offset), u16(0)
  ]);
  return concat([...local, centralDir, eocd]);
}
