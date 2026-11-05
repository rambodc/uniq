import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
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

test("Storage lets Inventory Bot staff read ticket PDFs and nobody write them", async () => {
  const bucketName = "uniqenergy-de71c.firebasestorage.app";
  const path = "inventoryBot/tickets/xpress/NK-004804.pdf";
  const mimPath = "inventoryBot/tickets/mim/DTAWEY011649.pdf";
  const staffRecord = { email: "ann@uniqenergy.com", firstName: "Ann", lastName: "Nguyen", type: "staff", miniApps: ["inventoryBot"], disabled: false };
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/ann"), staffRecord);
    await setDoc(doc(context.firestore(), "users/boss"), { ...staffRecord, email: "boss@uniqenergy.com", type: "super_admin", miniApps: [] });
    await setDoc(doc(context.firestore(), "users/other"), { ...staffRecord, email: "other@uniqenergy.com", miniApps: ["contact"] });
    await uploadBytes(ref(context.storage(`gs://${bucketName}`), path), new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    await uploadBytes(ref(context.storage(`gs://${bucketName}`), mimPath), new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  });
  const staff = environment.authenticatedContext("ann", { email: "ann@uniqenergy.com", email_verified: true });
  const boss = environment.authenticatedContext("boss", { email: "boss@uniqenergy.com", email_verified: true });
  const other = environment.authenticatedContext("other", { email: "other@uniqenergy.com", email_verified: true });
  const anon = environment.unauthenticatedContext();
  await getBytes(ref(staff.storage(`gs://${bucketName}`), path));
  await getBytes(ref(staff.storage(`gs://${bucketName}`), mimPath));
  await getBytes(ref(boss.storage(`gs://${bucketName}`), path));
  await assertFails(getBytes(ref(other.storage(`gs://${bucketName}`), path)));
  await assertFails(getBytes(ref(anon.storage(`gs://${bucketName}`), path)));
  await assertFails(uploadBytes(ref(staff.storage(`gs://${bucketName}`), path), new Uint8Array([1])));
  await assertFails(getBytes(ref(staff.storage(`gs://${bucketName}`), "inventoryBot/other/secret.pdf")));
});

test("Inventory Bot staff can read the Inventory Xpress count and nobody can write it", async () => {
  const staffRecord = { email: "ann@uniqenergy.com", firstName: "Ann", lastName: "Nguyen", type: "staff", miniApps: ["inventoryBot"], disabled: false };
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/ann"), staffRecord);
    await setDoc(doc(context.firestore(), "users/boss"), { ...staffRecord, email: "boss@uniqenergy.com", type: "super_admin", miniApps: [] });
    await setDoc(doc(context.firestore(), "users/other"), { ...staffRecord, email: "other@uniqenergy.com", miniApps: ["contact"] });
    await setDoc(doc(context.firestore(), "inventoryBot/main/meta/invXpress"), { version: 1, chunks: 1 });
    await setDoc(doc(context.firestore(), "inventoryBot/main/meta/invXpress/parts/0"), { index: 0, products: [] });
  });
  const staff = environment.authenticatedContext("ann", { email: "ann@uniqenergy.com", email_verified: true });
  const boss = environment.authenticatedContext("boss", { email: "boss@uniqenergy.com", email_verified: true });
  const other = environment.authenticatedContext("other", { email: "other@uniqenergy.com", email_verified: true });
  const anon = environment.unauthenticatedContext();
  await assertSucceeds(getDoc(doc(staff.firestore(), "inventoryBot/main/meta/invXpress")));
  await assertSucceeds(getDoc(doc(staff.firestore(), "inventoryBot/main/meta/invXpress/parts/0")));
  await assertSucceeds(getDoc(doc(boss.firestore(), "inventoryBot/main/meta/invXpress")));
  await assertFails(getDoc(doc(other.firestore(), "inventoryBot/main/meta/invXpress")));
  await assertFails(getDoc(doc(anon.firestore(), "inventoryBot/main/meta/invXpress")));
  await assertFails(setDoc(doc(staff.firestore(), "inventoryBot/main/meta/invXpress"), { version: 2 }));
  await assertFails(getDoc(doc(staff.firestore(), "inventoryBot/main/tickets/xpress_NK-1")));
});
