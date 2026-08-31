import { onCall } from "firebase-functions/v2/https";
import { requireMiniApp } from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { db } from "../../core/firebase.js";
import { filterContactInquiries, publicContactInquiry, validContactListRequest } from "./inbox.js";

export const listContactInquiries = onCall(callable, async (request) => {
  await requireMiniApp(request, "contact-form");
  const options = validContactListRequest(request.data), snapshot = await db.collection("contactInquiries").orderBy("createdAt", "desc").limit(501).get();
  const limited = snapshot.size > 500, inquiries = snapshot.docs.slice(0, 500).filter((doc) => doc.data()?.schemaVersion === 1).map((doc) => publicContactInquiry(doc.id, doc.data()));
  return { ...filterContactInquiries(inquiries, options), limited };
});
