import { randomBytes } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../../core/firebase.js";
import { callable } from "../../core/config.js";
import { requireAvailable, requireUser } from "../../core/auth.js";
import { text } from "../../core/values.js";
import { hash, issueLoginCode } from "../account/login.js";
import { EMAIL_SECRETS } from "../../services/email.js";
export async function invitationLink(partyId, guestId) {
  const token = randomBytes(32).toString("hex");
  await db
    .doc(`uexInvitationTokens/${hash(token)}`)
    .create({ partyId, guestId, createdAt: Date.now() });
  return `https://uniqenergy.com/join/${token}`;
}
async function resolve(token, tx) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw new HttpsError(
      "not-found",
      "This invitation link is unavailable. Ask the host to resend it.",
    );
  const read = (ref) => (tx ? tx.get(ref) : ref.get());
  const meta = (
    await read(db.doc(`uexInvitationTokens/${hash(token)}`))
  ).data();
  if (!meta)
    throw new HttpsError(
      "not-found",
      "This invitation link is unavailable. Ask the host to resend it.",
    );
  const ref = db.doc(`uexParties/${meta.partyId}/guests/${meta.guestId}`);
  const g = (await read(ref)).data(),
    p = (await read(ref.parent.parent)).data();
  if (
    !g ||
    g.revoked ||
    !p ||
    p.status === "draft" ||
    (p.draft && !p.published)
  )
    throw new HttpsError(
      "permission-denied",
      "This invitation is no longer available. Please contact the host.",
    );
  return { g, p, ref, partyId: meta.partyId };
}
export const uexInvitationEntry = onCall(
  { ...callable, secrets: EMAIL_SECRETS },
  async (request) => {
    await requireAvailable();
    const { g, partyId } = await resolve(request.data?.token);
    let current = null;
    if (request.auth) {
      try {
        current = await requireUser(request);
      } catch (e) {
        if (!["permission-denied", "unauthenticated"].includes(e.code)) throw e;
      }
    }
    const legacyNames =
      !g.firstName && !g.lastName ? (g.name || "").split(" ") : [];
    if (current?.user.email === g.email && (!g.uid || g.uid === current.uid))
      return {
        step: g.onboardedAt ? "complete" : "names",
        partyId,
        firstName:
          current.user.firstName || g.firstName || legacyNames[0] || "",
        lastName:
          current.user.lastName ||
          g.lastName ||
          legacyNames.slice(1).join(" ") ||
          "",
      };
    const device = request.data?.requestId;
    if (typeof device !== "string" || !/^[a-zA-Z0-9_-]{16,100}$/.test(device))
      throw new HttpsError(
        "invalid-argument",
        "Reload this invitation to continue.",
      );
    const challenge = await issueLoginCode(
      request,
      g.email,
      `${hash(request.data.token)}:${device}`,
    );
    const [local, domain] = g.email.split("@");
    return {
      ...challenge,
      step: "code",
      maskedEmail: `${local[0]}•••@${domain}`,
      switching: !!current,
    };
  },
);
export const uexConfirmGuestNames = onCall(callable, async (request) => {
  const current = await requireUser(request),
    firstName = text(request.data?.firstName, "first name", 80),
    lastName = text(request.data?.lastName, "last name", 80);
  const partyId = await db.runTransaction(async (tx) => {
    const { g, ref, partyId } = await resolve(request.data?.token, tx);
    if (g.email !== current.user.email || (g.uid && g.uid !== current.uid))
      throw new HttpsError(
        "permission-denied",
        "Verify the invited email before continuing.",
      );
    tx.update(current.ref, { firstName, lastName });
    tx.update(ref, {
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      uid: current.uid,
      onboardedAt: new Date().toISOString(),
    });
    return partyId;
  });
  return { partyId };
});
