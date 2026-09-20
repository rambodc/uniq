import {
  createHash,
  createHmac,
  randomInt,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { auth, db } from "../../core/firebase.js";
import { callable } from "../../core/config.js";
import { requireUser } from "../../core/auth.js";
import { email } from "../../core/values.js";
import { EMAIL_SECRETS, sendEmail } from "../../services/email.js";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
const digest = (id, code) =>
  createHmac("sha256", process.env.SMTP_PASSWORD)
    .update(`${id}:${code}`)
    .digest("hex");
export function checkCode(challenge, supplied, now) {
  if (
    !challenge ||
    challenge.consumed ||
    challenge.expiresAt <= now ||
    challenge.attempts >= 5
  )
    return false;
  return (
    typeof supplied === "string" &&
    /^[a-f0-9]{64}$/.test(supplied) &&
    timingSafeEqual(
      Buffer.from(challenge.digest, "hex"),
      Buffer.from(supplied, "hex"),
    )
  );
}
export async function issueLoginCode(request, address, dedupeKey = null) {
  const id = randomBytes(24).toString("hex"),
    code = String(randomInt(0, 1000000)).padStart(6, "0"),
    now = Date.now();
  const emailRef = db.doc(`loginLimits/email-${hash(address)}`),
    ipRef = db.doc(
      `loginLimits/ip-${hash(request.rawRequest.ip || "unknown")}`,
    ),
    ref = db.doc(`loginChallenges/${id}`);
  const dedupe = dedupeKey ? db.doc(`loginRequests/${hash(dedupeKey)}`) : null;
  const reused = await db.runTransaction(async (tx) => {
    if (dedupe) {
      const prior = (await tx.get(dedupe)).data();
      if (prior && prior.expiresAt > now) {
        const challenge = (
          await tx.get(db.doc(`loginChallenges/${prior.challengeId}`))
        ).data();
        if (challenge && !challenge.consumed) return prior;
      }
    }
    const [e, i] = await tx.getAll(emailRef, ipRef);
    for (const [snap, limit, cooldown] of [
      [e, 5, 60000],
      [i, 30, 0],
    ]) {
      const old = snap.data() || {},
        fresh = now - (old.started || 0) >= 3600000;
      if (now - (old.last || 0) < cooldown || (!fresh && old.count >= limit))
        throw new HttpsError(
          "resource-exhausted",
          "Please wait before requesting another code.",
        );
      tx.set(snap.ref, {
        started: fresh ? now : old.started,
        last: now,
        count: fresh ? 1 : old.count + 1,
      });
    }
    if (dedupe)
      tx.set(dedupe, {
        challengeId: id,
        expiresAt: now + 600000,
        resendAt: now + 60000,
      });
    tx.create(ref, {
      email: address,
      digest: digest(id, code),
      attempts: 0,
      expiresAt: now + 600000,
      consumed: false,
    });
  });
  if (reused) return reused;
  try {
    await sendEmail({
      to: address,
      subject: "Your UniqAccount sign-in code",
      text: `Your UniqAccount code is ${code}. It expires in 10 minutes. Do not share this code. If you did not request it, ignore this email.`,
    });
  } catch {
    await ref.delete();
    if (dedupe) await dedupe.delete();
    throw new HttpsError(
      "unavailable",
      "The code could not be sent. Please try again shortly.",
    );
  }
  return { challengeId: id, expiresAt: now + 600000, resendAt: now + 60000 };
}
export const requestLoginCode = onCall(
  { ...callable, secrets: EMAIL_SECRETS },
  (request) => issueLoginCode(request, email(request.data?.email)),
);
export const verifyLoginCode = onCall(
  { ...callable, secrets: EMAIL_SECRETS },
  async (request) => {
    const { challengeId: id, code } = request.data || {};
    if (
      typeof id !== "string" ||
      !/^[a-f0-9]{48}$/.test(id) ||
      !/^\d{6}$/.test(String(code))
    )
      throw new HttpsError("invalid-argument", "Enter the six-digit code.");
    const address = await db.runTransaction(async (tx) => {
      const ref = db.doc(`loginChallenges/${id}`),
        snap = await tx.get(ref),
        c = snap.data();
      if (!c || c.consumed || c.expiresAt <= Date.now() || c.attempts >= 5)
        return null;
      const valid = checkCode(c, digest(id, String(code)), Date.now());
      tx.update(ref, { attempts: c.attempts + 1, consumed: valid });
      return valid ? c.email : null;
    });
    if (!address)
      throw new HttpsError(
        "permission-denied",
        "Code is incorrect or expired. Request a new code if needed.",
      );
    let account;
    try {
      account = await auth.getUserByEmail(address);
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
      try {
        account = await auth.createUser({
          email: address,
          emailVerified: true,
        });
      } catch (e) {
        if (e.code !== "auth/email-already-exists") throw e;
        account = await auth.getUserByEmail(address);
      }
    }
    if (account.disabled)
      throw new HttpsError("permission-denied", "This account is disabled.");
    if (!account.emailVerified)
      await auth.updateUser(account.uid, { emailVerified: true });
    const ref = db.doc(`users/${account.uid}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (
        snap.exists &&
        (snap.data().status !== "active" || snap.data().schemaVersion !== 2)
      )
        throw new HttpsError(
          "permission-denied",
          "This account is unavailable.",
        );
      if (!snap.exists)
        tx.create(ref, {
          schemaVersion: 2,
          email: address,
          firstName: "",
          lastName: "",
          role: "member",
          status: "active",
          enabledMiniApps: [],
          createdAt: new Date().toISOString(),
        });
    });
    return { customToken: await auth.createCustomToken(account.uid) };
  },
);
export const revokeMySessions = onCall(callable, async (request) => {
  const current = await requireUser(request);
  await current.ref.update({
    sessionsRevokedBefore: Math.floor(Date.now() / 1000),
  });
  await auth.revokeRefreshTokens(current.uid);
  return { success: true };
});
