// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { Dataset } from "./model";
vi.mock("./api", () => ({
  listWells: vi.fn(),
  getWell: vi.fn(),
  getHistory: vi.fn(),
  getChat: vi.fn(),
  askChat: vi.fn(),
  getSources: vi.fn(),
  saveWell: vi.fn(),
  cancelImport: vi.fn(),
}));
vi.mock("./WellScene", () => ({
  default: () => <div data-testid="scene">3D scene</div>,
}));
import * as api from "./api";
import FluidLab from "./FluidLab";
const f = (value: string) => ({
  value,
  unit: null,
  sources: ["source"],
  status: "reported" as const,
});
const sample: Dataset = {
  well: {
    id: "well",
    name: "Test well",
    status: "ready",
    version: "v1",
    revision: 1,
    updatedAt: "2025-09-01",
  },
  records: [
    {
      id: "report",
      kind: "report",
      label: "Report 1",
      report: null,
      product: null,
      branch: null,
      facts: {
        createdDate: f("2025-09-01"),
        serviceCost: f("10"),
        density: f("1020"),
      },
    },
    {
      id: "product",
      kind: "product",
      label: "Clay",
      report: null,
      product: null,
      branch: null,
      facts: {
        package: f("20 kg"),
        unitPrice: f("2.5"),
        totalUsed: f("4"),
        totalCost: f("10"),
      },
    },
    {
      id: "usage",
      kind: "usage",
      label: "Clay usage",
      report: "Report 1",
      product: "Clay",
      branch: null,
      facts: { quantity: f("4"), unitPrice: f("2.5"), package: f("20 kg") },
    },
  ],
  geometry: [
    {
      id: "leg",
      label: "Leg 1",
      startM: 100,
      endM: 600,
      diameterMm: 200,
      parent: null,
      inclination: 90,
      azimuth: 0,
      visible: true,
      status: "interpreted",
      sources: [],
    },
  ],
  wellbore: null,
  currency: null,
  issues: [],
  coverage: { mapped: 10, populated: 20 },
  summary: {
    currencies: [
      {
        currency: "unspecified",
        productCost: "10.00",
        serviceCost: "10.00",
        totalCost: "20.00",
      },
    ],
    productCost: "10.00",
    serviceCost: "10.00",
    totalCost: "20.00",
    products: [
      {
        product: "Clay",
        currency: "unspecified",
        cost: "10.00",
        sources: ["source"],
      },
    ],
    reports: 1,
    branches: 1,
  },
  allocations: [],
};
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.mocked(api.listWells).mockResolvedValue([sample.well]);
  vi.mocked(api.getWell).mockResolvedValue({
    ...structuredClone(sample),
    next: null,
  });
  vi.mocked(api.getHistory).mockResolvedValue({ versions: [], imports: [] });
  vi.mocked(api.getChat).mockResolvedValue([]);
  vi.mocked(api.getSources).mockResolvedValue({
    sources: [
      {
        id: "source",
        file: "report.xlsx",
        sheet: "Products",
        cell: "C2",
        raw: 2.5,
        display: "2.50",
        formula: null,
        row: 2,
        column: 3,
      },
    ],
    next: null,
    total: 1,
  });
  vi.mocked(api.saveWell).mockResolvedValue({ revision: 2, version: "v2" });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});
const render = () =>
  act(async () => {
    root.render(
      <MemoryRouter>
        <FluidLab wellId="well" navigate={vi.fn()} />
      </MemoryRouter>,
    );
  });
const click = async (selector: string) => {
  const button = host.querySelector<HTMLButtonElement>(selector);
  expect(button).toBeTruthy();
  await act(async () => button!.click());
};
describe("FluidLab workspace", () => {
  it("allows cancelling a processing import and explains fresh restart", async () => {
    const job = {
      id: "job",
      wellId: "well",
      status: "processing",
      stage: "notes",
      message: "Interpreting a report",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      files: [],
      attempts: 1,
    };
    vi.mocked(api.getHistory).mockResolvedValue({
      versions: [],
      imports: [job],
    });
    vi.mocked(api.cancelImport).mockResolvedValue({});
    await render();
    expect(host.textContent).toContain("Safe to leave this page");
    const cancel = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel import",
    );
    expect(cancel).toBeTruthy();
    vi.mocked(api.getHistory).mockResolvedValue({
      versions: [],
      imports: [{ ...job, status: "cancelled" }],
    });
    await act(async () => cancel!.click());
    expect(api.cancelImport).toHaveBeenCalledWith("job");
    expect(host.textContent).toContain("To start fresh: delete this well");
  });
  it("opens a saved well and synchronizes report and inventory selections", async () => {
    await render();
    expect(host.textContent).toContain("Test well");
    expect(host.textContent).toContain("20.00");
    await click('button[aria-label="Inventory"]');
    expect(host.textContent).toContain("Product balances");
    await click(".fl-timeline-reports button");
    expect(host.querySelector(".fl-active-filters")?.textContent).toContain(
      "Report 1",
    );
    await click(".fl-card-title");
    expect(host.querySelector(".fl-inspector")?.textContent).toContain("Clay");
  });
  it("opens cited source cells from an AI answer", async () => {
    vi.mocked(api.askChat).mockResolvedValue({
      id: "message",
      question: "Costs?",
      answer: "Product cost is 10.00.",
      citations: ["source"],
      highlights: [],
      version: "v1",
      createdAt: "2025-09-01",
    });
    await render();
    await click('button[aria-label="AI chat"]');
    await click(".fl-prompts button");
    expect(api.askChat).toHaveBeenCalled();
    expect(host.textContent).toContain("Product cost is 10.00.");
    await click(".fl-message .fl-inline button");
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain(
      "Products!C2",
    );
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain(
      "2.50",
    );
  });
  it("keeps geometry autosave active after switching away from the editor", async () => {
    await render();
    vi.useFakeTimers();
    await click('button[aria-label="Well editor"]');
    const add = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Add branch"),
    );
    await act(async () => add!.click());
    await click('button[aria-label="Overview"]');
    await act(async () => vi.advanceTimersByTimeAsync(1100));
    expect(api.saveWell).toHaveBeenCalledWith(
      sample.well,
      expect.objectContaining({
        geometry: expect.arrayContaining([
          expect.objectContaining({ label: "Branch 2" }),
        ]),
      }),
    );
  });
});
