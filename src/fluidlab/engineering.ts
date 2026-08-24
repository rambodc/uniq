export type UnitSystem = "metric" | "imperial";
export type SectionCategory = "surface" | "intermediate" | "main";
export interface WellSection { id:string; category:SectionCategory; name:string; endMdM:number; endTvdM:number; diameterMm:number; color:string; visible:boolean }
export interface WellProject { version:2; name:string; unitSystem:UnitSystem; sections:WellSection[]; display:{selectedSectionId:string|null} }
export interface ProfilePoint { mdM:number; tvdM:number; horizontalM:number; sectionId:string }
export interface DerivedSection { sectionId:string; startMdM:number; endMdM:number; startTvdM:number; endTvdM:number; horizontalDisplacementM:number; capacityM3:number; points:ProfilePoint[] }
export interface GeneratedProject { points:ProfilePoint[]; sections:DerivedSection[]; errors:string[]; totalCapacityM3:number; totalHorizontalM:number }
const colors=["#35dfbd","#43aee8","#8a73e8","#f2b84b","#ef7d65"];
const uid=(prefix:string)=>`${prefix}-${globalThis.crypto?.randomUUID?.()??Math.random().toString(36).slice(2)}`;

export function createProject(unitSystem:UnitSystem="metric"):WellProject {
  const surface:WellSection={id:uid("section"),category:"surface",name:"Surface",endMdM:500,endTvdM:500,diameterMm:444.5,color:colors[0],visible:true};
  const main:WellSection={id:uid("section"),category:"main",name:"Main Hole",endMdM:2000,endTvdM:1700,diameterMm:215.9,color:colors[2],visible:true};
  return {version:2,name:"New conceptual well",unitSystem,sections:[surface,main],display:{selectedSectionId:surface.id}};
}
export function addIntermediateSection(project:WellProject){
  const index=project.sections.length-1, prior=project.sections[index-1], main=project.sections[index];
  const count=project.sections.filter(section=>section.category==="intermediate").length+1;
  const section:WellSection={id:uid("section"),category:"intermediate",name:`Intermediate ${count}`,endMdM:(prior.endMdM+main.endMdM)/2,endTvdM:(prior.endTvdM+main.endTvdM)/2,diameterMm:prior.diameterMm,color:colors[index%colors.length],visible:true};
  project.sections.splice(index,0,section); return section.id;
}
export function deleteIntermediateSection(project:WellProject,id:string){
  const index=project.sections.findIndex(section=>section.id===id&&section.category==="intermediate"); if(index<0)return false;
  project.sections.splice(index,1); if(project.display.selectedSectionId===id)project.display.selectedSectionId=project.sections[Math.max(0,index-1)]?.id??null; return true;
}
export function validateProject(project:WellProject):string[]{
  if(!project||project.version!==2||!Array.isArray(project.sections))return["Unsupported FluidLab project schema."];
  const errors:string[]=[]; if(typeof project.name!=="string"||!project.name.trim()||project.name.length>100)errors.push("Enter a valid project name.");
  if(!["metric","imperial"].includes(project.unitSystem))errors.push("Choose project units.");
  if(project.sections.length<2||project.sections.length>20)errors.push("Use between 2 and 20 hole sections.");
  if(project.sections[0]?.category!=="surface")errors.push("Surface must be the first section.");
  if(project.sections.at(-1)?.category!=="main")errors.push("Main Hole must be the final section.");
  if(project.sections.slice(1,-1).some(section=>section.category!=="intermediate"))errors.push("Only Intermediate sections may appear between Surface and Main Hole.");
  const ids=new Set<string>(); let priorMd=0,priorTvd=0;
  project.sections.forEach((section,index)=>{const label=section?.name?.trim()||`Section ${index+1}`;
    if(!section||typeof section.id!=="string"||ids.has(section.id))errors.push("Section IDs must be unique.");else ids.add(section.id);
    if(typeof section?.name!=="string"||!section.name.trim())errors.push(`Section ${index+1} needs a name.`);
    if(!Number.isFinite(section?.endMdM)||section.endMdM<=priorMd)errors.push(`${label}: end MD must be greater than ${priorMd}.`);
    if(!Number.isFinite(section?.endTvdM)||section.endTvdM<priorTvd)errors.push(`${label}: end TVD cannot be less than ${priorTvd}.`);
    if(Number.isFinite(section?.endMdM)&&Number.isFinite(section?.endTvdM)&&section.endTvdM-priorTvd>section.endMdM-priorMd+1e-8)errors.push(`${label}: TVD increase cannot exceed MD increase.`);
    if(!Number.isFinite(section?.diameterMm)||section.diameterMm<=0)errors.push(`${label}: enter a positive bit size.`);
    if(Number.isFinite(section?.endMdM))priorMd=section.endMdM;if(Number.isFinite(section?.endTvdM))priorTvd=section.endTvdM;
  }); return [...new Set(errors)];
}
function boundarySlopes(project:WellProject){
  const md=[0,...project.sections.map(section=>section.endMdM)],tvd=[0,...project.sections.map(section=>section.endTvdM)];
  const secants=md.slice(1).map((value,index)=>(tvd[index+1]-tvd[index])/(value-md[index])); const slopes=new Array(md.length).fill(0);
  slopes[0]=secants[0];slopes[slopes.length-1]=secants.at(-1);for(let index=1;index<slopes.length-1;index++){const before=secants[index-1],after=secants[index];slopes[index]=before===0||after===0?0:(2*before*after)/(before+after)}
  return slopes.map(value=>Math.max(0,Math.min(1,value)));
}
function hermite(z0:number,z1:number,m0:number,m1:number,length:number,t:number){const t2=t*t,t3=t2*t;return{value:(2*t3-3*t2+1)*z0+(t3-2*t2+t)*length*m0+(-2*t3+3*t2)*z1+(t3-t2)*length*m1,derivative:Math.max(0,Math.min(1,((6*t2-6*t)*z0+(3*t2-4*t+1)*length*m0+(-6*t2+6*t)*z1+(3*t2-2*t)*length*m1)/length))}}
export function generateProject(project:WellProject):GeneratedProject{
  const errors=validateProject(project);if(errors.length)return{points:[],sections:[],errors,totalCapacityM3:0,totalHorizontalM:0};
  const slopes=boundarySlopes(project),sections:DerivedSection[]=[],points:ProfilePoint[]=[];let startMd=0,startTvd=0,horizontal=0,totalCapacityM3=0;
  project.sections.forEach((section,index)=>{const length=section.endMdM-startMd,samples=Math.max(16,Math.ceil(length/25)),sectionPoints:ProfilePoint[]=[];let priorDerivative=slopes[index];
    for(let sample=0;sample<=samples;sample++){const t=sample/samples,curve=hermite(startTvd,section.endTvdM,slopes[index],slopes[index+1],length,t);if(sample>0){const step=length/samples;horizontal+=step*(Math.sqrt(Math.max(0,1-priorDerivative**2))+Math.sqrt(Math.max(0,1-curve.derivative**2)))/2}const point={mdM:startMd+length*t,tvdM:sample===samples?section.endTvdM:curve.value,horizontalM:horizontal,sectionId:section.id};sectionPoints.push(point);if(!points.length||sample>0)points.push(point);priorDerivative=curve.derivative}
    const capacityM3=Math.PI*(section.diameterMm/1000)**2/4*length;totalCapacityM3+=capacityM3;sections.push({sectionId:section.id,startMdM:startMd,endMdM:section.endMdM,startTvdM:startTvd,endTvdM:section.endTvdM,horizontalDisplacementM:sectionPoints.at(-1)!.horizontalM-sectionPoints[0].horizontalM,capacityM3,points:sectionPoints});startMd=section.endMdM;startTvd=section.endTvdM;
  });return{points,sections,errors:[],totalCapacityM3,totalHorizontalM:horizontal};
}
export const cubicMetresToBbl=(value:number)=>value*6.28981077;
