import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { callable } from "../../core/config.js";
import { auth, db } from "../../core/firebase.js";
import { email } from "../../core/values.js";
import { EMAIL_SECRETS, sendPasswordResetEmail } from "../../services/email.js";

const RESET_ORIGIN = process.env.PUBLIC_APP_URL || "https://uniqenergy-de71c.web.app";
const COOLDOWN_MS = 60_000;
const WINDOW_MS = 60 * 60_000;
const MAX_PER_WINDOW = 5;

function genericSuccess() { return { success: true }; }

export const requestPasswordReset = onCall({ ...callable, secrets: EMAIL_SECRETS }, async (request) => {
  const address = email(request.data?.email);
  let authUser;
  try { authUser = await auth.getUserByEmail(address); }
  catch (error) { if (error.code === "auth/user-not-found") return genericSuccess(); throw error; }
  if (authUser.disabled) return genericSuccess();

  const profile = await db.collection("users").doc(authUser.uid).get();
  if (!profile.exists || profile.data()?.schemaVersion !== 1 || profile.data()?.status !== "active") return genericSuccess();

  const now = Date.now();
  const rateRef = db.collection("passwordResetRequests").doc(createHash("sha256").update(address).digest("hex"));
  const allowed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(rateRef), data = snapshot.data(), lastSent = data?.lastSentAt?.toMillis?.() || 0;
    const windowStarted = data?.windowStartedAt?.toMillis?.() || 0;
    if (now - lastSent < COOLDOWN_MS) return false;
    const inWindow = now - windowStarted < WINDOW_MS;
    const count = inWindow ? Number(data?.count || 0) : 0;
    if (count >= MAX_PER_WINDOW) return false;
    transaction.set(rateRef, { schemaVersion: 1, emailHash: rateRef.id, count: count + 1, windowStartedAt: Timestamp.fromMillis(inWindow ? windowStarted : now), lastSentAt: Timestamp.fromMillis(now), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  if (!allowed) return genericSuccess();

  try {
    const resetUrl = await auth.generatePasswordResetLink(address, { url: `${RESET_ORIGIN}/signin` });
    await sendPasswordResetEmail({ to: address, name: profile.data()?.firstName, resetUrl });
    return genericSuccess();
  } catch (error) {
    console.error("Password reset delivery failed", { uid: authUser.uid, code: error?.code });
    throw new HttpsError("unavailable", "Password reset instructions could not be sent. Please try again.");
  }
});
