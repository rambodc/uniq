import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ projectId: "uniqenergy-de71c" });
const db = getFirestore();
let projectsDeleted = 0;
let versionsDeleted = 0;

for (const user of (await db.collection("fluidlabUsers").get()).docs) {
  const projects = await user.ref.collection("projects").get();
  for (const project of projects.docs) {
    const versions = await project.ref.collection("versions").get();
    const writer = db.bulkWriter();
    for (const version of versions.docs) {
      writer.delete(version.ref);
      versionsDeleted++;
    }
    writer.delete(project.ref);
    projectsDeleted++;
    await writer.close();
  }
}

console.log(JSON.stringify({ projectsDeleted, versionsDeleted }));
