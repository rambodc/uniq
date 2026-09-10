import assert from "node:assert/strict";
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
const client = (uid) => environment.authenticatedContext(uid, { email: `${uid}@example.com` }).storage(bucket);

async function seedFluid(uid,changes={},jobChanges={}) {
  await environment.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),`users/${uid}`),{schemaVersion:1,email:`${uid}@example.com`,role:"user",status:"active",enabledMiniApps:["fluidlab"],...changes});
    await setDoc(doc(context.firestore(),`fluidWells/well/imports/${uid}`),{owner:uid,wellId:"well",status:"uploading",expiresAt:Timestamp.fromMillis(Date.now()+60000),files:[{size:3}],...jobChanges});
  });
}
const fluidUpload=(uid,sdk=client(uid),suffix="0",size=3)=>uploadBytes(ref(sdk,`fluidlab/well/imports/${uid}/${suffix}`),new Uint8Array(size),{contentType:"application/octet-stream",customMetadata:{importId:uid,wellId:"well"}});
test("FluidLab original uploads require the active owner's exact reservation",async()=>{
  await seedFluid("fluid-owner");await seedFluid("fluid-other",{role:"admin"});
  await assertFails(fluidUpload("fluid-owner",client("fluid-other")));
  await assertFails(fluidUpload("fluid-owner",client("fluid-owner"),"1"));
  await assertFails(fluidUpload("fluid-owner",client("fluid-owner"),"0",4));
  await assertSucceeds(fluidUpload("fluid-owner"));
  await assertFails(fluidUpload("fluid-owner"));
  const original=ref(client("fluid-owner"),"fluidlab/well/imports/fluid-owner/0");
  await assertFails(getBytes(original));await assertFails(deleteObject(original));await assertFails(updateMetadata(original,{customMetadata:{wellId:"other"}}));
  await assertFails(uploadString(ref(client("fluid-owner"),"fluidlab/well/versions/fake.json"),"{}"));
});
test("FluidLab revoked, disabled, expired and processing imports deny uploads",async()=>{
  for(const [uid,user,job]of [["fluid-revoked",{enabledMiniApps:[]},{}],["fluid-disabled",{status:"disabled"},{}],["fluid-expired",{},{expiresAt:Timestamp.fromMillis(0)}],["fluid-processing",{},{status:"processing"}]]){await seedFluid(uid,user,job);await assertFails(fluidUpload(uid));}
});

test("shared Pason ZIP rules: exact reservation owner, active attachment reads, revocation and no direct mutation",async()=>{
 const owner="pason-owner",other="pason-other",denied="pason-denied";
 for(const uid of [owner,other,denied])await seedFluid(uid,uid===denied?{enabledMiniApps:[]}:{});
 await environment.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),"fluidWells/pason-well"),{status:"ready"});await setDoc(doc(c.firestore(),"fluidWells/pason-well/pasonUploads/first"),{status:"uploading",owner,sizeBytes:3,expiresAt:Timestamp.fromMillis(Date.now()+60000)});});
 const path="fluidlab/pason-well/pason/first/original.zip",send=(uid,size=3)=>uploadBytes(ref(client(uid),path),new Uint8Array(size),{contentType:"application/zip",customMetadata:{owner:uid,wellId:"pason-well"}});
 await assertFails(send(other));await assertFails(send(denied));await assertFails(send(owner,4));await assertSucceeds(send(owner));await assertFails(getBytes(ref(client(other),path)));
 await environment.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),"fluidWells/pason-well"),{status:"ready",pason:{id:"first"}});});
 await assertSucceeds(getBytes(ref(client(other),path)));await assertFails(getBytes(ref(client(denied),path)));await assertFails(send(owner));await assertFails(deleteObject(ref(client(other),path)));await assertFails(listAll(ref(client(other),"fluidlab/pason-well/pason")));
 await environment.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),"fluidWells/pason-well"),{status:"ready",pason:{id:"replacement"}});});await assertFails(getBytes(ref(client(owner),path)));
});

test("Pason Storage permissions stay within the production two-document lookup budget",async()=>{
  const rules=await readFile(new URL("../storage.rules",import.meta.url),"utf8");
  const helpers=new Map([...rules.matchAll(/function (\w+)\([^)]*\)\s*\{([\s\S]*?)\}/g)].map(m=>[m[1],m[2]]));
  const pason=rules.slice(rules.indexOf("match /fluidlab/{wellId}/pason/"));
  for(const action of ["get","create"]){
    const expression=pason.match(new RegExp("allow "+action+": if([\\s\\S]*?);"))[1];
    const paths=new Set(),visited=new Set();
    const visit=body=>{for(const m of body.matchAll(/firestore\.get\(([\s\S]*?)\)\.data/g))paths.add(m[1]);for(const m of body.matchAll(/\b(\w+)\(/g)){if(helpers.has(m[1])&&!visited.has(m[1])){visited.add(m[1]);visit(helpers.get(m[1]));}}};
    visit(expression);assert.ok(paths.size>0&&paths.size<=2,`${action} reads ${paths.size} distinct Firestore documents; Storage permits at most 2`);
  }
});

test("cancelled and expired Pason reservations deny bytes even while the well exists",async()=>{
 const owner="pason-cancel-owner";await seedFluid(owner);
 for(const [id,status,expiresAt]of [["cancelled","cancelled",Timestamp.fromMillis(Date.now()+60000)],["expired","uploading",Timestamp.fromMillis(0)]]){
  await environment.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),"fluidWells/pason-cancel"),{status:"ready"});await setDoc(doc(c.firestore(),`fluidWells/pason-cancel/pasonUploads/${id}`),{owner,status,sizeBytes:3,expiresAt});});
  await assertFails(uploadBytes(ref(client(owner),`fluidlab/pason-cancel/pason/${id}/original.zip`),new Uint8Array(3),{contentType:"application/zip",customMetadata:{owner,wellId:"pason-cancel"}}));
 }
});
