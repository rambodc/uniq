// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("./api", () => ({
  listLocations: vi.fn(),
  resolveLocation: vi.fn(),
  removeLocation: vi.fn(),
  setVisibility: vi.fn(),
}));
vi.mock("../../shared/maps/LocationMap", () => ({ default: () => <div data-testid="map" /> }));
import {
  listLocations,
  resolveLocation,
  removeLocation,
  setVisibility,
  type Location,
} from "./api";
import LsdFinder from "./LsdFinder";
let root: Root, host: HTMLDivElement;
const location: Location = {
  canonical: "10-02-062-04-W4M",
  latitude: 54.335234,
  longitude: -110.489662,
  boundary: [],
  visible: true,
  updatedAt: "2026-09-11",
  source: "https://example.com",
  version: "test",
};
const click = async (text: string) => {
  const b = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  );
  expect(b).toBeTruthy();
  await act(async () => b!.click());
};
const type = async (value: string) =>
  act(async () => {
    const input = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const mount = async () =>
  act(async () =>
    root.render(
      <MemoryRouter>
        <LsdFinder />
      </MemoryRouter>,
    ),
  );
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.mocked(listLocations).mockResolvedValue([]);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
it("restores saved pins and keeps map mounted through collapse", async () => {
  vi.mocked(listLocations).mockResolvedValue([location]);
  await mount();
  const map = host.querySelector('[data-testid="map"]');
  expect(host.textContent).toContain("Approximate LSD location");
  await click("Your places");
  expect(host.querySelector('[data-testid="map"]')).toBe(map);
  await click("Search & saved locations");
  expect(host.textContent).toContain(location.canonical);
});
it("saves a successful search, retains a newer draft and avoids duplicate list entries", async () => {
  vi.mocked(listLocations).mockResolvedValue([location]);
  let finish!: (v: Awaited<ReturnType<typeof resolveLocation>>) => void;
  vi.mocked(resolveLocation).mockReturnValue(
    new Promise((r) => {
      finish = r;
    }),
  );
  await mount();
  await type("10-2-62-4-W4");
  await click("Find location");
  await type("a new draft");
  await act(async () => finish({ location, suggestions: [] }));
  expect(host.querySelector("input")!.value).toBe("a new draft");
  expect(host.querySelectorAll(".lsd-saved article")).toHaveLength(1);
});
it("requires choosing a suggestion and preserves input on failure", async () => {
  vi.mocked(resolveLocation)
    .mockResolvedValueOnce({
      suggestions: [
        { canonical: location.canonical, reason: "Correct separator" },
      ],
      message: "Choose",
    })
    .mockRejectedValueOnce(new Error("Service unavailable"));
  await mount();
  await type("10/2/62/4/W4");
  await click("Find location");
  expect(host.querySelectorAll(".lsd-saved article")).toHaveLength(0);
  await click(location.canonical);
  expect(resolveLocation).toHaveBeenCalledTimes(2);
  expect(host.querySelector("input")!.value).toBe("10/2/62/4/W4");
  expect(host.textContent).toContain("Service unavailable");
});
it("hides and removes only after successful server writes", async () => {
  vi.mocked(listLocations).mockResolvedValue([location]);
  vi.mocked(setVisibility).mockResolvedValue({});
  vi.mocked(removeLocation).mockResolvedValue({});
  await mount();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label^="Hide "]')!.click(),
  );
  expect(host.textContent).toContain("Hidden from map");
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label^="Remove "]')!.click(),
  );
  expect(host.querySelectorAll(".lsd-saved article")).toHaveLength(0);
});
it("does not submit while initial history is loading", async () => {
  vi.mocked(listLocations).mockReturnValue(new Promise(() => {}));
  await mount();
  await type("10-2-62-4-W4");
  await click("Find location");
  expect(resolveLocation).not.toHaveBeenCalled();
});
