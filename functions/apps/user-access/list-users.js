import { onCall } from "firebase-functions/v2/https";
import { callable } from "../../core/config.js";
import { db } from "../../core/firebase.js";
import { publicUser, requireAdmin } from "../../core/auth.js";
import { email } from "../../core/values.js";
export const adminListUsers = onCall(callable, async (request) => {
  await requireAdmin(request);
  let q = db.collection("users").orderBy("email").limit(50);
  if (request.data?.query)
    q = q.where("email", "==", email(request.data.query));
  if (request.data?.cursor) q = q.startAfter(email(request.data.cursor));
  const result = await q.get();
  return {
    users: result.docs.map((d) => publicUser(d.id, d.data())),
    cursor: result.size === 50 ? result.docs.at(-1).data().email : null,
  };
});
