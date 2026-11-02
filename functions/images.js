// Image checks for profile photos. No Firebase calls here, so it is unit-testable.
import { Buffer } from "node:buffer";
import { HttpsError } from "firebase-functions/v2/https";

const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const invalid = (message) => new HttpsError("invalid-argument", message);

const hasBytes = (buffer, bytes, offset = 0) => bytes.every((byte, index) => buffer[offset + index] === byte);
/** Checks the real file signature, not just the type the browser claims. */
export function sniffImage(buffer) {
  if (buffer.length > 12 && hasBytes(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (buffer.length > 12 && hasBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (buffer.length > 12 && hasBytes(buffer, [0x52, 0x49, 0x46, 0x46]) && hasBytes(buffer, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}
/** Decodes base64 of at most `maxBytes` and returns { buffer, type, ext }, or throws if it is not really a JPEG, PNG or WebP. */
export function decodeImage(base64, label, maxBytes) {
  if (typeof base64 !== "string" || !base64 || base64.length > Math.ceil(maxBytes * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw invalid(`The ${label} is invalid or too large.`);
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > maxBytes) throw invalid(`The ${label} is too large.`);
  const type = sniffImage(buffer);
  if (!type) throw invalid("Photos must be JPEG, PNG or WebP images.");
  return { buffer, type, ext: EXTENSIONS[type] };
}
