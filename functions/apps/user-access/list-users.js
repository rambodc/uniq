import { onCall } from "firebase-functions/v2/https";
import { publicUser, requireAdmin } from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { db } from "../../core/firebase.js";
import { invitations, publicInvitation } from "./helpers.js";
export const adminListUsers = onCall(callable, async (request) => { await requireAdmin(request); const [users, invites] = await Promise.all([db.collection("users").orderBy("email").limit(250).get(), invitations().orderBy("updatedAt", "desc").limit(100).get()]); return { users: users.docs.map((doc) => publicUser(doc.id, doc.data())), invitations: invites.docs.map((doc) => publicInvitation(doc.id, doc.data())) }; });
