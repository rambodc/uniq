import { requireAvailable } from "../../core/auth.js";
import { FieldValue } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { callable } from "../../core/config.js";
import { db } from "../../core/firebase.js";
import { validContactInquiry } from "./validation.js";
export const submitContactInquiry = onCall(callable, async (request) => { await requireAvailable(); const inquiry = validContactInquiry(request.data), ref = db.collection("contactInquiries").doc(); await ref.set({ schemaVersion: 1, ...inquiry, status: "new", source: "public-contact", createdAt: FieldValue.serverTimestamp() }); return { success: true, inquiryId: ref.id }; });
