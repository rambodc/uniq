import { Inflate } from "fflate";

export const MAX_ZIP_BYTES = 1_000_000_000;
export class WellPackageError extends Error { constructor(message: string) { super(message); this.name = "WellPackageError"; } }
export interface ZipEntry { name: string; originalSize: number; compressedSize: number; offset: number; method: number; flags: number; crc: number }
const invalid = () => new WellPackageError("The ZIP package is malformed or unsupported.");
const checkAbort = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException("Import cancelled", "AbortError"); };
async function bytes(file: Blob, start: number, length: number, signal?: AbortSignal) {
  checkAbort(signal);
  if (start < 0 || length < 0 || start + length > file.size) throw invalid();
  const result = new Uint8Array(await file.slice(start, start + length).arrayBuffer()); checkAbort(signal); return result;
}
const view = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength);
export async function inspectZip(file: Blob, signal?: AbortSignal): Promise<ZipEntry[]> {
  if (file.size > MAX_ZIP_BYTES) throw new WellPackageError("This ZIP exceeds the 1 GB compressed package limit.");
  if (file.size < 22) throw invalid();
  const tailOffset = Math.max(0, file.size - 65557), tail = await bytes(file, tailOffset, file.size - tailOffset, signal), end = view(tail);
  let index = tail.length - 22;
  while (index >= 0 && !(end.getUint32(index, true) === 0x06054b50 && index + 22 + end.getUint16(index + 20, true) === tail.length)) index--;
  if (index < 0) throw invalid();
  const count = end.getUint16(index + 10, true), length = end.getUint32(index + 12, true), offset = end.getUint32(index + 16, true);
  if (count === 65535 || length === 0xffffffff || offset === 0xffffffff || (index >= 20 && end.getUint32(index - 20, true) === 0x07064b50)) throw new WellPackageError("ZIP64 packages are not supported. Export a standard ZIP.");
  if (end.getUint16(index + 4, true) || end.getUint16(index + 6, true) || end.getUint16(index + 8, true) !== count || offset + length !== tailOffset + index) throw invalid();
  if (count > 1000) throw new WellPackageError("This ZIP contains too many entries.");
  if (length > 8_000_000) throw new WellPackageError("This ZIP directory exceeds its safe metadata limit.");
  const directory = await bytes(file, offset, length, signal), central = view(directory), entries: ZipEntry[] = [], names = new Set<string>();
  let position = 0;
  for (let i = 0; i < count; i++) {
    checkAbort(signal);
    if (position + 46 > length || central.getUint32(position, true) !== 0x02014b50) throw invalid();
    const flags = central.getUint16(position + 8, true), method = central.getUint16(position + 10, true), crc = central.getUint32(position + 16, true), compressedSize = central.getUint32(position + 20, true), originalSize = central.getUint32(position + 24, true), nameLength = central.getUint16(position + 28, true), extraLength = central.getUint16(position + 30, true), commentLength = central.getUint16(position + 32, true), localOffset = central.getUint32(position + 42, true);
    const next = position + 46 + nameLength + extraLength + commentLength;
    if (next > length || nameLength > 4096 || central.getUint16(position + 34, true) !== 0) throw invalid();
    if (flags & 0x41) throw new WellPackageError("Encrypted ZIP packages are not supported.");
    if (compressedSize === 0xffffffff || originalSize === 0xffffffff || localOffset === 0xffffffff) throw new WellPackageError("ZIP64 packages are not supported. Export a standard ZIP.");
    if (![0, 8].includes(method) || localOffset + 30 + compressedSize > offset) throw invalid();
    const name = new TextDecoder().decode(directory.subarray(position + 46, position + 46 + nameLength));
    if (!name || names.has(name) || name.includes("\0")) throw invalid();
    names.add(name); entries.push({ name, originalSize, compressedSize, offset: localOffset, method, flags, crc }); position = next;
  }
  if (position !== length) throw invalid();
  return entries;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => { for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0; });
export async function extractZipEntry(file: Blob, entry: ZipEntry, limit: number, consume: (chunk: Uint8Array, final: boolean) => void, signal?: AbortSignal, progress?: (read: number) => void) {
  const header = view(await bytes(file, entry.offset, 30, signal));
  if (header.getUint32(0, true) !== 0x04034b50 || header.getUint16(6, true) !== entry.flags || header.getUint16(8, true) !== entry.method) throw invalid();
  const nameLength = header.getUint16(26, true), extraLength = header.getUint16(28, true);
  const name = new TextDecoder().decode(await bytes(file, entry.offset + 30, nameLength, signal));
  if (name !== entry.name) throw invalid();
  const start = entry.offset + 30 + nameLength + extraLength;
  if (start + entry.compressedSize > file.size || entry.originalSize > limit) throw invalid();
  let count = 0, crc = 0xffffffff;
  const output = (chunk: Uint8Array, final: boolean) => {
    checkAbort(signal); count += chunk.length;
    if (count > limit || count > entry.originalSize) throw new WellPackageError(`${entry.name} exceeds its safe extraction limit.`);
    for (const value of chunk) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
    consume(chunk, final);
  };
  const inflate = entry.method === 8 ? new Inflate(output) : null;
  // Small sequential reads provide backpressure; no whole-archive buffer or queued inflaters.
  for (let offset = 0; offset < entry.compressedSize; offset += 16384) {
    const length = Math.min(16384, entry.compressedSize - offset), chunk = await bytes(file, start + offset, length, signal), final = offset + length === entry.compressedSize;
    try { if (inflate) inflate.push(chunk, final); else output(chunk, final); } catch (error) { if (error instanceof WellPackageError || (error instanceof DOMException && error.name === "AbortError")) throw error; throw invalid(); }
    progress?.(offset + length);
  }
  if (!entry.compressedSize) output(new Uint8Array(), true);
  if (count !== entry.originalSize || ((crc ^ 0xffffffff) >>> 0) !== entry.crc) throw new WellPackageError(`${entry.name} is incomplete or has a checksum mismatch.`);
}
