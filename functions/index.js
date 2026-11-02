import { onCall } from "firebase-functions/v2/https";
import { contactNotifyEmail, db, callable, requireMiniApp, resendApiKey, resolveAccess, text } from "./core.js";
import { publicInquiry, validateInquiry, visibleInquiries } from "./contact.js";
import { sendInquiryNotification } from "./mailer.js";

export const submitContactInquiry = onCall({ ...callable, secrets: [resendApiKey] }, async (request) => {
  const inquiry = validateInquiry(request.data);
  const ref = db.collection("contactInquiries").doc();
  await ref.set(inquiry);
  let notificationSent = false;
  try {
    await sendInquiryNotification({ ...inquiry, notificationTimestamp: new Date().toISOString() }, resendApiKey.value(), { inquiryId: ref.id, to: contactNotifyEmail.value() });
    notificationSent = true;
  } catch (error) {
    globalThis.console.error("Inquiry email notification failed", error instanceof Error ? error.message : error);
  }
  return { success: true, inquiryId: ref.id, notificationSent };
});

export const listContactInquiries = onCall(callable, async (request) => {
  await requireMiniApp(request, "contact");
  const archived = request.data?.archived === true;
  const query = typeof request.data?.query === "string" ? request.data.query : "";
  const snapshot = await db.collection("contactInquiries").orderBy("createdAt", "desc").limit(500).get();
  const inquiries = visibleInquiries(snapshot.docs.map((doc) => publicInquiry(doc.id, doc.data())), { archived, query });
  return { inquiries, total: inquiries.length, nextCursor: null };
});

export const archiveContactInquiry = onCall(callable, async (request) => {
  await requireMiniApp(request, "contact");
  const id = text(request.data?.inquiryId, "inquiry", 100);
  await db.collection("contactInquiries").doc(id).update({ archived: true });
  return { success: true };
});

export const restoreContactInquiry = onCall(callable, async (request) => {
  await requireMiniApp(request, "contact");
  const id = text(request.data?.inquiryId, "inquiry", 100);
  await db.collection("contactInquiries").doc(id).update({ archived: false });
  return { success: true };
});

/** What the signed-in account may open (its type and the mini app ids from miniApps.js) and who it is.
 * type is null and profile is null without access. */
export const getAccess = onCall(callable, async (request) => {
  const access = await resolveAccess(request);
  return { type: access?.type ?? null, miniApps: access?.miniApps ?? [], profile: access?.profile ?? null };
});

export * from "./profile-functions.js";
export * from "./users-functions.js";
export * from "./inventory-functions.js";
