import { initializeApp } from "firebase-admin/app";
import { FieldPath,FieldValue,getFirestore } from "firebase-admin/firestore";

initializeApp();
const db=getFirestore();
const users=await db.collection("fluidlabUsers").get();
let projects=0;
for(const user of users.docs){
  const snapshots=await user.ref.collection("projects").get();
  for(const project of snapshots.docs){await db.recursiveDelete(project.ref);projects++;}
}
const day=new Date().toISOString().slice(0,10),usage=await db.collectionGroup("days").where(FieldPath.documentId(),"==",day).get();
if(usage){const writer=db.bulkWriter();for(const doc of usage.docs)writer.set(doc.ref,{analyses:0,pendingAnalyses:0,updatedAt:FieldValue.serverTimestamp()},{merge:true});await writer.close();}
console.log(JSON.stringify({users:users.size,projectsDeleted:projects,analysisUsageReset:usage?.size??0,day}));
