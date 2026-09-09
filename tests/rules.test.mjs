import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { getBytes, ref, uploadString, uploadBytes, updateMetadata, deleteObject, listAll } from "firebase/storage";

let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "uniqenergy-de71c",
    firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") },
    storage: { rules: await readFile(new URL("../storage.rules", import.meta.url), "utf8") },
  });
});
after(async () => environment?.cleanup());

test("Firestore denies every browser read and write", async () => {
  const anonymous = environment.unauthenticatedContext();
  const signedIn = environment.authenticatedContext("user-1", { email: "engineer@example.com" });
  await assertFails(getDoc(doc(anonymous.firestore(), "accounts/user-1")));
  await assertFails(setDoc(doc(signedIn.firestore(), "accounts/user-1"), { status: "active" }));
  await assertFails(getDoc(doc(signedIn.firestore(), "fluidlabUsage/user-1")));
});

test("Storage denies unrelated browser uploads and downloads", async () => {
  const signedIn = environment.authenticatedContext("user-1");
  const file = ref(signedIn.storage("gs://uniqenergy-de71c.firebasestorage.app"), "well-programs/test.txt");
  await assertFails(uploadString(file, "private well data"));
  await assertFails(getBytes(file));
});

const bucket = "gs://uniqenergy-de71c.firebasestorage.app";
const wellPath = (uid, id = "test") => `users/${uid}/well-viewer/${id}/original.zip`;
const recordPath = (uid, id = "test") => `users/${uid}/miniApps/well-viewer/wells/${id}`;
async function seed(uid, changes = {}, wellChanges = {}) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `users/${uid}`), { schemaVersion: 1, email: `${uid}@example.com`, role: "user", status: "active", enabledMiniApps: ["well-viewer"], ...changes });
    await setDoc(doc(context.firestore(), recordPath(uid)), { owner: uid, status: "uploading", sizeBytes: 3, cleanupAt: Timestamp.fromMillis(Date.now() + 60000), ...wellChanges });
  });
}
const client = (uid) => environment.authenticatedContext(uid, { email: `${uid}@example.com` }).storage(bucket);
const upload = (uid, id = "test", sdk = client(uid), size = 3) => uploadBytes(ref(sdk, wellPath(uid, id)), new Uint8Array(size), { contentType: "application/zip", customMetadata: { owner: uid, wellId: id } });

test("only a reserved owner upload succeeds; ready reads require current access", async () => {
  await seed("owner"); await seed("other-admin", { role: "admin" });
  await assertFails(upload("owner", "unreserved"));
  await assertFails(upload("owner", "test", client("other-admin")));
  await assertSucceeds(upload("owner"));
  const file = ref(client("owner"), wellPath("owner"));
  await assertFails(getBytes(file));
  await assertFails(upload("owner"));
  await assertFails(updateMetadata(file, { customMetadata: { owner: "other-admin" } }));
  await assertFails(deleteObject(file));
  await assertFails(listAll(ref(client("owner"), "users/owner/well-viewer")));
  await seed("owner", {}, { status: "ready" });
  await assertSucceeds(getBytes(file));
  await assertFails(getBytes(ref(client("other-admin"), wellPath("owner"))));
  await assertFails(getBytes(ref(environment.unauthenticatedContext().storage(bucket), wellPath("owner"))));
  await seed("owner", { enabledMiniApps: [] }, { status: "ready" });
  await assertFails(getBytes(file));
  await seed("owner", { role: "admin", status: "disabled" }, { status: "ready" });
  await assertFails(getBytes(file));
});

test("expired, wrong-size, disabled, and revoked uploads fail", async () => {
  await seed("expired", {}, { cleanupAt: Timestamp.fromMillis(0) }); await assertFails(upload("expired"));
  await seed("size"); await assertFails(upload("size", "test", client("size"), 4));
  await seed("disabled", { status: "disabled" }); await assertFails(upload("disabled"));
  await seed("revoked", { enabledMiniApps: [] }); await assertFails(upload("revoked"));
});
