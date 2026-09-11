// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import type { Well } from "./model";
vi.mock("./api", () => ({ prepareWellDetails: vi.fn() }));
vi.mock("../../shared/maps/LocationMap", () => ({
  default: ({
    locations,
    onSelect,
  }: {
    locations: { canonical: string; label: string }[];
    onSelect: (id: string) => void;
  }) => (
    <div data-map>
      {locations.map((l) => (
        <button key={l.canonical} onClick={() => onSelect(l.canonical)}>
          {l.label}
        </button>
      ))}
    </div>
  ),
}));
import { prepareWellDetails } from "./api";
import { useWellDetails } from "./useWellDetails";
import WellInformation from "./WellInformation";
import WellMap from "./WellMap";
let root: Root, host: HTMLDivElement, state: ReturnType<typeof useWellDetails>;
const well = (id: string): Well => ({
  id,
  name: "Well " + id,
  version: "v",
  revision: 1,
  status: "ready",
  updatedAt: "date",
});
const mapped = (id: string): Well => ({
  ...well(id),
  detailsVersion: "v",
  location: {
    status: "ready",
    fingerprint: "f",
    canonical: "10-02-062-04-W4M",
    latitude: 54.3,
    longitude: -110.4,
    boundary: "[[[-110.4,54.3],[-110.3,54.3],[-110.4,54.4],[-110.4,54.3]]]",
  },
});
function Harness({ wells }: { wells: Well[] }) {
  const value = useWellDetails(wells);
  useEffect(() => {
    state = value;
  });
  return null;
}
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
it("prepares at most three concurrently and ignores responses for a departed page", async () => {
  const pending: ((
    v: Awaited<ReturnType<typeof prepareWellDetails>>,
  ) => void)[] = [];
  vi.mocked(prepareWellDetails).mockImplementation(
    () => new Promise((r) => pending.push(r)),
  );
  await act(async () =>
    root.render(
      <Harness wells={Array.from({ length: 10 }, (_, i) => well(String(i)))} />,
    ),
  );
  expect(prepareWellDetails).toHaveBeenCalledTimes(3);
  await act(async () => root.render(<Harness wells={[well("new")]} />));
  expect(prepareWellDetails).toHaveBeenCalledTimes(3);
  await act(async () => pending[0]({ ...mapped("0"), wellId: "0" }));
  expect(prepareWellDetails).toHaveBeenLastCalledWith("new");
  await act(async () => pending[3]({ ...mapped("new"), wellId: "new" }));
  expect(state.wells.map((w) => w.id)).toEqual(["new"]);
  expect(state.wells[0].location?.status).toBe("ready");
  await act(async () => {
    pending[1]({ ...mapped("1"), wellId: "1" });
    pending[2]({ ...mapped("2"), wellId: "2" });
  });
});
it("retains only page pins, opens the selected well and restores focus after Escape", async () => {
  const choose = vi.fn(),
    expanded = vi.fn();
  await act(async () =>
    root.render(
      <WellMap
        wells={[mapped("1"), well("SK")]}
        onSelect={choose}
        onExpanded={expanded}
        retry={() => {}}
      />,
    ),
  );
  expect(host.querySelector("[data-map]")?.textContent).toBe("Well 1");
  await act(async () => {
    (host.querySelector("[data-map] button") as HTMLButtonElement).click();
  });
  expect(choose).toHaveBeenCalledWith("1");
  const expand = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Expand"),
  )!;
  expand.focus();
  await act(async () => expand.click());
  expect(expanded).toHaveBeenLastCalledWith(true);
  expect(host.querySelector("dialog[open]")).not.toBeNull();
  await act(async () =>
    host
      .querySelector("dialog")!
      .dispatchEvent(new Event("cancel", { bubbles: false, cancelable: true })),
  );
  expect(expanded).toHaveBeenLastCalledWith(false);
  expect(document.activeElement).toBe(expand);
  await act(async () =>
    root.render(
      <WellMap
        wells={[mapped("2")]}
        onSelect={choose}
        onExpanded={expanded}
        retry={() => {}}
      />,
    ),
  );
  expect(host.querySelector("[data-map]")?.textContent).toBe("Well 2");
});
it("renders spreadsheet text safely and preserves offsets, leading zeros and unknown units", async () => {
  const w = {
    ...well("SK"),
    details: {
      conflicts: [],
      facts: Object.fromEntries(
        Object.entries({
          name: "Reported name",
          license: "0359098",
          reportedTotalDepth: "1901",
          wellNotes: "Single leg HZ\n<script>alert(1)</script>",
          spudDate: "2025-03-12 GMT-0600",
        }).map(([k, value]) => [
          k,
          { value, unit: null, sources: [], status: "reported" as const },
        ]),
      ),
    },
  };
  await act(async () => root.render(<WellInformation well={w} />));
  expect(host.textContent).toContain("0359098");
  expect(host.textContent).toContain("GMT-0600");
  expect(host.textContent).not.toContain("1901 m");
  expect(host.querySelector("script")).toBeNull();
  expect(host.textContent).not.toContain("<script>");
  expect(host.textContent).not.toContain("Well notes");
});
