// User Access mini app (super admins only): invite users, choose their type and mini apps, edit them, and disable them.
// Source of truth: Firestore users/{Firebase Auth uid} = { email, firstName, lastName, type, miniApps, photo, invite, disabled, createdAt, createdBy, updatedAt, updatedBy }.
// Browsers never touch Firestore. Passwords are never read, stored, logged or returned.
// A super admin sets names, email and access. The password and the profile photo belong to the person alone.
import { randomBytes, randomUUID } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db, callable, resendApiKey, requireSuperAdmin, text } from "./core.js";
import { fetchDeliveryStatus, sendInviteEmail, SIGN_IN_URL } from "./mailer.js";
import { deliverInvite, deliveryUpdate, needsDeliveryCheck } from "./invite.js";
import { fullName } from "./profile.js";
import { assertActiveSuperAdminRemains, assertSelfChangeIsSafe, notYourself, userView, validateUserFields } from "./users.js";

const users = () => db.collection("users");
const withEmail = { ...callable, secrets: [resendApiKey] };
const notFound = () => new HttpsError("not-found", "That user no longer exists.");
const isMissing = (error) => error?.code === "auth/user-not-found";

function authError(error) {
  if (error?.code === "auth/email-already-exists") return new HttpsError("already-exists", "A user with that email already exists.");
  if (error?.code === "auth/invalid-email") return new HttpsError("invalid-argument", "Enter a valid email address.");
  if (isMissing(error)) return notFound();
  return error;
}

/** Emails a one-time set-password link. Returns { sent: true, id } or { sent: false, reason }. The link is never returned or logged. */
function sendInvite(uid, record, invitedBy) {
  if (record.disabled === true) return Promise.resolve({ sent: false, reason: "Enable this user before sending an invite." });
  return deliverInvite({ uid, record, invitedBy }, {
    makeLink: (address) => getAuth().generatePasswordResetLink(address, { url: SIGN_IN_URL }),
    send: (invite, idempotencyKey) => sendInviteEmail(invite, resendApiKey.value(), { idempotencyKey }),
    save: (invite) => users().doc(uid).update({ invite }),
    newKey: randomUUID,
    now: () => new Date(),
    log: (message) => globalThis.console.error(message),
  });
}

async function refreshDeliveries(docs) {
  const now = Date.now();
  const pending = docs.filter((doc) => {
    const invite = doc.data().invite;
    return needsDeliveryCheck(invite, invite?.at?.toMillis?.() ?? 0, now);
  }).slice(0, 10);
  const fresh = new Map();
  for (const doc of pending) {
    const invite = doc.data().invite;
    try {
      const status = await fetchDeliveryStatus(invite.resendId, resendApiKey.value());
      const next = deliveryUpdate(invite, status, new Date());
      await doc.ref.update({ invite: next });
      fresh.set(doc.id, next);
    } catch (error) {
      globalThis.console.error(`Invite delivery check failed for ${doc.id}`, error instanceof Error ? error.message : error);
    }
  }
  return fresh;
}

async function lastSignIns(uids) {
  const result = new Map();
  for (let start = 0; start < uids.length; start += 100) {
    const { users: found } = await getAuth().getUsers(uids.slice(start, start + 100).map((uid) => ({ uid })));
    for (const account of found) result.set(account.uid, account.metadata.lastSignInTime ? new Date(account.metadata.lastSignInTime).toISOString() : null);
  }
  return result;
}

function changeRecord(uid, change) {
  return db.runTransaction(async (transaction) => {
    const all = await transaction.get(users().limit(500));
    const target = all.docs.find((doc) => doc.id === uid);
    if (!target) throw notFound();
    return change({ transaction, ref: target.ref, current: target.data(), records: all.docs.map((doc) => ({ uid: doc.id, ...doc.data() })) });
  });
}

export const listUsers = onCall(withEmail, async (request) => {
  const actor = await requireSuperAdmin(request);
  const snapshot = await users().limit(500).get();
  const signedIn = await lastSignIns(snapshot.docs.map((doc) => doc.id));
  const fresh = await refreshDeliveries(snapshot.docs);
  const list = snapshot.docs.map((doc) => ({ ...userView(doc.id, { ...doc.data(), invite: fresh.get(doc.id) ?? doc.data().invite }, signedIn.get(doc.id)), you: doc.id === actor.uid })).sort((a, b) => a.email.localeCompare(b.email));
  return { users: list };
});

/** Creates the sign-in account and the access record together, then emails the invite and waits for Resend's answer. */
export const createUser = onCall(withEmail, async (request) => {
  const actor = await requireSuperAdmin(request);
  const { email: address, firstName, lastName, ...access } = validateUserFields(request.data);
  const record = { email: address, firstName, lastName };
  const existing = await getAuth().getUserByEmail(address).then(() => true, (error) => { if (isMissing(error)) return false; throw error; });
  if (existing) throw new HttpsError("already-exists", "A user with that email already exists.");
  const account = await getAuth().createUser({ email: address, displayName: fullName({ firstName, lastName }), password: randomBytes(32).toString("base64url"), emailVerified: true, disabled: false });
  try {
    const now = FieldValue.serverTimestamp();
    await users().doc(account.uid).create({ ...record, ...access, photo: null, disabled: false, invite: null, createdAt: now, createdBy: actor.email, updatedAt: now, updatedBy: actor.email });
  } catch (error) {
    await getAuth().deleteUser(account.uid);
    throw error;
  }
  return { uid: account.uid, email: address, invite: await sendInvite(account.uid, record, actor.email) };
});

/** Changes a user's names, email, type and mini apps. An email change updates Auth first, then the record, and revokes sessions. */
export const updateUser = onCall(callable, async (request) => {
  const actor = await requireSuperAdmin(request);
  const uid = text(request.data?.uid, "user", 128);
  const next = validateUserFields(request.data);
  const check = ({ current, records }) => {
    assertSelfChangeIsSafe(actor, uid, current, next);
    assertActiveSuperAdminRemains(records, uid, { type: next.type, disabled: current.disabled === true });
    return current;
  };
  const save = ({ transaction, ref, current, records }) => {
    check({ current, records });
    transaction.update(ref, { ...next, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.email });
  };
  const current = await changeRecord(uid, check);
  const emailChanged = next.email !== current.email;
  const before = { email: current.email, displayName: fullName(current) };
  const after = { email: next.email, displayName: fullName(next) };
  const accountChanged = emailChanged || before.displayName !== after.displayName;
  if (accountChanged) {
    try { await getAuth().updateUser(uid, { ...after, emailVerified: true }); } catch (error) { throw authError(error); }
  }
  try {
    await changeRecord(uid, save);
  } catch (error) {
    if (accountChanged) await getAuth().updateUser(uid, before).catch((revert) => globalThis.console.error("Could not restore the sign-in account", revert instanceof Error ? revert.message : revert));
    throw error;
  }
  if (emailChanged) await getAuth().revokeRefreshTokens(uid);
  return { success: true };
});

/** Turns sign-in on or off for one user. The record and the Firebase Auth account stay, so the person can be enabled again. */
export const setUserDisabled = onCall(callable, async (request) => {
  const actor = await requireSuperAdmin(request);
  const uid = text(request.data?.uid, "user", 128);
  if (typeof request.data?.disabled !== "boolean") throw new HttpsError("invalid-argument", "Choose whether this user is disabled.");
  const disabled = request.data.disabled;
  notYourself(actor, uid, disabled ? "disable" : "change");
  const current = await changeRecord(uid, ({ current: record, records }) => {
    assertActiveSuperAdminRemains(records, uid, { type: record.type, disabled });
    return record;
  });
  try { await getAuth().updateUser(uid, { disabled }); } catch (error) { throw authError(error); }
  try {
    await changeRecord(uid, ({ transaction, ref, current: fresh, records }) => {
      assertActiveSuperAdminRemains(records, uid, { type: fresh.type, disabled });
      transaction.update(ref, { disabled, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.email });
    });
  } catch (error) {
    await getAuth().updateUser(uid, { disabled: current.disabled === true }).catch((revert) => globalThis.console.error("Could not restore the sign-in account", revert instanceof Error ? revert.message : revert));
    throw error;
  }
  if (disabled) await getAuth().revokeRefreshTokens(uid);
  return { success: true, disabled };
});

/** Emails a fresh invite (a new one-time link to choose a password) to an existing user. */
export const sendUserInvite = onCall(withEmail, async (request) => {
  const actor = await requireSuperAdmin(request);
  const uid = text(request.data?.uid, "user", 128);
  const snapshot = await users().doc(uid).get();
  if (!snapshot.exists) throw notFound();
  return { invite: await sendInvite(uid, snapshot.data(), actor.email) };
});
