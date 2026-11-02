// Inquiry notifications and user invites are sent through Resend's HTTP API from the verified uniquem.ca domain.
// The API key comes from the Secret Manager secret RESEND_API_KEY and is never logged.
export const RESEND_ENDPOINT = "https://api.resend.com/emails";
// The one sender for every email the site sends. The address is Uniquem's verified sender; the display name is UniqEnergy.
export const EMAIL_FROM = "UniqEnergy Website <website@uniquem.ca>";
export const EMAIL_TO = "rambodr@uniquem.ca";
// Replies to invites come to the UniqEnergy inbox; inquiry replies go to the visitor.
export const EMAIL_REPLY_TO = EMAIL_TO;
export const SIGN_IN_URL = "https://uniqenergy.com/signin";

export function formatMountainTimestamp(value = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(new Date(value));
}

export function formatInquiryEmail(inquiry) {
  const timestamp = formatMountainTimestamp(inquiry.notificationTimestamp || new Date());
  return [
    "New UniqEnergy website inquiry",
    "",
    `Type: ${inquiry.inquiryType || "general"}`,
    inquiry.productName ? `Product: ${inquiry.productName}` : "",
    `Name: ${inquiry.name}`,
    inquiry.email ? `Email: ${inquiry.email}` : "",
    inquiry.company ? `Company: ${inquiry.company}` : "",
    inquiry.phone ? `Phone: ${inquiry.phone}` : "",
    `Submitted: ${timestamp}`,
    "",
    "Message:",
    inquiry.message,
  ].filter(Boolean).join("\n");
}

export function buildInquiryEmail(inquiry, to = EMAIL_TO) {
  // A unique, dated subject per submission so mail clients never thread leads together.
  const stamp = formatMountainTimestamp(inquiry.notificationTimestamp || new Date());
  const subject = `New UniqEnergy website inquiry${inquiry.productName ? ` (${inquiry.productName})` : ""} - ${stamp}`;
  // Reply goes straight to the visitor; phone-only leads reply to the inbox itself.
  return { from: EMAIL_FROM, to: [to], reply_to: inquiry.email || EMAIL_REPLY_TO, subject, text: formatInquiryEmail(inquiry) };
}

/** A failed Resend call. `transient` is true when trying again can help (network trouble, a timeout, 409 concurrent request, 429 or 5xx). */
export class ResendError extends Error {
  constructor(message, { status = null, transient }) {
    super(message);
    this.name = "ResendError";
    this.status = status;
    this.transient = transient;
  }
}
const isTransientStatus = (status) => status === 409 || status === 429 || status >= 500;
const pause = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));
/** How long to wait before try number `attempt + 1` (attempt starts at 1): 0.5 s, then 1.5 s, or Resend's Retry-After (at most 5 s). */
export function retryDelay(attempt, retryAfter) {
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 5000) : attempt === 1 ? 500 : 1500;
}

async function postOnce(message, headers, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(RESEND_ENDPOINT, { method: "POST", headers, body: JSON.stringify(message), signal: globalThis.AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new ResendError(`Resend could not be reached (${error instanceof Error ? error.message : "network error"})`, { transient: true });
  }
  if (!response.ok) {
    let detail = "";
    try { const body = await response.json(); detail = body?.message ? `: ${body.message}` : ""; } catch { /* ignore non-JSON bodies */ }
    const error = new ResendError(`Resend responded ${response.status}${detail}`, { status: response.status, transient: isTransientStatus(response.status) });
    error.retryAfter = response.headers?.get?.("retry-after") ?? null;
    throw error;
  }
  const body = await response.json();
  if (typeof body?.id !== "string" || !body.id) throw new ResendError("Resend accepted the request but returned no email id", { status: response.status, transient: false });
  return body;
}

/**
 * Posts one message to Resend and returns { id }. Transient failures are retried up to `retries` times with a short backoff.
 * Every try carries the same Idempotency-Key and body, so Resend sends the email at most once however many tries it takes.
 * Throws a ResendError when it still fails; the key and message are never logged.
 */
async function sendEmail(message, apiKey, { idempotencyKey, retries = 0, fetchImpl = globalThis.fetch, wait = pause } = {}) {
  if (!apiKey) throw new ResendError("RESEND_API_KEY is not configured", { transient: false });
  if (retries > 0 && !idempotencyKey) throw new Error("Retrying a send needs an idempotency key");
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  for (let attempt = 1; ; attempt += 1) {
    try { return await postOnce(message, headers, fetchImpl); } catch (error) {
      if (!(error instanceof ResendError) || !error.transient || attempt > retries) throw error;
      await wait(retryDelay(attempt, error.retryAfter));
    }
  }
}

/**
 * Sends the notification. `inquiryId` makes the Resend idempotency key so a
 * retried call never sends a duplicate. Throws on any non-2xx response.
 */
export function sendInquiryNotification(inquiry, apiKey, { inquiryId, to = EMAIL_TO, fetchImpl } = {}) {
  return sendEmail(buildInquiryEmail(inquiry, to), apiKey, { idempotencyKey: inquiryId ? `contact-inquiry/${inquiryId}` : undefined, fetchImpl });
}

/** The invite a new user receives: a one-time link to choose their own password. */
export function buildInviteEmail({ to, firstName, invitedBy, link }) {
  const text = [
    `Hi ${firstName},`,
    "",
    "You have been added to the UniqEnergy workspace.",
    "",
    `${invitedBy} created an account for you. Open this link to choose your password:`,
    "",
    link,
    "",
    `After that, sign in at ${SIGN_IN_URL} with this email address and your new password.`,
    "The link works for about an hour. If it has expired, ask the person who invited you to send a new invite.",
    "If you were not expecting this, you can ignore this email.",
  ].join("\n");
  return { from: EMAIL_FROM, to: [to], reply_to: EMAIL_REPLY_TO, subject: "Your UniqEnergy workspace account", text };
}

/** Invites retry twice on transient failures. `idempotencyKey` must be new for each invite (create or "Resend invite") and the same across its retries. */
export const INVITE_RETRIES = 2;
export function sendInviteEmail(invite, apiKey, { idempotencyKey, fetchImpl, wait } = {}) {
  return sendEmail(buildInviteEmail(invite), apiKey, { idempotencyKey, retries: INVITE_RETRIES, fetchImpl, wait });
}

/** What Resend's last event for an email means for an invite: "delivered", "delayed", "bounced", "complained" (marked as spam), "failed", or "sent" (still on its way). */
export function deliveryStatus(lastEvent) {
  if (["delivered", "opened", "clicked"].includes(lastEvent)) return "delivered";
  if (lastEvent === "delivery_delayed") return "delayed";
  if (lastEvent === "bounced") return "bounced";
  if (lastEvent === "complained") return "complained";
  if (["failed", "suppressed", "canceled"].includes(lastEvent)) return "failed";
  return "sent";
}
/** Reads where Resend got with one email (its last event), for the invite status on the User Access screen. Throws on any failure. */
export async function fetchDeliveryStatus(id, apiKey, { fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) throw new ResendError("RESEND_API_KEY is not configured", { transient: false });
  const response = await fetchImpl(`${RESEND_ENDPOINT}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: globalThis.AbortSignal.timeout(5_000) });
  if (!response.ok) throw new ResendError(`Resend responded ${response.status}`, { status: response.status, transient: isTransientStatus(response.status) });
  const body = await response.json();
  return deliveryStatus(body?.last_event);
}
