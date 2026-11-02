import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes, uploadString } from "firebase/storage";

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
  const signedIn = environment.authenticatedContext("user-1", { email: "person@example.com", email_verified: true });
  await assertFails(getDoc(doc(anonymous.firestore(), "users/user-1")));
  await assertFails(setDoc(doc(signedIn.firestore(), "users/user-1"), { type: "super_admin" }));
  await assertFails(getDoc(doc(signedIn.firestore(), "contactInquiries/one")));
  await assertFails(setDoc(doc(signedIn.firestore(), "contactInquiries/one"), { message: "hello" }));
});

test("Storage denies fluidlab, profile photos, and every other browser path", async () => {
  const signedIn = environment.authenticatedContext("user-1", { email: "person@example.com", email_verified: true });
  const bucket = signedIn.storage("gs://uniqenergy-de71c.firebasestorage.app");
  const fluid = ref(bucket, "fluidlab/well/imports/job/0");
  await assertFails(uploadBytes(fluid, new Uint8Array([1, 2, 3]), { contentType: "application/octet-stream" }));
  await assertFails(getBytes(fluid));
  const photo = ref(bucket, "profile-photos/user-1/avatar.jpg");
  await assertFails(uploadString(photo, "photo"));
  await assertFails(getBytes(photo));
  await assertFails(uploadString(ref(bucket, "well-programs/test.txt"), "private"));
});
