import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { extractZipEntry, inspectZip, MAX_ZIP_BYTES } from "./zip";

const archive = () => new Blob([zipSync({ "sample.txt": strToU8("a valid well package") })]);
describe("bounded ZIP inspection and extraction", () => {
  it("inspects only bounded slices even for a sparse 1 GB archive", async () => {
    const zip = zipSync({ "sample.txt": strToU8("data") }), padding = MAX_ZIP_BYTES - zip.length, end = new DataView(zip.buffer), eocd = zip.length - 22;
    const offset = end.getUint32(eocd + 16, true); end.setUint32(eocd + 16, offset + padding, true); end.setUint32(offset + 42, padding, true);
    let maximumRead = 0;
    const sparse = { size: MAX_ZIP_BYTES, slice: (start: number, finish: number) => { maximumRead = Math.max(maximumRead, finish - start); const output = new Uint8Array(finish - start); const overlap = Math.max(start, padding); output.set(zip.slice(overlap - padding, finish - padding), overlap - start); return new Blob([output]); } } as Blob;
    expect((await inspectZip(sparse))[0].name).toBe("sample.txt");
    expect(maximumRead).toBeLessThanOrEqual(65557);
  });
  it("enforces the compressed size limit before reading", async () => {
    await expect(inspectZip({ size: MAX_ZIP_BYTES + 1 } as Blob)).rejects.toThrow("1 GB");
  });
  it("extracts sequentially and verifies checksums", async () => {
    const file = archive(), [entry] = await inspectZip(file), chunks: Uint8Array[] = [];
    await extractZipEntry(file, entry, 1000, (chunk) => chunks.push(chunk));
    expect(await new Blob(chunks as BlobPart[]).text()).toBe("a valid well package");
    await expect(extractZipEntry(file, { ...entry, crc: 0 }, 1000, () => {})).rejects.toThrow("checksum");
    await expect(extractZipEntry(file, { ...entry, originalSize: 1 }, 1000, () => {})).rejects.toThrow("extraction limit");
  });
  it("stops before reading after cancellation", async () => {
    const file = archive(), [entry] = await inspectZip(file), controller = new AbortController(); controller.abort();
    await expect(inspectZip(file, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(extractZipEntry(file, entry, 1000, () => {}, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("rejects encryption, ZIP64, malformed directories, and duplicate names", async () => {
    for (const kind of ["encrypted", "zip64", "malformed"]) {
      const buffer = new Uint8Array(await archive().arrayBuffer()), data = new DataView(buffer.buffer), central = data.getUint32(buffer.length - 6, true);
      if (kind === "encrypted") data.setUint16(central + 8, 1, true);
      if (kind === "zip64") data.setUint32(central + 24, 0xffffffff, true);
      if (kind === "malformed") data.setUint32(central, 0, true);
      await expect(inspectZip(new Blob([buffer]))).rejects.toThrow();
    }
    const duplicate = zipSync({ a: strToU8("x"), b: strToU8("y") });
    const d = new DataView(duplicate.buffer), offset = d.getUint32(duplicate.length - 6, true), second = offset + 47;
    duplicate[second + 46] = 97;
    await expect(inspectZip(new Blob([duplicate]))).rejects.toThrow();
  });
  it("bounds individual reads during large compressible extraction", async () => {
    const data = new Uint8Array(8_000_000).fill(97), file = new Blob([zipSync({ "large.csv": data })]), [entry] = await inspectZip(file);
    let count = 0;
    await extractZipEntry(file, entry, data.length, (chunk) => { count += chunk.length; });
    expect(count).toBe(data.length);
  });
});
