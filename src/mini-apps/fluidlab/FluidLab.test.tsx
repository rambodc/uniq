// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { Dataset } from "./model";
vi.mock("../../core/firebase", () => ({
  auth: { currentUser: { uid: "test" } },
}));
vi.mock("./api", () => ({
  call: vi.fn(),
  prepareWellDetails: vi.fn(),
  listWells: vi.fn(),
  createWell: vi.fn(),
  uploadFiles: vi.fn(),
  getWell: vi.fn(),
  getHistory: vi.fn(),
  getChat: vi.fn(),
  askChat: vi.fn(),
  getSources: vi.fn(),
  saveWell: vi.fn(),
  cancelImport: vi.fn(),
  generateGeometry: vi.fn(),
  getImport: vi.fn(),
  retryImport: vi.fn(),
}));
vi.mock("./SceneViewport", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
  vi.mocked(api.listWells).mockResolvedValue({
    wells: [sample.well],
    cursor: null,
  });
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
  it("opens existing 3D immediately and preserves its node across tabs and sidebar collapse", async () => {
    await render();
    expect(host.textContent).toContain("20.00");
    expect(
      Array.from(
        host.querySelectorAll('nav[aria-label="FluidLab sections"] button'),
      ).map((b) => b.textContent),
    ).toEqual(["All wells", "Well", "Costs", "Mud", "Chat"]);
    expect(
      host.querySelectorAll(
        'nav[aria-label="FluidLab sections"] button svg[aria-hidden="true"]',
      ),
    ).toHaveLength(5);
    const scene = host.querySelector('[data-testid="scene"]');
    expect(scene).toBeTruthy();
    await click('button[aria-label="Mud"]');
    await click('button[aria-label="Chat"]');
    await click('button[aria-label="Collapse information"]');
    expect(
      host.querySelector("#fl-sidebar-content")?.hasAttribute("hidden"),
    ).toBe(true);
    expect(host.querySelector('[data-testid="scene"]')).toBe(scene);
    await click('button[aria-label="Expand information"]');
    expect(api.generateGeometry).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Estimated schematic");
  });
  it("keeps management inside Well and restores the exact product list after Back", async () => {
    await render();
    const header = host.querySelector(".fl-header")!;
    expect(header.querySelectorAll("button,select,input").length).toBe(1);
    expect(header.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Back to portal",
    );
    expect(
      host
        .querySelector('button[aria-label="Well"]')
        ?.getAttribute("aria-current"),
    ).toBe("page");
    await click('button[aria-label="Costs"]');
    const panel = host.querySelector<HTMLElement>(
      '[aria-label="Costs panel"]',
    )!;
    panel.scrollTop = 150;
    await click('[aria-label="Costs panel"] .fl-list-card');
    expect(host.querySelector(".fl-tabs-shell")?.hasAttribute("hidden")).toBe(
      true,
    );
    expect(host.querySelector(".fl-detail-body")?.textContent).toContain(
      "Spend by report",
    );
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await click(".fl-detail-top button");
    expect(host.querySelector('[aria-label="Costs panel"]')).toBe(panel);
    expect(panel.scrollTop).toBe(150);
    expect(
      host
        .querySelector('button[aria-label="Costs"]')
        ?.getAttribute("aria-current"),
    ).toBe("page");
  });
  it("limits initial review to five priority groups and leaves remaining issues in Review", async () => {
    vi.mocked(api.getWell).mockResolvedValue({
      ...sample,
      next: null,
      issues: Array.from({ length: 9 }, (_, i) => ({
        id: String(i),
        code: `problem${i}`,
        message: `Issue ${i}`,
        sources: [],
        recordId: null,
        priority: "high" as const,
        status: "unresolved" as const,
      })),
    });
    await render();
    await click('button[aria-label="Well"]');
    expect(
      host.querySelectorAll('[aria-label="Priority review"] .fl-problem')
        .length,
    ).toBe(5);
    expect(host.querySelector('[aria-label="Review"]')?.textContent).toContain(
      "Other items & schematic assumptions · 4",
    );
    expect(host.querySelectorAll(".fl-problem").length).toBe(9);
  });
  it("preserves pending chat across tabs and expands only the Chat layout", async () => {
    let history: (
      m: Awaited<ReturnType<typeof api.getChat>>,
    ) => void = () => {};
    vi.mocked(api.getChat).mockImplementation(
      () =>
        new Promise((resolve) => {
          history = resolve;
        }),
    );
    let finish: (m: Awaited<ReturnType<typeof api.askChat>>) => void = () => {};
    vi.mocked(api.askChat).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    await click('button[aria-label="Chat"]');
    const input = host.querySelector(".fl-chat-form textarea");
    expect(
      host.querySelector(".fl-main")?.classList.contains("fl-chat-active"),
    ).toBe(true);
    await click(".fl-prompts button");
    expect(host.querySelector(".fl-question")?.textContent).toBe(
      vi.mocked(api.askChat).mock.calls[0][1],
    );
    expect(host.querySelector(".fl-thinking")).toBeTruthy();
    expect(host.querySelector(".fl-prompts")).toBeNull();
    await act(async () =>
      history([
        {
          id: "old",
          question: "Earlier question",
          answer: "Earlier answer",
          citations: [],
          highlights: [],
          version: "v1",
          createdAt: "",
        },
      ]),
    );
    expect(host.querySelectorAll(".fl-question")).toHaveLength(2);
    expect(host.querySelector(".fl-thinking")).toBeTruthy();
    await click('button[aria-label="Mud"]');
    expect(
      host.querySelector(".fl-main")?.classList.contains("fl-chat-active"),
    ).toBe(false);
    await act(async () =>
      finish({
        id: "pending",
        question: "Question",
        answer: "Answer survived",
        citations: [],
        highlights: [],
        version: "v1",
        createdAt: "",
      }),
    );
    await click('button[aria-label="Chat"]');
    expect(host.querySelector(".fl-chat-form textarea")).toBe(input);
    expect(
      Array.from(host.querySelectorAll(".fl-answer")).map((e) => e.textContent),
    ).toContain("Answer survived");
  });
  it("resizes the sidebar with keyboard within its limits", async () => {
    await render();
    const handle = host.querySelector('[role="separator"]')!;
    const key = (key: string) =>
      act(async () => {
        handle.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true }),
        );
      });
    expect(handle.getAttribute("aria-valuenow")).toBe("560");
    await key("End");
    await key("ArrowRight");
    expect(handle.getAttribute("aria-valuenow")).toBe("560");
    await key("Home");
    await key("ArrowLeft");
    expect(handle.getAttribute("aria-valuenow")).toBe("320");
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
      'select[aria-label="Cost report"]',
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
      expect.any(String),
    );
    await click(".fl-message .fl-inline button");
    expect(host.querySelector(".fl-detail-body")?.textContent).toContain(
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
    vi.mocked(api.cancelImport).mockImplementation(async () => {
      vi.mocked(api.getHistory).mockResolvedValue({
        versions: [],
        imports: [{ ...job, status: "cancelled" }],
      });
      return {};
    });
    await render();
    await click('button[aria-label="Mud"]');
    expect(host.textContent).toContain("Mud & reports");
    const cancel = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel import",
    );
    await act(async () => cancel!.click());
    expect(api.cancelImport).toHaveBeenCalledWith("well", "job");
    expect(host.textContent).toContain("Processing cancelled");
  });
  it("does not generate geometry merely by opening a well without a saved view", async () => {
    vi.mocked(api.getWell).mockResolvedValue({
      ...sample,
      geometry: [],
      next: null,
    });
    await render();
    expect(api.generateGeometry).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Generate 3D");
    expect(host.textContent).toContain("20.00");
  });
  it("follows the linked geometry job after import without blocking data", async () => {
    vi.useFakeTimers();
    const importing = {
      id: "import",
      wellId: "well",
      status: "processing",
      stage: "mapping",
      files: [],
      attempts: 1,
      createdAt: "",
    };
    const geometry = {
      ...importing,
      id: "geometry",
      kind: "geometry" as const,
      status: "queued",
      stage: "queued",
      sourceImportId: "import",
    };
    vi.mocked(api.getHistory)
      .mockResolvedValueOnce({ versions: [], imports: [importing] })
      .mockResolvedValue({
        versions: [],
        imports: [
          geometry,
          { ...importing, status: "ready", geometryJobId: "geometry" },
        ],
      });
    vi.mocked(api.getWell).mockResolvedValue({
      ...sample,
      geometry: [],
      next: null,
    });
    vi.mocked(api.getImport).mockResolvedValue({
      ...importing,
      status: "ready",
      geometryJobId: "geometry",
    });
    await render();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(host.textContent).toContain("Your well is taking shape.");
    expect(host.textContent).toContain("20.00");
    await click('button[aria-label="Chat"]');
    expect(host.textContent).toContain("Ask the data.");
    expect(api.generateGeometry).not.toHaveBeenCalled();
  });
});
it("separates library search and uploads from the selected well and preserves library scroll", async () => {
  await render();
  const library = host.querySelector<HTMLElement>(
    '[aria-label="All wells panel"]',
  )!;
  const selected = host.querySelector<HTMLElement>(
    '[aria-label="Well panel"]',
  )!;
  expect(
    library.querySelector('[aria-label="Search all wells"]'),
  ).not.toBeNull();
  expect(selected.querySelector('[aria-label="Search all wells"]')).toBeNull();
  expect(selected.querySelector('[aria-label="Review"]')).not.toBeNull();
  expect(library.textContent).not.toContain("SELECTED WELL");
  await click('button[aria-label="All wells"]');
  library.scrollTop = 240;
  await click('button[aria-label="Well"]');
  await click('button[aria-label="All wells"]');
  expect(library.scrollTop).toBe(240);
  vi.mocked(api.createWell).mockResolvedValue({
    ...sample.well,
    id: "new-well",
  });
  vi.mocked(api.uploadFiles).mockResolvedValue({
    id: "new-job",
    wellId: "new-well",
    status: "queued",
  } as never);
  const input = host.querySelector<HTMLInputElement>(
    'input[accept=".xlsx,.xls,.csv,.tsv"]',
  )!;
  const send = async () =>
    act(async () => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File(["a,b"], "reports.csv")],
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await click('[aria-label="All wells panel"] .fl-primary');
  await send();
  expect(api.uploadFiles).toHaveBeenLastCalledWith(
    "new-well",
    expect.any(Array),
    expect.any(Function),
    expect.any(Function),
    expect.any(AbortSignal),
  );
  await click('button[aria-label="Well"]');
  await click('[aria-label="Well panel"] .fl-primary');
  await send();
  expect(api.uploadFiles).toHaveBeenLastCalledWith(
    "well",
    expect.any(Array),
    expect.any(Function),
    expect.any(Function),
    expect.any(AbortSignal),
  );
  expect(api.createWell).toHaveBeenCalledTimes(1);
});
it("expands from the complete collapsed mobile bar", async () => {
  await render();
  await click('button[aria-label="Collapse information"]');
  await click('button[aria-label="Expand well information"]');
  expect(
    host.querySelector("#fl-sidebar-content")?.hasAttribute("hidden"),
  ).toBe(false);
});

it("confirms portal exit and restores focus and the mounted workspace on cancellation", async () => {
  const navigate = vi.fn();
  await act(async () =>
    root.render(
      <MemoryRouter>
        <FluidLab wellId="well" navigate={navigate} />
      </MemoryRouter>,
    ),
  );
  const scene = host.querySelector('[data-testid="scene"]');
  const back = host.querySelector<HTMLButtonElement>(
    '[aria-label="Back to portal"]',
  )!;
  back.focus();
  await act(async () => back.click());
  const dialog = host.querySelector("dialog.fl-confirmation")!;
  expect(dialog.textContent).toContain("Leave Fluid Labs?");
  expect(document.activeElement?.textContent).toBe("Stay here");
  expect(navigate).not.toHaveBeenCalled();
  await act(async () =>
    dialog.dispatchEvent(
      new Event("cancel", { bubbles: true, cancelable: true }),
    ),
  );
  expect(host.querySelector(".fl-confirmation")).toBeNull();
  expect(document.activeElement).toBe(back);
  expect(host.querySelector('[data-testid="scene"]')).toBe(scene);
  await act(async () => back.click());
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(".fl-confirmation .fl-primary")!
      .click(),
  );
  expect(navigate).toHaveBeenCalledWith("/portal");
});

it("requires confirmation before removing the shared attachment", async () => {
  const saved = {
    ...structuredClone(sample),
    next: null,
    well: {
      ...sample.well,
      pason: {
        id: "zip",
        path: "fluidlab/well/pason/zip/original.zip",
        originalName: "shared-survey.zip",
        sizeBytes: 3,
        detail: "balanced" as const,
        warnings: [],
      },
    },
  };
  vi.mocked(api.getWell).mockResolvedValue(saved);
  vi.mocked(api.call).mockRejectedValue(
    new Error("Attachment download unavailable"),
  );
  await render();
  await click(".fl-remove-zip");
  expect(host.querySelector(".fl-confirmation")?.textContent).toContain(
    "shared-survey.zip",
  );
  await click(".fl-confirmation button");
  expect(
    vi
      .mocked(api.call)
      .mock.calls.some(([name]) => name === "removeFluidPason"),
  ).toBe(false);
  await click(".fl-remove-zip");
  vi.mocked(api.call).mockResolvedValue({});
  vi.mocked(api.getWell).mockResolvedValue({
    ...structuredClone(sample),
    next: null,
  });
  await click(".fl-confirmation .fl-danger");
  expect(api.call).toHaveBeenCalledWith("removeFluidPason", {
    wellId: "well",
    attachmentId: "zip",
  });
  expect(host.querySelector(".fl-remove-zip")).toBeNull();
});
it("identifies both ZIPs and keeps the attachment when replacement is cancelled", async () => {
  vi.mocked(api.getWell).mockResolvedValue({
    ...structuredClone(sample),
    next: null,
    well: {
      ...sample.well,
      pason: {
        id: "zip",
        path: "fluidlab/well/pason/zip/original.zip",
        originalName: "old-survey.zip",
        sizeBytes: 3,
        detail: "balanced",
        warnings: [],
      },
    },
  });
  vi.mocked(api.call).mockRejectedValue(
    new Error("Attachment download unavailable"),
  );
  await render();
  const input = host.querySelector<HTMLInputElement>('input[accept=".zip"]')!;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [new File(["zip"], "new-survey.zip")],
  });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
  const dialog = host.querySelector(".fl-confirmation")!;
  expect(dialog.textContent).toContain("old-survey.zip");
  expect(dialog.textContent).toContain("new-survey.zip");
  await click(".fl-confirmation button");
  expect(
    vi
      .mocked(api.call)
      .mock.calls.some(
        ([name]) => name === "beginFluidPason" || name === "removeFluidPason",
      ),
  ).toBe(false);
  expect(host.querySelector(".fl-attachment")?.textContent).toContain(
    "old-survey.zip",
  );
});

it("shows questions immediately, preserves drafts on failure and retries the same request", async () => {
  let reject: (e: Error) => void = () => {};
  vi.mocked(api.askChat).mockImplementationOnce(
    () =>
      new Promise((_, r) => {
        reject = r;
      }),
  );
  await render();
  await click('button[aria-label="Chat"]');
  const input = host.querySelector<HTMLTextAreaElement>(
    ".fl-chat-form textarea",
  )!;
  const type = async (value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await type("Gamma at this depth?");
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(host.querySelector(".fl-question")?.textContent).toBe(
    "Gamma at this depth?",
  );
  expect(input.value).toBe("");
  await type("My next question");
  await act(async () => reject(new Error("Please retry")));
  expect(input.value).toBe("My next question");
  const args = vi.mocked(api.askChat).mock.calls[0];
  vi.mocked(api.askChat).mockResolvedValueOnce({
    id: args[4]!,
    question: args[1],
    answer: "Gamma is 12 API",
    citations: [],
    highlights: [],
    version: "v1",
    createdAt: "",
  });
  await click(".fl-message .fl-error button");
  expect(vi.mocked(api.askChat).mock.calls[1]).toEqual(args);
  expect(host.querySelectorAll(".fl-question")).toHaveLength(1);
  expect(host.querySelector(".fl-answer")?.textContent).toBe("Gamma is 12 API");
  expect(input.value).toBe("My next question");
});
