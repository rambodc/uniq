import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
initializeApp({projectId:"uniqenergy-de71c"});
const db=getFirestore(),confirmed=process.argv.includes("--confirm");
let projectsFound=0,versionsFound=0;const targets=[];
for(const user of(await db.collection("fluidlabUsers").get()).docs){for(const project of(await user.ref.collection("projects").get()).docs){const versions=(await project.ref.collection("versions").get()).docs;projectsFound++;versionsFound+=versions.length;targets.push({project,versions})}}
console.log(JSON.stringify({mode:confirmed?"delete":"dry-run",projectsFound,versionsFound}));
if(!confirmed){console.log("Dry run only. Re-run with --confirm after verifying the project and counts.");process.exit(0)}
for(const{project,versions}of targets){const writer=db.bulkWriter();for(const version of versions)writer.delete(version.ref);writer.delete(project.ref);await writer.close()}
let projectsRemaining=0,versionsRemaining=0;for(const user of(await db.collection("fluidlabUsers").get()).docs){for(const project of(await user.ref.collection("projects").get()).docs){projectsRemaining++;versionsRemaining+=(await project.ref.collection("versions").get()).size}}
console.log(JSON.stringify({projectsDeleted:projectsFound,versionsDeleted:versionsFound,projectsRemaining,versionsRemaining}));if(projectsRemaining||versionsRemaining)process.exitCode=1;
