import { createHash, randomBytes, randomUUID } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../../core/firebase.js";
import { callable } from "../../core/config.js";
import { requireMiniApp, requireUser } from "../../core/auth.js";
import { email, docId, optionalText } from "../../core/values.js";
import { EMAIL_SECRETS, sendEmail } from "../../services/email.js";
import { invitationLink } from "./onboarding.js";
import { guestProjection, partySummary } from "./document.js";
import { signedAssets } from "./builder.js";
const escapeHtml = (value) =>
  String(value || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const parties = db.collection("uexParties");
const refFor = (id) => parties.doc(docId(id, "party"));
const keyFor = (address) => createHash("sha256").update(address).digest("hex");
const invites = (id) => refFor(id).collection("guests");
const wrap = (fn, manager = true, secrets = []) =>
  onCall(
    { ...callable, secrets, timeoutSeconds: 300, memory: "512MiB" },
    async (request) => {
      return fn(
        request.data || {},
        manager
          ? await requireMiniApp(request, "uex")
          : await requireUser(request),
      );
    },
  );
export function ticketValid(p, guest) {
  return (
    p.status === "published" && !guest.revoked && guest.rsvp === "accepted"
  );
}
const publicGuest = (p, g) => ({
  name: g.name,
  rsvp: g.rsvp,
  ticket: g.ticket || null,
  ticketValid: ticketValid(p, g),
  readOnly:
    p.status !== "published" ||
    p.archived ||
    Date.parse(p.published?.startsAt) <= Date.now(),
});
async function withAssets(p) {
  const assets = await signedAssets(p.assets);
  const hero = p.document.sections.find((s) => s.type === "hero")?.items[0]
    ?.assetId;
  return {
    ...p,
    assets,
    coverUrl: assets.find((a) => a.id === hero)?.url || null,
  };
}
export const uexListParties = wrap(async () => {
  const snapshot = await parties.get();
  return {
    parties: snapshot.docs.map((d) => ({
      ...partySummary(d.data(), d.data().draft),
      id: d.id,
    })),
  };
});
export function imageType(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}
export const uexGuests = wrap(async (d) => {
  const snap = await invites(d.id).orderBy("email").get();
  return { guests: snap.docs.map((g) => ({ ...g.data(), id: g.id })) };
});
export const uexAddGuests = wrap(async (d) => {
  const p = await refFor(d.id).get();
  if (!p.exists) throw new HttpsError("not-found", "Party not found.");
  if (
    p.data().status === "cancelled" ||
    p.data().archived ||
    Date.parse(p.data().published?.startsAt) <= Date.now()
  )
    throw new HttpsError(
      "failed-precondition",
      "Invitations are closed for this party.",
    );
  if (!Array.isArray(d.guests) || !d.guests.length || d.guests.length > 100)
    throw new HttpsError("invalid-argument", "Add 1–100 guests at a time.");
  const byEmail = new Map();
  for (const g of d.guests) {
    const address = email(g.email),
      previous = byEmail.get(address);
    const firstName =
      optionalText(g.firstName, "first name", 80) || previous?.firstName || "";
    const lastName =
      optionalText(g.lastName, "last name", 80) || previous?.lastName || "";
    byEmail.set(address, {
      email: address,
      firstName,
      lastName,
      name: [firstName, lastName].filter(Boolean).join(" "),
    });
  }
  const guests = [...byEmail.values()];
  await db.runTransaction(async (tx) => {
    const refs = guests.map((g) => invites(d.id).doc(keyFor(g.email))),
      snapshots = await tx.getAll(...refs);
    snapshots.forEach((snap, i) => {
      if (!snap.exists)
        tx.create(snap.ref, {
          ...guests[i],
          rsvp: "pending",
          revoked: false,
          delivery: "not-sent",
          createdAt: new Date().toISOString(),
        });
    });
  });
  return { success: true };
});
export const uexRevokeGuest = wrap(async (d) => {
  await invites(d.id).doc(docId(d.guestId)).update({ revoked: true });
  return { success: true };
});
export const uexSendEmails = wrap(
  async (d) => {
    const record = (await refFor(d.id).get()).data();
    if (!record?.published)
      throw new HttpsError(
        "failed-precondition",
        "Publish the party before sending invitations.",
      );
    const p = partySummary(record, record.published);
    if (!["invitation", "update", "cancellation"].includes(d.kind))
      throw new HttpsError("invalid-argument", "Choose an email type.");
    if (
      (p.status === "cancelled" && d.kind !== "cancellation") ||
      (p.status !== "cancelled" && d.kind === "cancellation")
    )
      throw new HttpsError(
        "failed-precondition",
        "Email type must match the party status.",
      );
    if (
      !Array.isArray(d.guestIds) ||
      !d.guestIds.length ||
      d.guestIds.length > 20
    )
      throw new HttpsError(
        "invalid-argument",
        "Send to 1–20 guests at a time.",
      );
    const results = [];
    for (const id of [...new Set(d.guestIds)]) {
      const ref = invites(d.id).doc(docId(id)),
        attempt = randomUUID(),
        now = Date.now();
      const guest = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref),
          g = snap.data();
        if (
          !g ||
          g.revoked ||
          (g.sendingUntil || 0) > now ||
          now - (g.lastSentAt || 0) < 60000
        )
          return null;
        tx.update(ref, { sendingUntil: now + 300000, attempt });
        return g;
      });
      if (!guest) {
        results.push({ id, status: "skipped" });
        continue;
      }
      let delivery = "sent";
      try {
        const url = await invitationLink(d.id, id);
        await sendEmail({
          to: guest.email,
          subject: `${d.kind === "cancellation" ? "Cancelled: " : d.kind === "update" ? "Update: " : "You're invited: "}${p.name}`,
          html: `<div style="font-family:Arial,sans-serif;background:#101827;color:#f7f1e6;padding:40px;border-radius:20px"><p style="color:#d5b47b;letter-spacing:3px">UNIQ EXCLUSIVE</p><h1>${escapeHtml(p.name)}</h1><p>${escapeHtml(p.description)}</p><p>${escapeHtml(new Intl.DateTimeFormat("en-CA", { dateStyle: "full", timeStyle: "short", timeZone: p.timezone }).format(new Date(p.startsAt)))}</p><p>${escapeHtml(p.location)}</p><p>${d.kind === "cancellation" ? "This party has been cancelled." : "Your personal invitation is ready."}</p><a style="display:inline-block;background:#d5b47b;color:#101827;padding:16px 24px;border-radius:12px" href="${url}">Open your invitation</a><p>We’ll send a verification code to your invited email. This link does not grant access to your account.</p></div>`,
          text: `Hello ${guest.name || "there"},\n\n${p.name}\n${p.description}\n${new Intl.DateTimeFormat("en-CA", { dateStyle: "full", timeStyle: "short", timeZone: p.timezone }).format(new Date(p.startsAt))}\n${p.location}\n\n${d.kind === "cancellation" ? "This party has been cancelled." : "View your party and RSVP:"}\n${url}\n\nSign in with ${guest.email}. This invitation is for you only.`,
        });
      } catch {
        delivery = "failed";
      }
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.data()?.attempt === attempt)
          tx.update(ref, {
            delivery,
            sendingUntil: 0,
            lastSentAt:
              delivery === "sent" ? Date.now() : guest.lastSentAt || 0,
            lastEmailKind: d.kind,
          });
      });
      results.push({ id, status: delivery });
    }
    return { results };
  },
  true,
  EMAIL_SECRETS,
);
export const uexMyParties = wrap(async (_d, current) => {
  // Query only this member's invitations; no public party directory.
  const snapshot = await db
      .collectionGroup("guests")
      .where("email", "==", current.user.email)
      .get(),
    result = [];
  for (const g of snapshot.docs) {
    if (g.data().revoked) continue;
    const p = await g.ref.parent.parent.get();
    if (
      !p.exists ||
      p.data().status === "draft" ||
      !p.data().published ||
      p.data().archived
    )
      continue;
    result.push(
      await withAssets({
        ...guestProjection(p.data()),
        id: p.id,
        guest: publicGuest(p.data(), g.data()),
      }),
    );
  }
  return {
    parties: result.sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
  };
}, false);
export const uexGetMyParty = wrap(async (d, current) => {
  const ref = refFor(d.id),
    gref = invites(d.id).doc(keyFor(current.user.email));
  const result = await db.runTransaction(async (tx) => {
    const [ps, gs] = await tx.getAll(ref, gref),
      p = ps.data(),
      g = gs.data();
    if (
      !p ||
      p.status === "draft" ||
      !p.published ||
      !g ||
      g.revoked ||
      g.email !== current.user.email ||
      (g.uid && g.uid !== current.uid)
    )
      throw new HttpsError(
        "permission-denied",
        "This party is not available to your account.",
      );
    if (!g.uid) tx.update(gref, { uid: current.uid });
    return { ...guestProjection(p), id: ref.id, guest: publicGuest(p, g) };
  });
  return { party: await withAssets(result) };
}, false);
export const uexRsvp = wrap(async (d, current) => {
  if (!["accepted", "declined"].includes(d.rsvp))
    throw new HttpsError("invalid-argument", "Choose accept or decline.");
  const pref = refFor(d.id),
    gref = invites(d.id).doc(keyFor(current.user.email));
  await db.runTransaction(async (tx) => {
    const [ps, gs] = await tx.getAll(pref, gref),
      p = ps.data(),
      g = gs.data();
    if (!g || g.revoked || (g.uid && g.uid !== current.uid))
      throw new HttpsError(
        "permission-denied",
        "You are not invited to this party.",
      );
    if (
      !p ||
      p.status !== "published" ||
      !p.published ||
      p.archived ||
      Date.parse(p.published?.startsAt) <= Date.now()
    )
      throw new HttpsError("failed-precondition", "RSVPs are closed.");
    tx.update(gref, {
      uid: current.uid,
      rsvp: d.rsvp,
      ticket:
        g.ticket ||
        (d.rsvp === "accepted"
          ? randomBytes(8).toString("hex").toUpperCase()
          : null),
      respondedAt: new Date().toISOString(),
    });
  });
  return { success: true };
}, false);
