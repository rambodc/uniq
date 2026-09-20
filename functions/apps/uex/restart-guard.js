// Temporary release guard, removed after the one-time restart completes.
import { db } from "../../core/firebase.js";
import { HttpsError } from "firebase-functions/v2/https";
export async function requireUexReady() {
  if ((await db.doc("operations/uexRestart20260920").get()).data()?.blocked)
    throw new HttpsError(
      "unavailable",
      "UEX is being refreshed. Please try again shortly.",
    );
}
