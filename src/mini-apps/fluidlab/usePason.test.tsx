// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import type { PasonAttachment } from "./model";
vi.mock("../../core/firebase", () => ({
  auth: { currentUser: { uid: "viewer" } },
}));
vi.mock("./api", () => ({ call: vi.fn() }));
vi.mock("./loading/zip-transfer", () => ({
  downloadZip: vi.fn(),
  uploadZip: vi.fn(),
  ensureActive: (s: AbortSignal) => s.throwIfAborted(),
}));
vi.mock("./pason/package-worker", () => ({
  inspectPackage: vi.fn(),
  processPackage: vi.fn(),
}));
import { usePason } from "./usePason";
import { call } from "./api";
import { downloadZip, uploadZip } from "./loading/zip-transfer";
import { inspectPackage, processPackage } from "./pason/package-worker";
const attachment: PasonAttachment = {
  id: "zip-a",
  path: "fluidlab/a/pason/zip-a/original.zip",
  originalName: "well.zip",
  sizeBytes: 3,
  detail: "balanced",
  warnings: [],
};
let root: Root, host: HTMLDivElement, hook: ReturnType<typeof usePason>;
const refresh = vi.fn(async () => {});
function Harness({
  wellId = "a",
  saved = attachment,
}: {
  wellId?: string;
  saved?: PasonAttachment;
}) {
  const state = usePason(wellId, saved, refresh);
  useEffect(() => {
    hook = state;
  });
  return null;
}
const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(call).mockImplementation(async (name) =>
    name === "getFluidPason"
      ? { attachment }
      : name === "beginFluidPason"
        ? { path: "reserved" }
        : {},
  );
  vi.mocked(downloadZip).mockResolvedValue(new File(["zip"], "well.zip"));
  vi.mocked(inspectPackage).mockResolvedValue({
    requiresDetailSelection: false,
  } as never);
  vi.mocked(processPackage).mockResolvedValue({
    name: "Never replace shared name",
    warnings: [],
    legs: [],
  } as never);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
it("defaults to Pason and caches parsing while switching sources", async () => {
  await act(async () => root.render(<Harness />));
  await flush();
  expect(hook.view).toBe("pason");
  expect(hook.model?.name).toBe("Never replace shared name");
  await act(async () => hook.select("estimated"));
  await act(async () => hook.select("pason"));
  await flush();
  expect(downloadZip).toHaveBeenCalledTimes(1);
  expect(processPackage).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("fluid-pason:viewer:a")).toBe("pason");
});
it("respects a user's per-well preference and releases the prior session", async () => {
  localStorage.setItem("fluid-pason:viewer:a", "estimated");
  await act(async () => root.render(<Harness />));
  await flush();
  expect(downloadZip).not.toHaveBeenCalled();
  await act(async () => hook.select("pason"));
  await flush();
  expect(hook.model).not.toBeNull();
  localStorage.setItem("fluid-pason:viewer:b", "estimated");
  await act(async () => root.render(<Harness wellId="b" />));
  expect(hook.model).toBeNull();
  expect(hook.view).toBe("estimated");
});
it("failed replacement keeps the parsed active attachment", async () => {
  await act(async () => root.render(<Harness />));
  await flush();
  const previous = hook.model;
  vi.mocked(uploadZip).mockRejectedValue(new Error("Upload interrupted"));
  await act(async () => hook.upload(new File(["ZIP"], "replacement.zip")));
  expect(hook.model).toBe(previous);
  expect(hook.error).toContain("interrupted");
  expect(call).toHaveBeenCalledWith(
    "cancelFluidPason",
    expect.objectContaining({ wellId: "a" }),
  );
  expect(call).not.toHaveBeenCalledWith(
    "completeFluidPason",
    expect.anything(),
  );
  expect(hook.progress).toBeNull();
});
it("large ZIP choice replaces progress and cancellation leaves the active package", async () => {
  await act(async () => root.render(<Harness />));
  await flush();
  const previous = hook.model;
  vi.mocked(inspectPackage).mockResolvedValue({
    requiresDetailSelection: true,
    csvFileName: "large.csv",
  } as never);
  await act(async () => hook.upload(new File(["ZIP"], "large.zip")));
  expect(hook.pending?.csvFileName).toBe("large.csv");
  expect(hook.progress).toBeNull();
  await act(async () => hook.cancel());
  expect(hook.pending).toBeNull();
  expect(hook.model).toBe(previous);
});
it("failed Pason opening keeps the estimated view and retries successfully", async () => {
  vi.mocked(downloadZip).mockRejectedValueOnce(
    new Error("Download unavailable"),
  );
  await act(async () => root.render(<Harness />));
  await flush();
  expect(hook.view).toBe("estimated");
  expect(hook.error).toBe("Download unavailable");
  expect(hook.progress).toBeNull();
  await act(async () => hook.retry());
  await flush();
  expect(hook.view).toBe("pason");
  expect(hook.model).not.toBeNull();
});
it("prepares extracted Pason once and keeps the viewer usable after preparation fails", async () => {
  vi.mocked(processPackage).mockResolvedValue({
    name: "Survey",
    warnings: [],
    sourceUnit: "metric",
    legs: [
      {
        id: "leg",
        name: "Main",
        parentId: null,
        startMdM: 0,
        endMdM: 100,
        stations: [],
      },
    ],
    holeSections: {},
    casings: [],
    bitRuns: [],
    operationalBuckets: [],
    operationalChannels: [],
    operationalImport: {
      sourceRows: 0,
      validObservations: 0,
      depthResolutionM: 0.5,
    },
  } as never);
  vi.mocked(call).mockImplementation(async (name, data) => {
    if (name === "getFluidPason") return { attachment };
    if (name === "saveFluidPasonAnalysis") {
      const stage = (data as { stage: string }).stage;
      if (stage === "begin") return { runId: "run" };
      if (stage === "page") throw new Error("Preparation interrupted");
    }
    return {};
  });
  await act(async () => root.render(<Harness />));
  await flush();
  const model = hook.model;
  expect(model?.name).toBe("Survey");
  expect(hook.analysisError).toContain("interrupted");
  expect(hook.view).toBe("pason");
  expect(call).toHaveBeenCalledWith(
    "saveFluidPasonAnalysis",
    expect.objectContaining({ stage: "cancel", runId: "run" }),
  );
  vi.mocked(call).mockImplementation(async () => ({ runId: "retry" }));
  await act(async () => hook.prepareChat());
  expect(hook.model).toBe(model);
  expect(processPackage).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledWith(
    "saveFluidPasonAnalysis",
    expect.objectContaining({ stage: "finish", runId: "retry" }),
  );
  expect(hook.analysisError).toBe("");
  expect(refresh).toHaveBeenCalled();
});
