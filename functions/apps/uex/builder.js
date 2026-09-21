import { error as logError } from "firebase-functions/logger";
import { randomUUID } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, storage } from "../../core/firebase.js";
import { callable } from "../../core/config.js";
import { requireMiniApp } from "../../core/auth.js";
import { text, docId } from "../../core/values.js";
import {
  initialDocument,
  validateDocument,
  locationKey,
  timeKey,
  publishable,
} from "./document.js";
import { buildAnswer } from "./ai.js";
const refFor = (id) => db.collection("uexParties").doc(docId(id));
const wrap = (fn, ai = false) =>
  onCall(
    {
      ...callable,
      timeoutSeconds: 120,
      memory: "512MiB",
      ...(ai ? { secrets: ["OPENAI_API_KEY"] } : {}),
    },
    async (r) => {
      return fn(r.data || {}, await requireMiniApp(r, "uex"));
    },
  );
function editable(p, revision) {
  if (!p) throw new HttpsError("not-found", "Party not found.");
  if (p.revision !== revision)
    throw new HttpsError(
      "aborted",
      "Another manager changed this draft. Refresh to see their changes.",
    );
  if (
    p.archived ||
    p.status === "cancelled" ||
    (p.published?.endsAt && Date.parse(p.published.endsAt) <= Date.now())
  )
    throw new HttpsError("failed-precondition", "This party is read-only.");
  if (p.processing?.until > Date.now())
    throw new HttpsError(
      "failed-precondition",
      "A reply is being prepared. Please wait.",
    );
}
async function signedAssets(assets = []) {
  return Promise.all(
    assets.map(async ({ path, ...a }) => ({
      ...a,
      url: (
        await storage
          .bucket()
          .file(path)
          .getSignedUrl({ action: "read", expires: Date.now() + 900000 })
      )[0],
    })),
  );
}
export { signedAssets };
export const uexCreateDraft = wrap(async (_d, user) => {
  const ref = db.collection("uexParties").doc();
  await ref.create({
    status: "draft",
    archived: false,
    draft: initialDocument(),
    published: null,
    revision: 0,
    generated: false,
    assets: [],
    publishedAssets: [],
    interaction: null,
    history: [
      {
        role: "assistant",
        content:
          "Let’s create your next UEX. What is the party called, and when and where would you like to host it?",
      },
    ],
    createdBy: user.uid,
    createdAt: new Date().toISOString(),
  });
  return { id: ref.id };
});
export const uexBuilder = wrap(async (d) => {
  const ref = refFor(d.id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Party not found.");
  const party = snap.data();
  return {
    party: {
      ...party,
      id: ref.id,
      assets: await signedAssets(party.assets),
      publishedAssets: null,
    },
  };
});
export const uexBuilderMessage = wrap(async (d, user) => {
  const content = text(d.message, "message", 4000),
    ref = refFor(d.id),
    requestId = docId(d.requestId),
    now = Date.now(),
    rate = db.doc(`uexLimits/${user.uid}`);
  const p = await db.runTransaction(async (tx) => {
    const [snap, limit] = await tx.getAll(ref, rate);
    const p = snap.data();
    if (
      p?.history?.some(
        (m) => m.requestId === requestId && m.role === "assistant" && !m.failed,
      )
    )
      return null;
    editable(p, d.revision);
    if (d.interactionId && (!p.interaction || p.interaction.id !== d.interactionId || Date.parse(p.interaction.expiresAt) <= now))
      throw new HttpsError("aborted", "That assistant question is no longer active. Refresh the conversation.");
    if (
      (p.history || []).length >= 200 ||
      Buffer.byteLength(JSON.stringify(p.history || [])) > 250000
    )
      throw new HttpsError(
        "resource-exhausted",
        "This conversation has reached its limit.",
      );
    const l = limit.data() || {},
      fresh = now - (l.start || 0) > 3600000;
    if (!fresh && l.count >= 30)
      throw new HttpsError(
        "resource-exhausted",
        "Please wait before asking for more revisions.",
      );
    tx.set(rate, {
      start: fresh ? now : l.start,
      count: fresh ? 1 : l.count + 1,
    });
    const history = [
      ...(p.history || []),
      { role: "user", content, requestId, by: user.uid },
    ];
    tx.update(ref, {
      history,
      processing: { id: requestId, until: now + 90000 },
    });
    return { ...p, history };
  });
  if (!p) return { success: true };
  try {
    const answer = await buildAnswer({
      draft: p.draft,
      history: p.history,
      assets: p.assets || [],
    });
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref),
        latest = s.data();
      if (latest.revision !== d.revision || latest.processing?.id !== requestId)
        throw new HttpsError("aborted", "The draft changed. Please refresh.");
      const update = {
        processing: null,
        history: [
          ...latest.history,
          {
            role: "assistant",
            content: answer.reply,
            requestId,
            sources: answer.sources,
            interaction: answer.interaction,
          },
        ],
        interaction: answer.interaction,
        sources: answer.sources,
        summary: answer.summary,
      };
      if (answer.document) {
        Object.assign(update, {
          draft: answer.document,
          generated: true,
          revision: latest.revision + 1,
          locationConfirmed: locationKey(answer.document) === locationKey(latest.draft) ? latest.locationConfirmed || null : null,
          timeConfirmed: timeKey(answer.document) === timeKey(latest.draft) ? latest.timeConfirmed || null : null,
        });
        tx.set(ref.collection("revisions").doc(String(update.revision)), {
          document: answer.document,
          assets: latest.assets || [],
          previousRevision: latest.revision,
          by: user.uid,
          at: new Date().toISOString(),
        });
      }
      tx.update(ref, update);
    });
  } catch (failure) {
    const conflict = failure.code === "aborted";
    const validation =
      failure.code === "invalid-argument" || failure.name === "ZodError";
    const timeout = failure.name === "APIConnectionTimeoutError";
    const message = conflict
      ? "Another manager changed the draft. Refresh before trying again."
      : validation
        ? "The assistant returned an invalid page or date. Your draft is safe. Use the date controls to clarify times, or retry your message."
        : timeout
          ? "The assistant took too long. Your draft is safe. Please retry your message."
          : "The page assistant could not finish. Your saved draft is unchanged. Please retry your message.";
    logError("UEX builder request failed", {
      requestId,
      category: conflict
        ? "conflict"
        : validation
          ? "validation"
          : timeout
            ? "timeout"
            : "provider-or-storage",
      code: String(failure.code || failure.name || "unknown"),
      providerStatus: failure.status || null,
    });
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (s.data()?.processing?.id === requestId)
        tx.update(ref, {
          processing: null,
          interaction: null,
          history: [
            ...s.data().history,
            {
              role: "assistant",
              content: message,
              requestId,
              failed: true,
            },
          ],
        });
    });
    throw new HttpsError(
      conflict ? "aborted" : validation ? "failed-precondition" : "unavailable",
      message,
    );
  }
  return { success: true };
}, true);
export const uexBuilderAction = wrap(async (d, user) => {
  const ref = refFor(d.id);
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref),
      p = s.data();
    // Archival remains available for past/cancelled parties.
    if (d.action === "archive") {
      if (p?.processing?.until > Date.now())
        throw new HttpsError(
          "failed-precondition",
          "Resolve the pending work before archiving.",
        );
      if (!p || p.revision !== d.revision)
        throw new HttpsError("aborted", "Refresh this party.");
      tx.update(ref, { archived: !p.archived, revision: p.revision + 1 });
      return;
    }
    editable(p, d.revision);
    const update = {
      revision: p.revision + 1,
      updatedBy: user.uid,
      updatedAt: new Date().toISOString(),
    };
    if (d.action === "undo") {
      const previous = await ref.collection("revisions").doc(String(Math.max(1, p.revision - 1))).get();
      if (!previous.exists) throw new HttpsError("failed-precondition", "There is no previous draft to undo.");
      update.draft = validateDocument(previous.data().document, p.assets);
      update.interaction = null;
      update.history = [...p.history, { role: "assistant", content: "Undid the last saved draft change." }];
      tx.set(ref.collection("revisions").doc(String(update.revision)), { document: update.draft, assets: p.assets || [], previousRevision: p.revision, by: user.uid, at: update.updatedAt });
    } else if (d.action === "location")
        update.locationConfirmed = locationKey(p.draft);
    else if (d.action === "time") update.timeConfirmed = timeKey(p.draft);
    else if (d.action === "publish") {
        const doc = publishable(p);
        Object.assign(update, {
          published: doc,
          publishedAssets: p.assets,
          status: "published",
        });
    } else if (d.action === "cancel") update.status = "cancelled";
    else throw new HttpsError("invalid-argument", "Unknown action.");
    tx.update(ref, update);
  });
  return { success: true };
});
export const uexAsset = wrap(async (d) => {
  const ref = refFor(d.id),
    assetId = randomUUID();
  let path;
  if (d.action === "upload" || d.action === "replace") {
    const { imageType } = await import("./service.js");
    if (typeof d.base64 !== "string" || d.base64.length > 6990508)
      throw new HttpsError("invalid-argument", "Choose an image up to 5 MB.");
    const bytes = Buffer.from(d.base64, "base64"),
      mime = imageType(bytes);
    if (!mime || bytes.length > 5242880)
      throw new HttpsError(
        "invalid-argument",
        "Choose JPEG, PNG or WebP up to 5 MB.",
      );
    path = `uex/${ref.id}/${assetId}`;
    await storage
      .bucket()
      .file(path)
      .save(bytes, { resumable: false, contentType: mime });
  }
  try {
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref),
        p = s.data();
      editable(p, d.revision);
      let assets = p.assets || [],
        draft = p.draft;
      if (d.action === "upload") {
        if (assets.length >= 30)
          throw new HttpsError("resource-exhausted", "Use up to 30 images.");
        assets = [
          ...assets,
          {
            id: assetId,
            path,
            alt: text(d.alt, "image description", 300),
            caption: String(d.caption || "").slice(0, 500),
          },
        ];
      } else if (d.action === "replace") {
        if (!assets.some((a) => a.id === d.assetId))
          throw new HttpsError("not-found", "Image not found.");
        assets = assets.map((a) =>
          a.id === d.assetId
            ? {
                id: a.id,
                path,
                alt: text(d.alt, "image description", 300),
                caption: String(d.caption || "").slice(0, 500),
              }
            : a,
        );
      } else if (d.action === "remove") {
        assets = assets.filter((a) => a.id !== d.assetId);
        draft = {
          ...draft,
          sections: draft.sections.map((s) => ({
            ...s,
            items: s.items.filter((i) => i.assetId !== d.assetId),
          })),
        };
      } else if (d.action === "update")
        assets = assets.map((a) =>
          a.id === d.assetId
            ? {
                ...a,
                alt: text(d.alt, "image description", 300),
                caption: String(d.caption || "").slice(0, 500),
              }
            : a,
        );
      else throw new HttpsError("invalid-argument", "Unknown image action.");
      tx.update(ref, { assets, draft, revision: p.revision + 1 });
    });
  } catch (e) {
    if (path)
      await storage.bucket().file(path).delete({ ignoreNotFound: true });
    throw e;
  }
  // Retain removed blobs for the published snapshot and historical revisions.
  return { success: true };
});
