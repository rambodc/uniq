import { call } from "../api";
import { ensureActive } from "../loading/zip-transfer";
import type { WellModel } from "./well-package";
export function pasonChatPages(model: WellModel) {
  const pages: { kind: string; rows: unknown[] }[] = [];
  const add = (kind: string, rows: unknown[]) => {
    for (let i = 0; i < rows.length; i += 200)
      pages.push({ kind, rows: rows.slice(i, i + 200) });
  };
  add(
    "legs",
    model.legs.map(({ stations, ...leg }) => ({
      ...leg,
      stationCount: stations.length,
    })),
  );
  for (const leg of model.legs)
    add(
      "stations",
      leg.stations.map((s) => ({ ...s, legId: leg.id })),
    );
  add("holeSections", Object.values(model.holeSections).flat());
  add("casings", model.casings);
  add("bits", model.bitRuns);
  add("operations", model.operationalBuckets);
  add("fluids", model.drillingFluids?.records || []);
  if (pages.length > 1000)
    throw new Error(
      "This extraction exceeds the chat preparation limit. The Pason viewer remains available.",
    );
  return pages;
}
export async function savePasonChatData(
  wellId: string,
  attachmentId: string,
  model: WellModel,
  signal: AbortSignal,
  progress: (message: string, percent: number) => void,
) {
  ensureActive(signal);
  const pages = pasonChatPages(model);
  const result = await call<{ ready: boolean; runId: string | null }>(
    "saveFluidPasonAnalysis",
    {
      wellId,
      attachmentId,
      stage: "begin",
      pageCount: pages.length,
      meta: {
        schema: 2,
        warnings: model.drillingFluids?.warnings || [],
        sourceUnit: model.sourceUnit,
        depthResolutionM: model.operationalImport.depthResolutionM,
        sourceRows: model.operationalImport.sourceRows,
        validObservations: model.operationalImport.validObservations,
        channels: model.operationalChannels,
      },
    },
  );
  if (result.ready) return;
  try {
    for (const [index, page] of pages.entries()) {
      ensureActive(signal);
      progress(
        "Preparing Pason for chat…",
        Math.round((index / pages.length) * 100),
      );
      await call("saveFluidPasonAnalysis", {
        wellId,
        attachmentId,
        runId: result.runId,
        stage: "page",
        index,
        ...page,
      });
    }
    ensureActive(signal);
    await call("saveFluidPasonAnalysis", {
      wellId,
      attachmentId,
      runId: result.runId,
      stage: "finish",
    });
  } catch (error) {
    void call("saveFluidPasonAnalysis", {
      wellId,
      attachmentId,
      runId: result.runId,
      stage: "cancel",
    }).catch(() => {});
    throw error;
  }
}
