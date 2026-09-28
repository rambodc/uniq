// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const pdf = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument: pdf.getDocument }));
import PdfViewer from "./PdfViewer";

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
  pdf.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 3, getPage: async () => ({ getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 150 * scale }), render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }) }) }) });
});
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); host.remove(); });
it("renders pages into canvas and navigates across a multi-page PDF", async () => {
  await act(async () => root.render(<PdfViewer src="blob:invoice.pdf"/>));
  expect(host.textContent).toContain("Page 1 of 3");
  const next = host.querySelector<HTMLButtonElement>('[aria-label="Next PDF page"]')!;
  await act(async () => next.click());
  expect(host.textContent).toContain("Page 2 of 3");
  const previous = host.querySelector<HTMLButtonElement>('[aria-label="Previous PDF page"]')!;
  await act(async () => previous.click());
  expect(host.textContent).toContain("Page 1 of 3");
  expect(host.querySelector("canvas")?.width).toBeGreaterThan(0);
});
