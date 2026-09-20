// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const session = vi.hoisted(() => ({ user: { role: "admin" } }));
vi.mock("../../portal/AuthContext", () => ({ usePortalAuth: () => session }));
vi.mock("./api", () => ({ connection: vi.fn(), labels: vi.fn(), messages: vi.fn(), message: vi.fn(), add: vi.fn(), queue: vi.fn(), queueBody: vi.fn(), update: vi.fn(), remove: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), documentBlob: vi.fn() }));
import * as api from "./api";
import InvoiceQb, { previewable } from "./InvoiceQb";
let root: Root, host: HTMLDivElement;
const summary = { id: "mail1", subject: "Supplier invoice", sender: "supplier@example.com", date: "2026-09-01T12:00:00Z", attachmentCount: 1, queued: false };
beforeEach(() => {
  vi.resetAllMocks(); session.user = { role: "admin" };
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  vi.mocked(api.connection).mockResolvedValue({ configured: true, connected: true, email: "invoices@example.com" });
  vi.mocked(api.labels).mockResolvedValue({ labels: [{ id: "INBOX", name: "Inbox" }] });
  vi.mocked(api.messages).mockResolvedValue({ messages: [summary], cursor: null });
  vi.mocked(api.message).mockResolvedValue({ ...summary, body: '<img src="https://tracker.test">Invoice text', attachments: [{ id: "0_1", name: "invoice.pdf", mime: "application/pdf", size: 3 }] });
  vi.mocked(api.queue).mockResolvedValue({ entries: [], cursor: null });
  vi.mocked(api.add).mockResolvedValue({ ids: ["candidate"] });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const render = async () => { await act(async () => root.render(<InvoiceQb/>)); };
const click = async (text: string) => { const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text)); expect(button).toBeTruthy(); await act(async () => button!.click()); };
it("browses emails, renders inert body and queues only selected documents", async () => {
  await render();
  expect(api.messages).toHaveBeenCalledWith(expect.objectContaining({ label: "INBOX" }), null);
  await click("Supplier invoice");
  expect(host.querySelector('img[src="https://tracker.test"]')).toBeNull();
  const boxes = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  await act(async () => boxes[1].click());
  await click("Add to bill queue");
  expect(api.add).toHaveBeenCalledWith("mail1", ["0_1"], false);
  expect(host.textContent).toContain("1 candidate added");
  expect(host.textContent).toContain("Documents in bill queue");
});
it("supports separate candidates and preserves selection when saving fails", async () => {
  await render(); await click("Supplier invoice");
  const boxes = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  await act(async () => { boxes[0].click(); boxes[1].click(); boxes[2].click(); });
  vi.mocked(api.add).mockRejectedValue(new Error("Attachment unavailable"));
  await click("Add to bill queue");
  expect(api.add).toHaveBeenCalledWith("mail1", ["body", "0_1"], true);
  expect(host.textContent).toContain("Attachment unavailable");
  expect(boxes[0].checked).toBe(true);
});
it("uses pagination and hides admin connection controls from team members", async () => {
  session.user = { role: "employee" };
  vi.mocked(api.messages).mockResolvedValueOnce({ messages: [summary], cursor: "page2" });
  await render();
  expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Connection")).toBe(false);
  await click("Load more");
  expect(api.messages).toHaveBeenLastCalledWith(expect.anything(), "page2");
});
it("shows a useful disconnected setup state and keeps the queue available", async () => {
  vi.mocked(api.connection).mockResolvedValue({ configured: false, connected: false, email: null });
  await render(); await click("Open Connection");
  expect(host.textContent).toContain("Google setup is required");
  await click("Bill Queue");
  expect(host.textContent).toContain("Your bill queue is empty");
  expect(api.messages).not.toHaveBeenCalled();
});
it("previews only passive supported file formats", () => {
  expect(previewable("application/pdf")).toBe(true);
  expect(previewable("image/png")).toBe(true);
  expect(previewable("image/svg+xml")).toBe(false);
  expect(previewable("text/html")).toBe(false);
});
