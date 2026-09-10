import { HttpsError } from "firebase-functions/v2/https";
import { docId, text } from "../../core/values.js";
const MAX_ZIP_BYTES = 1_000_000_000;
export function validId(value) {
  const id = docId(value, "well");
  if (!/^[\w-]+$/.test(id))
    throw new HttpsError("invalid-argument", "Choose a valid well.");
  return id;
}
export function validUpload(data) {
  const name = text(data?.name, "well name", 120),
    originalName = text(data?.originalName, "ZIP filename", 240);
  if (
    !/\.zip$/i.test(originalName) ||
    /[/\\]/.test(originalName) ||
    !Number.isSafeInteger(data?.sizeBytes) ||
    data.sizeBytes < 1 ||
    data.sizeBytes > MAX_ZIP_BYTES ||
    !["detailed", "balanced", "compact"].includes(data?.detail)
  )
    throw new HttpsError(
      "invalid-argument",
      "Choose a well ZIP up to 1 GB and a valid detail level.",
    );
  return { name, originalName, sizeBytes: data.sizeBytes, detail: data.detail };
}
