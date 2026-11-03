import type { Inquiry, OpenXpressWell, UserRecord, XpressBoard } from "../core/api";

export type InventoryPreviewData = { xpress?: XpressBoard; openWell?: OpenXpressWell; openWells?: Record<string, OpenXpressWell> };

/** Dev-only fixtures for local screenshots. Production builds drop this branch. */
export function previewActive() {
  if (!import.meta.env.DEV) return false;
  return (globalThis as { __UNIQ_PREVIEW__?: boolean }).__UNIQ_PREVIEW__ === true;
}
export function previewInquiries(): Inquiry[] | null {
  if (!import.meta.env.DEV) return null;
  const data = (globalThis as { __UNIQ_PREVIEW_DATA__?: { inquiries?: Inquiry[] } }).__UNIQ_PREVIEW_DATA__;
  return data?.inquiries ?? null;
}
export function previewInventory(): InventoryPreviewData | null {
  if (!import.meta.env.DEV) return null;
  const data = (globalThis as { __UNIQ_PREVIEW_DATA__?: { inventory?: InventoryPreviewData } }).__UNIQ_PREVIEW_DATA__;
  return data?.inventory ?? null;
}
export function previewUsers(): UserRecord[] | null {
  if (!import.meta.env.DEV) return null;
  const data = (globalThis as { __UNIQ_PREVIEW_DATA__?: { users?: UserRecord[] } }).__UNIQ_PREVIEW_DATA__;
  return data?.users ?? null;
}
