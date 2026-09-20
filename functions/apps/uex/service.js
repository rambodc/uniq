import { createHash, randomBytes, randomUUID } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, storage } from "../../core/firebase.js";
import { callable } from "../../core/config.js";
import { requireMiniApp, requireUser } from "../../core/auth.js";
import { email, text, docId } from "../../core/values.js";
import { EMAIL_SECRETS, sendEmail } from "../../services/email.js";
const parties = db.collection("uexParties");
const refFor = (id) => parties.doc(docId(id, "party"));
const keyFor = (address) => createHash("sha256").update(address).digest("hex");
const invites = (id) => refFor(id).collection("guests");
const wrap = (fn, manager = true, secrets = []) =>
  onCall(
    { ...callable, secrets, timeoutSeconds: 300, memory: "512MiB" },
    async (request) =>
      fn(
        request.data || {},
        manager
          ? await requireMiniApp(request, "uex")
          : await requireUser(request),
      ),
  );
export function partyValues(d) {
  const start = new Date(d.startsAt),
    end = new Date(d.endsAt),
    timezone = text(d.timezone || "America/Edmonton", "timezone", 80);
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(start);
  } catch {
    throw new HttpsError(
      "invalid-argument",
      "Choose a valid date and timezone.",
    );
  }
  if (!Number.isFinite(end.getTime()) || end <= start)
    throw new HttpsError(
      "invalid-argument",
      "End time must be after start time.",
    );
  if (!["draft", "published", "cancelled"].includes(d.status))
    throw new HttpsError("invalid-argument", "Choose a valid party status.");
  return {
    name: text(d.name, "party name", 120),
    description: text(d.description, "description", 5000),
    location: text(d.location, "location", 500),
    timezone,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    status: d.status,
    archived: d.archived === true,
  };
}
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
    Date.parse(p.startsAt) <= Date.now(),
});
async function withCover(p) {
  if (!p.coverPath) return { ...p, coverUrl: null };
  const [url] = await storage
    .bucket()
    .file(p.coverPath)
    .getSignedUrl({ action: "read", expires: Date.now() + 15 * 60000 });
  const safe = { ...p };
  delete safe.coverPath;
  return { ...safe, coverUrl: url };
}
export const uexListParties = wrap(async () => {
  const snapshot = await parties.orderBy("startsAt", "desc").get();
  return {
    parties: await Promise.all(
      snapshot.docs.map((d) => withCover({ ...d.data(), id: d.id })),
    ),
  };
});
export const uexSaveParty = wrap(async (d, current) => {
  const values = partyValues(d),
    ref = d.id ? refFor(d.id) : parties.doc();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (d.id && !snap.exists)
      throw new HttpsError("not-found", "Party not found.");
    if (
      snap.exists &&
      Date.parse(snap.data().endsAt) <= Date.now() &&
      Object.keys(values).some(
        (key) => key !== "archived" && values[key] !== snap.data()[key],
      )
    )
      throw new HttpsError(
        "failed-precondition",
        "Past parties are read-only; you can archive them.",
      );
    tx.set(
      ref,
      {
        ...values,
        updatedAt: new Date().toISOString(),
        updatedBy: current.uid,
        ...(!snap.exists
          ? { createdBy: current.uid, createdAt: new Date().toISOString() }
          : {}),
      },
      { merge: true },
    );
  });
  return { id: ref.id };
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
export const uexUploadCover = wrap(async (d) => {
  const ref = refFor(d.id),
    snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Party not found.");
  if (Date.parse(snap.data().endsAt) <= Date.now())
    throw new HttpsError("failed-precondition", "Past parties are read-only.");
  if (typeof d.base64 !== "string" || d.base64.length > 6990508)
    throw new HttpsError("invalid-argument", "Choose an image up to 5 MB.");
  const bytes = Buffer.from(d.base64, "base64"),
    mime = imageType(bytes);
  if (!mime || bytes.length > 5 * 1024 * 1024)
    throw new HttpsError(
      "invalid-argument",
      "Choose a JPEG, PNG, or WebP up to 5 MB.",
    );
  const path = `uex/${ref.id}/${randomUUID()}`;
  await storage
    .bucket()
    .file(path)
    .save(bytes, { resumable: false, contentType: mime });
  await ref.update({ coverPath: path });
  if (snap.data().coverPath)
    await storage
      .bucket()
      .file(snap.data().coverPath)
      .delete({ ignoreNotFound: true });
  return { success: true };
});
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
    Date.parse(p.data().startsAt) <= Date.now()
  )
    throw new HttpsError(
      "failed-precondition",
      "Invitations are closed for this party.",
    );
  if (!Array.isArray(d.guests) || !d.guests.length || d.guests.length > 100)
    throw new HttpsError(
      "invalid-argument",
      "Add 1–100 named guests at a time.",
    );
  const guests = [
    ...new Map(
      d.guests.map((g) => {
        const address = email(g.email);
        return [
          address,
          { email: address, name: text(g.name, "guest name", 160) },
        ];
      }),
    ).values(),
  ];
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
    const p = (await refFor(d.id).get()).data();
    if (!p || p.status === "draft")
      throw new HttpsError(
        "failed-precondition",
        "Publish the party before sending invitations.",
      );
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
        const url = `${process.env.PUBLIC_APP_URL || "https://uniqenergy-de71c.web.app"}/member/parties/${d.id}`;
        await sendEmail({
          to: guest.email,
          subject: `${d.kind === "cancellation" ? "Cancelled: " : d.kind === "update" ? "Update: " : "You're invited: "}${p.name}`,
          text: `Hello ${guest.name},\n\n${p.name}\n${p.description}\n${new Intl.DateTimeFormat("en-CA", { dateStyle: "full", timeStyle: "short", timeZone: p.timezone }).format(new Date(p.startsAt))}\n${p.location}\n\n${d.kind === "cancellation" ? "This party has been cancelled." : "View your party and RSVP:"}\n${url}\n\nSign in with ${guest.email}. This invitation is for you only.`,
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
    if (!p.exists || p.data().status === "draft" || p.data().archived) continue;
    result.push(
      await withCover({
        ...p.data(),
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
    return { ...p, id: ref.id, guest: publicGuest(p, g) };
  });
  return { party: await withCover(result) };
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
      p.archived ||
      Date.parse(p.startsAt) <= Date.now()
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
