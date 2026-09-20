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
    async (r) => fn(r.data || {}, await requireMiniApp(r, "uex")),
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
    (p.endsAt && Date.parse(p.endsAt) <= Date.now())
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
    name: "Untitled party",
    startsAt: "",
    endsAt: "",
    status: "draft",
    archived: false,
    draft: initialDocument(),
    published: null,
    revision: 0,
    generated: false,
    assets: [],
    proposal: null,
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
  const party = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Party not found.");
    const p = snap.data();
    if (!p.draft) {
      const migrated = {
        draft: initialDocument(p),
        published: p.status === "draft" ? null : initialDocument(p),
        revision: 0,
        generated: true,
        assets: p.coverPath
          ? [
              {
                id: "original-cover",
                path: p.coverPath,
                alt: p.name,
                caption: "",
              },
            ]
          : [],
        publishedAssets: p.coverPath
          ? [
              {
                id: "original-cover",
                path: p.coverPath,
                alt: p.name,
                caption: "",
              },
            ]
          : [],
        proposal: null,
        history: [],
      };
      tx.update(ref, migrated);
      Object.assign(p, migrated);
    }
    return p;
  });
  return {
    party: {
      ...party,
      id: ref.id,
      assets: await signedAssets(party.assets),
      publishedAssets: null,
      coverPath: null,
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
        (m) => m.requestId === requestId && m.role === "assistant",
      )
    )
      return null;
    editable(p, d.revision);
    if (p.proposal)
      throw new HttpsError(
        "failed-precondition",
        "Confirm or cancel the pending proposal first.",
      );
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
          { role: "assistant", content: answer.reply, requestId },
        ],
      };
      if (answer.document) {
        if (!latest.generated) {
          Object.assign(update, {
            draft: answer.document,
            generated: true,
            revision: latest.revision + 1,
          });
          update.locationConfirmed = null;
          update.timeConfirmed = null;
          tx.set(ref.collection("revisions").doc(String(update.revision)), {
            document: answer.document,
            assets: latest.assets || [],
            by: user.uid,
            at: new Date().toISOString(),
          });
        } else
          update.proposal = {
            id: randomUUID(),
            baseRevision: latest.revision,
            document: answer.document,
            summary: answer.summary,
          };
      }
      tx.update(ref, update);
    });
  } catch {
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (s.data()?.processing?.id === requestId)
        tx.update(ref, {
          processing: null,
          history: [
            ...s.data().history,
            {
              role: "assistant",
              content:
                "The page assistant could not finish that request. Your confirmed draft is safe. Please try again.",
            },
          ],
        });
    });
    throw new HttpsError(
      "unavailable",
      "The page assistant could not finish. Your saved draft is unchanged.",
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
      if (p?.proposal || p?.processing?.until > Date.now())
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
    if (["confirm", "reject"].includes(d.action)) {
      if (
        !p.proposal ||
        p.proposal.id !== d.proposalId ||
        p.proposal.baseRevision !== p.revision
      )
        throw new HttpsError(
          "aborted",
          "This proposal has changed. Refresh first.",
        );
      if (d.action === "confirm") {
        update.draft = validateDocument(p.proposal.document, p.assets);
        if (locationKey(update.draft) !== locationKey(p.draft))
          update.locationConfirmed = null;
        if (timeKey(update.draft) !== timeKey(p.draft))
          update.timeConfirmed = null;
        tx.set(ref.collection("revisions").doc(String(update.revision)), {
          document: update.draft,
          assets: p.assets || [],
          by: user.uid,
          at: update.updatedAt,
        });
      }
      update.proposal = null;
      update.history = [
        ...p.history,
        {
          role: "assistant",
          content:
            d.action === "confirm"
              ? "Revision confirmed and saved privately."
              : "Proposal cancelled. Your saved draft is unchanged.",
        },
      ];
    } else {
      if (p.proposal)
        throw new HttpsError(
          "failed-precondition",
          "Confirm or cancel the pending proposal first.",
        );
      if (d.action === "location")
        update.locationConfirmed = locationKey(p.draft);
      else if (d.action === "time") update.timeConfirmed = timeKey(p.draft);
      else if (d.action === "publish") {
        const doc = publishable(p);
        Object.assign(update, {
          published: doc,
          publishedAssets: p.assets,
          status: "published",
          name: doc.title,
          description: doc.description,
          startsAt: doc.startsAt,
          endsAt: doc.endsAt,
          timezone: doc.timezone,
          location: doc.venue.address,
        });
      } else if (d.action === "cancel") update.status = "cancelled";
      else throw new HttpsError("invalid-argument", "Unknown action.");
    }
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
      if (p.proposal)
        throw new HttpsError(
          "failed-precondition",
          "Resolve the pending proposal first.",
        );
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
