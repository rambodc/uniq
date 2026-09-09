// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import WellViewer from "./WellViewer";

const state = vi.hoisted(() => ({ cancel: vi.fn() }));
vi.mock("./useWellLibrary", () => ({ useWellLibrary: () => ({ wells: [], cancel: state.cancel }) }));
vi.mock("motion/react", () => ({ useReducedMotion: () => true }));
let root: Root, container: HTMLDivElement;
const navigate = vi.fn();
const click = async (selector: string) => { await act(async () => { container.querySelector<HTMLElement>(selector)!.click(); }); };
beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); this.querySelector<HTMLButtonElement>("button")?.focus(); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<WellViewer navigate={navigate}/>));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("keeps the library and well information in separate keyboard-accessible tabs", async () => {
  expect(container.querySelector<HTMLElement>("#well-library-panel")!.hidden).toBe(false);
  expect(container.querySelector<HTMLElement>("#well-details-panel")!.hidden).toBe(true);
  await click("#well-tab-details");
  expect(container.querySelector<HTMLElement>("#well-library-panel")!.hidden).toBe(true);
  expect(container.querySelector("#well-details-panel")!.textContent).toContain("No well open yet");
  await act(async () => { container.querySelector("#well-tab-details")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); });
  expect(document.activeElement?.id).toBe("well-tab-library");
  expect(container.querySelector("#well-tab-library")!.getAttribute("aria-selected")).toBe("true");
});

it("keeps the viewer open on close or Escape and restores back-button focus", async () => {
  const back = container.querySelector<HTMLButtonElement>('[aria-label="Back to portal"]')!;
  back.focus(); await click('[aria-label="Back to portal"]');
  expect(container.querySelector("dialog")!.open).toBe(true);
  await click('[aria-label="Close exit dialog"]');
  expect(container.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(back);
  await click('[aria-label="Back to portal"]');
  await act(async () => { container.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })); });
  expect(container.querySelector("dialog")).toBeNull();
  expect(navigate).not.toHaveBeenCalled(); expect(state.cancel).not.toHaveBeenCalled();
});

it("offers a new portal tab and only cancels viewer work when exiting in this tab", async () => {
  await click('[aria-label="Back to portal"]');
  const link = container.querySelector<HTMLAnchorElement>("dialog a")!;
  expect(link.getAttribute("href")).toBe("/portal"); expect(link.target).toBe("_blank"); expect(link.rel).toContain("noopener");
  link.addEventListener("click", (event) => event.preventDefault());
  await click("dialog a");
  expect(container.querySelector("dialog")).toBeNull(); expect(navigate).not.toHaveBeenCalled(); expect(state.cancel).not.toHaveBeenCalled();
  await click('[aria-label="Back to portal"]'); await click(".well-exit-actions button");
  expect(state.cancel).toHaveBeenCalledOnce(); expect(navigate).toHaveBeenCalledWith("/portal");
});

it("only confirms replacement explicitly, allowing close and Escape to keep the well", async () => {
  const { default: ReplaceWellDialog } = await import("./ReplaceWellDialog");
  const close = vi.fn(), confirm = vi.fn();
  await act(async () => root.render(<ReplaceWellDialog currentName="Current well" nextName="Next well" onClose={close} onConfirm={confirm}/>));
  expect(container.textContent).toContain("Current well"); expect(container.textContent).toContain("Next well");
  await click('[aria-label="Keep current well"]');
  expect(close).toHaveBeenCalledOnce(); expect(confirm).not.toHaveBeenCalled();
  await act(async () => { container.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })); });
  expect(close).toHaveBeenCalledTimes(2); expect(confirm).not.toHaveBeenCalled();
  await click(".well-confirm-primary"); expect(confirm).toHaveBeenCalledOnce();
});

it("shows branded progress and offers cancellation only for cancellable operations", async () => {
  const { default: WellLoader } = await import("./WellLoader");
  const cancel = vi.fn();
  await act(async () => root.render(<WellLoader message="Uploading original ZIP…" percent={42} onCancel={cancel}/>));
  expect(container.querySelector("img")!.getAttribute("src")).toBe("/brand/uniqenergy-mark-64.png");
  expect(container.querySelector("progress")!.value).toBe(42);
  expect(container.querySelector('[role="status"]')!.textContent).toBe("Uploading original ZIP…");
  await click("button"); expect(cancel).toHaveBeenCalledOnce();
  await act(async () => root.render(<WellLoader message="Deleting well…"/>));
  expect(container.querySelector("button")).toBeNull(); expect(container.querySelector("progress")).toBeNull();
});
