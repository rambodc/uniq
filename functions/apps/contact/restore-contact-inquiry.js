import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireMiniApp } from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { db } from "../../core/firebase.js";
import { publicContactInquiry, validContactAction } from "./inbox.js";

export const restoreContactInquiry = onCall(callable, async (request) => {
  await requireMiniApp(request, "contact-form");
  const ref = db.collection("contactInquiries").doc(validContactAction(request.data)), snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.schemaVersion !== 1) throw new HttpsError("not-found", "Inquiry not found.");
  if (snapshot.data().archived !== true) throw new HttpsError("failed-precondition", "This inquiry is not archived.");
  await ref.update({ archived: FieldValue.delete(), archivedAt: FieldValue.delete(), archivedBy: FieldValue.delete() });
  const updated = await ref.get(); return { inquiry: publicContactInquiry(updated.id, updated.data()) };
});
