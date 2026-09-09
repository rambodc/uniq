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
  generateGeometry: vi.fn(),
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
  it("opens Costs with three tabs and loads existing 3D only on demand", async () => {
    await render();
    expect(host.textContent).toContain("20.00");
    expect(
      Array.from(
        host.querySelectorAll('nav[aria-label="FluidLab sections"] button'),
      ).map((b) => b.textContent),
    ).toEqual(["Costs", "Mud", "Chat"]);
    expect(host.querySelector('[data-testid="scene"]')).toBeNull();
    const view = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "View well",
    );
    await act(async () => view!.click());
    expect(host.querySelector('[data-testid="scene"]')).toBeTruthy();
  });
  it("keeps Chat mounted when scrollIntoView returns a promise and sends the selected scope", async () => {
    HTMLElement.prototype.scrollIntoView = vi
      .fn()
      .mockReturnValue(Promise.resolve());
    vi.mocked(api.askChat).mockResolvedValue({
      id: "m",
      question: "cost",
      answer: "10.00",
      citations: ["source"],
      highlights: [],
      version: "v1",
      createdAt: "2025-09-01",
    });
    await render();
    const report = host.querySelector<HTMLSelectElement>(
      'select[aria-label="Report"]',
    )!;
    await act(async () => {
      report.value = "Report 1";
      report.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click('button[aria-label="Chat"]');
    expect(host.textContent).toContain("Ask the data.");
    await click(".fl-prompts button");
    expect(api.askChat).toHaveBeenCalledWith(
      sample.well,
      expect.any(String),
      "Report 1",
      null,
    );
    await click(".fl-message .fl-inline button");
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain(
      "Products!C2",
    );
  });
  it("allows cancelling an active import without disabling the tabs", async () => {
    const job = {
      id: "job",
      wellId: "well",
      status: "processing",
      stage: "mapping",
      createdAt: new Date().toISOString(),
      files: [],
      attempts: 1,
    };
    vi.mocked(api.getHistory).mockResolvedValue({
      versions: [],
      imports: [job],
    });
    vi.mocked(api.cancelImport).mockResolvedValue({});
    await render();
    await click('button[aria-label="Mud"]');
    expect(host.textContent).toContain("Mud & reports");
    const cancel = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel import",
    );
    await act(async () => cancel!.click());
    expect(api.cancelImport).toHaveBeenCalledWith("job");
    expect(host.textContent).toContain("delete and upload again");
  });
  it("does not generate geometry merely by opening a new well view", async () => {
    vi.mocked(api.getWell).mockResolvedValue({
      ...sample,
      geometry: [],
      next: null,
    });
    await render();
    const view = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "View well",
    );
    await act(async () => view!.click());
    expect(api.generateGeometry).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Generate detailed 3D");
  });
});
