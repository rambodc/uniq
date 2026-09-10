// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("./api", () => ({ listWells: vi.fn() }));
import { listWells } from "./api";
import { useWellSearch } from "./useWellSearch";
let root: Root, host: HTMLDivElement, hook: ReturnType<typeof useWellSearch>;
function Harness() {
  const state = useWellSearch();
  useEffect(() => {
    hook = state;
  });
  return null;
}
const wait = async (ms = 1) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  root = createRoot(host);
  vi.mocked(listWells).mockResolvedValue({ wells: [], cursor: null });
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});
it("uses server cursors for Previous/Next and resets after search changes", async () => {
  vi.mocked(listWells).mockResolvedValue({ wells: [], cursor: "next-page" });
  await act(async () => root.render(<Harness />));
  await wait(251);
  await wait();
  await act(async () => hook.more());
  await wait();
  expect(listWells).toHaveBeenLastCalledWith("", "next-page");
  expect(hook.page).toBe(1);
  await act(async () => hook.setSearch("Target"));
  await wait(251);
  await wait();
  expect(listWells).toHaveBeenLastCalledWith("Target", null);
  expect(hook.page).toBe(0);
});
it("ignores an old response arriving after the input has changed", async () => {
  await act(async () => root.render(<Harness />));
  await wait(251);
  await wait();
  let resolve!: (v: Awaited<ReturnType<typeof listWells>>) => void;
  vi.mocked(listWells).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await act(async () => hook.setSearch("old"));
  await wait(251);
  await wait();
  await act(async () => hook.setSearch("new"));
  await act(async () =>
    resolve({ wells: [{ id: "stale" } as never], cursor: null }),
  );
  expect(hook.wells).toEqual([]);
  await wait(251);
  await wait();
  expect(listWells).toHaveBeenLastCalledWith("new", null);
  expect(hook.loading).toBe(false);
});
