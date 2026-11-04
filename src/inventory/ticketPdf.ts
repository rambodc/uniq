import { getBlob, getDownloadURL, ref } from "firebase/storage";
import { previewActive } from "../auth/preview";
import { storage } from "../core/firebase";

const XPRESS_PDF = /^inventoryBot\/tickets\/xpress\/[^/]+\.pdf$/;

export function canOpenTicketPdf(ticket: { hasPdf?: boolean; pdfPath?: string }) {
  return ticket.hasPdf === true && XPRESS_PDF.test(ticket.pdfPath || "");
}

/** Open the tab in the click turn, then point it at the PDF. getBlob avoids creating a public download token. */
export async function openTicketPdf(path: string) {
  if (!XPRESS_PDF.test(path)) throw new Error("That ticket has no PDF.");
  const tab = window.open("about:blank", "_blank");
  if (!tab) throw new Error("Allow pop-ups to open the ticket PDF.");
  try { tab.opener = null; } catch { /* the blank tab can already be sealed */ }
  try {
    const url = previewActive() ? previewPdfUrl() : await blobUrl(path);
    tab.location.href = url;
  } catch (error) {
    if (!previewActive() && corsBlocked(error)) {
      try {
        tab.location.href = await getDownloadURL(ref(storage, path));
        return;
      } catch { /* the download URL failed too */ }
    }
    tab.close();
    throw new Error("The PDF could not be opened.");
  }
}

async function blobUrl(path: string) {
  const blob = await getBlob(ref(storage, path));
  const typed = blob.type ? blob : new Blob([blob], { type: "application/pdf" });
  return URL.createObjectURL(typed);
}

function corsBlocked(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "storage/unauthorized" || code === "storage/unauthenticated" || code === "storage/object-not-found" || code === "storage/canceled" || code === "storage/invalid-url") return false;
  const message = error instanceof Error ? error.message : String(error);
  return code === "storage/unknown" || code === "storage/retry-limit-exceeded" || /cors|failed to fetch|network|load failed/i.test(message);
}

function previewPdfUrl() {
  const bytes = "%PDF-1.1\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}
