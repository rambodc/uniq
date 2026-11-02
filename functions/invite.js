// The invite a super admin sends a new (or existing) user, and what the User Access screen shows about it.
// Every user record has `invite`: null when no invite was ever sent from User Access (accounts set up by hand),
// otherwise { status, at, by, resendId, error, checkedAt }:
//   status    "sent" (Resend accepted it), "delivered", "delayed", "bounced", "complained" (marked as spam) or "failed" (it never went out)
//   at        when the invite was attempted; by: the super admin who sent it
//   resendId  Resend's email id (null when it failed); error: why it failed or bounced, in words a super admin can act on (otherwise null)
//   checkedAt when the delivery status was last read from Resend (null until then)
// No Firebase here, so it is easy to test: the callables pass in how to make the link, send the email and save the status.

/** Statuses that are final: nothing more will happen to that email. */
export const FINAL_INVITE_STATUSES = ["delivered", "bounced", "complained", "failed"];
/** Statuses a super admin must act on (send the invite again, or fix the address). */
export const PROBLEM_INVITE_STATUSES = ["bounced", "complained", "failed"];
/** Delivery is re-checked with Resend only for this long after the invite went out. */
export const DELIVERY_CHECK_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const short = (message) => String(message).slice(0, 300);
/** Turns a failure into words a super admin can act on. Never includes the key, the link or the message. */
export function failureReason(stage, error) {
  const detail = error instanceof Error ? error.message : String(error);
  return short(stage === "link" ? `The sign-in link could not be made (${detail}).` : `The email could not be sent. ${detail}.`);
}

/**
 * Makes a fresh one-time link, emails it and saves the outcome on the user's record. Never throws for an email problem:
 * it returns { sent: true, id } or { sent: false, reason }, and the record says the same.
 * `deps` = { makeLink(email), send({ to, firstName, invitedBy, link }, idempotencyKey) -> { id }, save(invite), newKey(), now(), log(message) }.
 */
export async function deliverInvite({ uid, record, invitedBy }, deps) {
  const attempt = { at: deps.now(), by: invitedBy, checkedAt: null };
  let result, invite;
  let link;
  try { link = await deps.makeLink(record.email); } catch (error) { result = { sent: false, reason: failureReason("link", error) }; }
  if (link) {
    try {
      const { id } = await deps.send({ to: record.email, firstName: record.firstName, invitedBy, link }, `user-invite/${uid}/${deps.newKey()}`);
      result = { sent: true, id };
    } catch (error) { result = { sent: false, reason: failureReason("send", error) }; }
  }
  if (result.sent) invite = { ...attempt, status: "sent", resendId: result.id, error: null };
  else { invite = { ...attempt, status: "failed", resendId: null, error: result.reason }; deps.log(`Invite email failed for ${uid}: ${result.reason}`); }
  try { await deps.save(invite); } catch (error) { deps.log(`Invite status could not be saved for ${uid}: ${error instanceof Error ? error.message : error}`); }
  return result;
}

/** Whether the User Access screen should ask Resend again where this invite got to. `atMs` is when it was sent. */
export function needsDeliveryCheck(invite, atMs, nowMs) {
  return Boolean(invite?.resendId) && !FINAL_INVITE_STATUSES.includes(invite.status) && nowMs - atMs < DELIVERY_CHECK_WINDOW_MS;
}
/** The record change after reading Resend's status (or null when nothing changed). */
export function deliveryUpdate(invite, status, checkedAt) {
  const error = status === "bounced" ? "The email bounced: the address may be wrong or the mailbox is not accepting mail." : status === "complained" ? "The person's mail provider marked the invite as spam." : status === "failed" ? "Resend could not deliver the email." : null;
  return { ...invite, status, error, checkedAt };
}

/** The invite as the browser sees it (times as ISO strings). Never includes Resend's email id. */
export function inviteView(invite) {
  if (!invite) return null;
  const iso = (value) => value?.toDate?.().toISOString() ?? (value instanceof Date ? value.toISOString() : null);
  return { status: invite.status, at: iso(invite.at), by: invite.by, error: invite.error ?? null, checkedAt: iso(invite.checkedAt) };
}
