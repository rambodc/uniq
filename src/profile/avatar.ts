const MAX_FILE = 5 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function check(file: File) {
  if (!TYPES.has(file.type)) return "Use a JPEG, PNG or WebP image.";
  if (file.size > MAX_FILE) return "The image must be 5 MB or smaller.";
  return "";
}

async function square(bitmap: ImageBitmap, side: number, quality: number) {
  const canvas = document.createElement("canvas");
  const crop = Math.min(bitmap.width, bitmap.height);
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This image could not be prepared.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, side, side);
  context.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, side, side);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("This image could not be prepared.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Checks the chosen file and makes the 256px avatar and 96px thumbnail the server expects, as base64 JPEGs. */
export async function prepareAvatar(file: File): Promise<{ photo: string; thumb: string }> {
  const problem = check(file);
  if (problem) throw new Error(problem);
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error("This image could not be opened."); }
  try { return { photo: await square(bitmap, 256, 0.86), thumb: await square(bitmap, 96, 0.8) }; } finally { bitmap.close(); }
}
