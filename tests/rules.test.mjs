import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadString } from "firebase/storage";

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
  await assertFails(getDoc(doc(anonymous.firestore(), "fluidlabUsers/user-1")));
  await assertFails(setDoc(doc(signedIn.firestore(), "fluidlabUsers/user-1"), { status: "active" }));
  await assertFails(getDoc(doc(signedIn.firestore(), "fluidlabUsage/user-1")));
});

test("Storage denies every browser upload and download", async () => {
  const signedIn = environment.authenticatedContext("user-1");
  const file = ref(signedIn.storage("gs://uniqenergy-de71c.firebasestorage.app"), "well-programs/test.txt");
  await assertFails(uploadString(file, "private well data"));
  await assertFails(getBytes(file));
});
