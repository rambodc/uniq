import { queryFluidRecords } from "./fluid-records.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../../core/firebase.js";
import { callable } from "../../core/config.js";
import { requireMiniApp } from "../../core/auth.js";
import { validId } from "./pason-validation.js";
const number = z.number().finite(),
  text = z.string().max(1000),
  depth = number.nonnegative();
export const channelIds = [
  "torque",
  "rotary",
  "rop",
  "gas",
  "standpipePressure",
  "differentialPressure",
  "pumpOutput",
  "hookLoad",
  "gamma",
];
const channel = z.enum(channelIds),
  count = z.number().int().min(1).max(5000000);
const statistic = z
  .object({
    count,
    sum: number,
    minimum: number,
    maximum: number,
    latest: number,
  })
  .refine(
    (v) =>
      v.minimum <= v.maximum &&
      v.latest >= v.minimum &&
      v.latest <= v.maximum &&
      v.sum / v.count >= v.minimum - Math.abs(v.minimum) * 1e-8 - 1e-8 &&
      v.sum / v.count <= v.maximum + Math.abs(v.maximum) * 1e-8 + 1e-8,
  );
const bit = z.object({
  id: text,
  bitNo: text,
  sizeMm: depth,
  manufacturer: text,
  bitType: text,
  serialNo: text,
  depthInM: depth,
  depthOutM: depth.nullable(),
});
const schemas = {
  fluids: z.object({
    id: z.string().max(1500),
    category: z.enum(["sample", "chemical", "tank", "solid", "pump", "note"]),
    time: text.nullable(),
    at: number.nullable(),
    mdM: depth.nullable(),
    name: text,
    event: text,
    tank: text.nullable(),
    fromTank: text.nullable(),
    toTank: text.nullable(),
    amount: number.nullable(),
    unit: z.string().max(60).nullable(),
    values: z
      .array(
        z.object({
          key: text,
          label: text,
          value: number.nullable(),
          unit: z.string().max(60).nullable(),
        }),
      )
      .max(12),
    file: text,
    location: text,
    note: text,
    uncertain: z.boolean(),
  }),
  legs: z.object({
    id: text,
    name: text,
    parentId: text.nullable(),
    startMdM: depth,
    endMdM: depth,
    stationCount: z.number().int().nonnegative(),
  }),
  stations: z.object({
    legId: text,
    mdM: depth,
    inclinationDeg: number,
    azimuthDeg: number,
    tvdM: number,
    northM: number,
    eastM: number,
    status: text,
  }),
  holeSections: z.object({
    id: text,
    legId: text,
    startMdM: depth,
    endMdM: depth,
    diameterMm: depth,
    bit: bit.nullable(),
  }),
  casings: z.object({
    id: text,
    category: text,
    outsideDiameterMm: depth,
    insideDiameterMm: depth,
    topMdM: depth,
    bottomMdM: depth,
    grade: text,
  }),
  bits: bit,
  operations: z
    .object({
      bandStartM: depth,
      bitDepthM: depth,
      holeDepthM: depth,
      sampleCount: count,
      firstTimestamp: text,
      lastTimestamp: text,
      values: z.partialRecord(channel, statistic),
    })
    .refine((v) =>
      Object.values(v.values).every((s) => s.count <= v.sampleCount),
    ),
};
const metaSchema = z
  .object({
    schema: z.union([z.literal(1), z.literal(2)]).default(1),
    warnings: z.array(text).max(80).default([]),
    sourceUnit: z.enum(["metric", "imperial"]),
    depthResolutionM: z.union([z.literal(0.25), z.literal(0.5), z.literal(1)]),
    sourceRows: z.number().int().nonnegative().max(5000000),
    validObservations: z.number().int().nonnegative().max(5000000),
    channels: z
      .array(z.object({ id: channel, label: text, unit: z.string().max(60) }))
      .max(9),
  })
  .refine(
    (v) => new Set(v.channels.map((c) => c.id)).size === v.channels.length,
  );
export function validatePasonPage(kind, rows) {
  if (
    !Object.hasOwn(schemas, kind) ||
    !Array.isArray(rows) ||
    rows.length < 1 ||
    rows.length > 200
  )
    throw new HttpsError("invalid-argument", "Invalid Pason extraction page.");
  const parsed = z.array(schemas[kind]).parse(rows);
  if (Buffer.byteLength(JSON.stringify(parsed)) > 400000)
    throw new HttpsError(
      "invalid-argument",
      "Pason extraction page is too large.",
    );
  return parsed;
}
function combine(target, values) {
  for (const [id, v] of Object.entries(values)) {
    const old = target[id];
    target[id] = old
      ? {
          count: old.count + v.count,
          sum: old.sum + v.sum,
          minimum: Math.min(old.minimum, v.minimum),
          maximum: Math.max(old.maximum, v.maximum),
        }
      : { count: v.count, sum: v.sum, minimum: v.minimum, maximum: v.maximum };
  }
  return target;
}
const publicStats = (stats) =>
  Object.fromEntries(
    Object.entries(stats).map(([id, v]) => [
      id,
      {
        count: v.count,
        minimum: v.minimum,
        maximum: v.maximum,
        average: v.sum / v.count,
      },
    ]),
  );
function pageInfo(kind, rows, resolution) {
  const ranges = rows.map((r) => [
    r.bandStartM ?? r.mdM ?? r.startMdM ?? r.topMdM ?? r.depthInM ?? 0,
    r.bandStartM != null
      ? r.bandStartM + resolution
      : (r.mdM ?? r.endMdM ?? r.bottomMdM ?? r.depthOutM ?? r.depthInM ?? 0),
  ]);
  return {
    kind,
    count: rows.length,
    observations:
      kind === "operations" ? rows.reduce((n, r) => n + r.sampleCount, 0) : 0,
    minimumMdM: Math.min(...ranges.map((r) => r[0])),
    maximumMdM: Math.max(...ranges.map((r) => r[1])),
    stats:
      kind === "operations"
        ? rows.reduce((a, r) => combine(a, r.values), {})
        : {},
  };
}
function checkWell(s, id) {
  if (!s.exists || s.data().status === "deleting")
    throw new HttpsError("not-found", "Well not found.");
  if (s.data().pason?.id !== id)
    throw new HttpsError(
      "aborted",
      "The Pason attachment changed. Open its current view.",
    );
}
export const saveFluidPasonAnalysis = onCall(
  { ...callable, timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {
    const { uid } = await requireMiniApp(request, "fluidlab"),
      d = request.data || {};
    const well = db.doc(`fluidWells/${validId(d.wellId)}`),
      attachmentId = validId(d.attachmentId);
    const root = well.collection("pasonAnalysis").doc(attachmentId);
    if (d.stage === "begin") {
      const meta = metaSchema.parse(d.meta),
        pageCount = z.number().int().min(1).max(1000).parse(d.pageCount);
      const runId = randomUUID();
      const result = await db.runTransaction(async (tx) => {
        const w = await tx.get(well),
          old = await tx.get(root);
        checkWell(w, attachmentId);
        if ((w.data().pason.analysis?.schema || 0) >= meta.schema)
          return { ready: true };
        const pending = old.data()?.pending;
        if (
          pending?.status === "writing" &&
          pending.expiresAt > Date.now() &&
          pending.owner !== uid
        )
          throw new HttpsError(
            "resource-exhausted",
            "Another user is preparing Pason chat. Try again shortly.",
          );
        tx.set(
          root,
          {
            pending: {
              runId,
              owner: uid,
              status: "writing",
              expiresAt: Date.now() + 15 * 60000,
            },
          },
          { merge: true },
        );
        tx.set(root.collection("runs").doc(runId), {
          runId,
          owner: uid,
          status: "writing",
          expiresAt: Date.now() + 15 * 60000,
          meta,
          pageCount,
          pages: {},
          bytes: 0,
          summary: {},
        });
        return { runId, oldRun: pending?.runId || null };
      });
      if (result.oldRun)
        await db.recursiveDelete(root.collection("runs").doc(result.oldRun));
      return { ready: !!result.ready, runId: result.runId || null };
    }
    const runId = validId(d.runId);
    const run = root.collection("runs").doc(runId);
    if (d.stage === "cancel") {
      const remove = await db.runTransaction(async (tx) => {
        const w = await tx.get(well),
          s = await tx.get(run),
          pointer = await tx.get(root);
        checkWell(w, attachmentId);
        const state = s.data();
        if (
          pointer.data()?.pending?.runId !== runId ||
          state?.runId !== runId ||
          state.owner !== uid ||
          state.status !== "writing"
        )
          return false;
        tx.update(run, { status: "cancelled" });
        tx.set(
          root,
          { pending: { runId, status: "cancelled" } },
          { merge: true },
        );
        return true;
      });
      if (remove) await db.recursiveDelete(root.collection("runs").doc(runId));
      return { ok: true };
    }
    if (d.stage === "page") {
      const index = z.number().int().min(0).max(999).parse(d.index),
        rows = validatePasonPage(d.kind, d.rows),
        key = String(index).padStart(3, "0");
      return db.runTransaction(async (tx) => {
        const w = await tx.get(well),
          s = await tx.get(run),
          pointer = await tx.get(root);
        checkWell(w, attachmentId);
        const state = s.data();
        if (
          pointer.data()?.pending?.runId !== runId ||
          state?.runId !== runId ||
          state.owner !== uid ||
          state.status !== "writing" ||
          state.expiresAt < Date.now() ||
          index >= state.pageCount
        )
          throw new HttpsError("aborted", "Pason preparation expired. Retry.");
        if (state.pages[key])
          throw new HttpsError(
            "already-exists",
            "Pason page was already saved. Restart preparation.",
          );
        const bytes = state.bytes + Buffer.byteLength(JSON.stringify(rows));
        if (bytes > 128000000)
          throw new HttpsError(
            "resource-exhausted",
            "This extraction exceeds the chat preparation limit. The viewer remains available.",
          );
        tx.set(
          root.collection("runs").doc(runId).collection("pages").doc(key),
          { kind: d.kind, rows },
        );
        const info = pageInfo(d.kind, rows, state.meta.depthResolutionM);
        const { stats, ...manifest } = info;
        tx.update(run, {
          [`pages.${key}`]: manifest,
          summary: combine(state.summary || {}, stats),
          bytes,
        });

        return { ok: true };
      });
    }
    if (d.stage === "finish") {
      return db.runTransaction(async (tx) => {
        const w = await tx.get(well),
          s = await tx.get(run),
          pointer = await tx.get(root);
        checkWell(w, attachmentId);
        if (w.data().pason.analysis?.runId === runId) return { ready: true };
        const state = s.data();
        if (
          pointer.data()?.pending?.runId !== runId ||
          state?.runId !== runId ||
          state.owner !== uid ||
          state.status !== "writing" ||
          state.expiresAt < Date.now() ||
          Object.keys(state.pages).length !== state.pageCount
        )
          throw new HttpsError(
            "failed-precondition",
            "Pason preparation is incomplete. Retry.",
          );
        if (
          Object.values(state.pages).reduce((n, p) => n + p.observations, 0) !==
          state.meta.validObservations
        )
          throw new HttpsError(
            "invalid-argument",
            "Pason observation counts do not match.",
          );
        const summary = state.summary;
        tx.update(run, { status: "ready", summary });
        tx.set(root, { ...state, status: "ready", pending: null });
        tx.update(well, {
          "pason.warnings": [
            ...new Set([
              ...(w.data().pason.warnings || []).filter(
                (v) => !v.startsWith("Drilling fluids:"),
              ),
              ...state.meta.warnings,
            ]),
          ].slice(0, 100),
          "pason.analysis": {
            schema: state.meta.schema,
            runId,
            preparedBy: uid,
            preparedAt: new Date().toISOString(),
          },
        });
        return { ready: true };
      });
    }
    throw new HttpsError(
      "invalid-argument",
      "Unknown Pason preparation stage.",
    );
  },
);
const limits =
  "Pason extraction, separate from report facts. Depths are metres. Operations are grouped by bit MD and can combine repeated passes or overlapping legs. No exact event timing or leg-specific operational attribution is available. Depth boundaries include whole intersecting bands; averages are observation-weighted, not time-weighted.";
export function queryPasonMeasurements(
  meta,
  rows,
  { channel: id, fromMdM = null, toMdM = null, bins = 12 },
) {
  if (!channelIds.includes(id) || !meta.channels.some((c) => c.id === id))
    throw new Error(
      "Choose an available Pason channel from pason_structure overview.",
    );
  for (const v of [fromMdM, toMdM])
    if (v !== null && (!Number.isFinite(v) || v < 0))
      throw new Error("Use nonnegative MD in metres.");
  if (fromMdM !== null && toMdM !== null && fromMdM > toMdM)
    throw new Error("Start MD must not exceed end MD.");
  bins = Math.max(1, Math.min(20, Number.isInteger(bins) ? bins : 12));
  const selected = rows.filter(
    (r) =>
      (fromMdM === null || r.bandStartM + meta.depthResolutionM > fromMdM) &&
      (toMdM === null || r.bandStartM <= toMdM) &&
      r.values[id],
  );
  if (!selected.length)
    return {
      channel: meta.channels.find((c) => c.id === id),
      statistics: null,
      trend: [],
      note: "No extracted measurements in this MD interval.",
    };
  const low = Math.min(...selected.map((r) => r.bandStartM)),
    high = Math.max(
      ...selected.map((r) => r.bandStartM + meta.depthResolutionM),
    );
  const width = (high - low) / bins,
    trend = Array.from({ length: bins }, (_, i) => ({
      fromMdM: low + i * width,
      toMdM: low + (i + 1) * width,
      stats: {},
    })),
    stats = {};
  for (const r of selected) {
    combine(stats, { [id]: r.values[id] });
    const i = Math.min(bins - 1, Math.floor((r.bandStartM - low) / width));
    combine(trend[i].stats, { [id]: r.values[id] });
  }
  return {
    channel: meta.channels.find((c) => c.id === id),
    statistics: publicStats(stats)[id],
    coveredMdM: [low, high],
    trend: trend.map((t) => ({
      fromMdM: t.fromMdM,
      toMdM: t.toMdM,
      ...(publicStats(t.stats)[id] || {
        count: 0,
        average: null,
        minimum: null,
        maximum: null,
      }),
    })),
  };
}
export function createPasonReader(well, attachment) {
  let statePromise;
  const cache = new Map();
  const root = well.collection("pasonAnalysis").doc(attachment?.id || "none");
  return async (name, args) => {
    if (!attachment)
      return { available: false, note: "This well has no Pason attachment." };
    if (![1, 2].includes(attachment.analysis?.schema))
      return {
        available: false,
        note: "Pason chat data has not been prepared. Use Prepare Pason for chat, or open the Pason view. No re-upload is needed.",
      };
    const s = await (statePromise ??= root.get()),
      state = s.data();
    if (state?.status !== "ready" || state.runId !== attachment.analysis.runId)
      return {
        available: false,
        note: "Pason preparation changed. Refresh this well.",
      };
    if (name === "pason_fluids") {
      if (state.meta.schema !== 2)
        return {
          available: false,
          note: "Open the Pason view to prepare drilling-fluid records. No re-upload needed.",
        };
      const entries = Object.entries(state.pages).filter(
        ([, p]) => p.kind === "fluids",
      );
      if (entries.length > 100)
        throw new Error("Fluid extraction exceeds retrieval limit.");
      const records = [];
      for (const [id] of entries) {
        if (!cache.has(id) && cache.size >= 100)
          throw new Error("Pason retrieval limit reached.");
        const promise =
          cache.get(id) ||
          root
            .collection("runs")
            .doc(state.runId)
            .collection("pages")
            .doc(id)
            .get();
        cache.set(id, promise);
        const page = await promise;
        if (!page.exists)
          throw new Error("Pason data changed. Refresh the well.");
        records.push(...page.data().rows);
      }
      return {
        file: attachment.originalName,
        ...queryFluidRecords(records, args),
        note: "Pason XML/CSV fluid records, separate from uploaded mud reports. PVT is combined reported volume unless a named tank is specified. Filtration/water loss is a mud test, not downhole loss. No tank-volume allocation or loss balance is inferred. Missing fields/units remain unknown; tour chemical timestamps are tour-end, not exact addition times.",
      };
    }
    const from = args.fromMdM ?? null,
      to = args.toMdM ?? null;
    for (const v of [from, to])
      if (v !== null && (!Number.isFinite(v) || v < 0))
        throw new Error("Use nonnegative MD in metres.");
    if (from !== null && to !== null && from > to)
      throw new Error("Start MD must not exceed end MD.");
    const kind = name === "pason_measurements" ? "operations" : args.kind;
    const metadata = {
      file: attachment.originalName,
      depthResolutionM: state.meta.depthResolutionM,
      channels: state.meta.channels,
      note: limits,
    };
    if (kind === "overview")
      return {
        ...metadata,
        sourceRows: state.meta.sourceRows,
        validObservations: state.meta.validObservations,
        counts: Object.values(state.pages).reduce(
          (a, p) => ({ ...a, [p.kind]: (a[p.kind] || 0) + p.count }),
          {},
        ),
        statistics: publicStats(state.summary),
      };
    if (
      !Object.hasOwn(schemas, kind) ||
      (kind === "operations" && name !== "pason_measurements")
    )
      throw new Error("Choose a supported Pason section.");
    const pages = Object.entries(state.pages).filter(
      ([, p]) =>
        p.kind === kind &&
        (from === null || p.maximumMdM >= from) &&
        (to === null || p.minimumMdM <= to),
    );
    if (
      kind === "operations" &&
      from === null &&
      to === null &&
      args.bins === 1
    ) {
      if (!state.meta.channels.some((c) => c.id === args.channel))
        throw new Error("Choose an available Pason channel.");
      return {
        ...metadata,
        channel: state.meta.channels.find((c) => c.id === args.channel),
        statistics: publicStats(state.summary)[args.channel] || null,
        trend: [],
      };
    }
    if (kind === "operations" && pages.length > 100)
      throw new Error(
        "This depth trend is too broad. Narrow the MD interval, or use bins=1 and no depth bounds for whole-well statistics.",
      );
    const rows = [];
    const offset = Number.isInteger(args.offset)
      ? Math.max(0, Math.min(200000, args.offset))
      : 0;
    for (const [id] of pages) {
      if (!cache.has(id) && cache.size >= 100)
        throw new Error(
          "Pason retrieval limit reached. Ask a narrower depth question.",
        );
      const promise =
        cache.get(id) ||
        root
          .collection("runs")
          .doc(state.runId)
          .collection("pages")
          .doc(id)
          .get();
      cache.set(id, promise);
      const page = await promise;
      if (!page.exists)
        throw new Error("Pason attachment changed. Refresh the well.");
      for (const r of page.data().rows) {
        const lo =
            r.bandStartM ?? r.mdM ?? r.startMdM ?? r.topMdM ?? r.depthInM ?? 0,
          hi =
            r.bandStartM != null
              ? r.bandStartM + state.meta.depthResolutionM
              : (r.mdM ?? r.endMdM ?? r.bottomMdM ?? r.depthOutM ?? lo);
        if (
          (from === null || hi >= from) &&
          (to === null || lo <= to) &&
          (!args.legId ||
            r.legId === args.legId ||
            (kind === "legs" && r.id === args.legId))
        )
          rows.push(r);
      }
      if (kind !== "operations" && rows.length > offset + 20) break;
    }
    return kind === "operations"
      ? { ...metadata, ...queryPasonMeasurements(state.meta, rows, args) }
      : {
          ...metadata,
          kind,
          rows: rows.slice(offset, offset + 20),
          nextOffset: rows.length > offset + 20 ? offset + 20 : null,
        };
  };
}
