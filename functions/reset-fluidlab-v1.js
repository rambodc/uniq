import { initializeApp } from "firebase-admin/app";
import { FieldValue,getFirestore } from "firebase-admin/firestore";

initializeApp();
const db=getFirestore();
const users=await db.collection("fluidlabUsers").get();
let projects=0;
for(const user of users.docs){
  const snapshots=await user.ref.collection("projects").get();
  for(const project of snapshots.docs){await db.recursiveDelete(project.ref);projects++;}
}
const day=new Date().toISOString().slice(0,10),usageOwners=await db.collection("fluidlabUsage").listDocuments(),writer=db.bulkWriter();
for(const owner of usageOwners)writer.set(owner.collection("days").doc(day),{analyses:0,pendingAnalyses:0,updatedAt:FieldValue.serverTimestamp()},{merge:true});
await writer.close();
console.log(JSON.stringify({users:users.size,projectsDeleted:projects,analysisUsageReset:usageOwners.length,day}));
