import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useReducedMotion } from "motion/react";
import { Bot, Box, Crosshair, FileUp, LogIn, LogOut, PanelLeftClose, PanelLeftOpen, PanelRight, PanelTop, RotateCcw, Send, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import { auth } from "../firebaseClient";
import { analyzeWellFile, getProfile, refineWellDraft, type AIExtractionResult, type FluidLabProfile, type QuotaStatus } from "./ai";
import { consultationMailto, createPreset, displayDistance, feetToMetres, generateWell, inchesToMm, metresToFeet, mmToInches, parseDesign, serializeDesign, type HoleSection, type MainTrajectory, type UnitSystem, type WellDesign, type WellType } from "./model";
import "./fluidlab.css";

const WellboreScene = lazy(() => import("./WellboreScene"));
type ViewName = "overview" | "side" | "top" | "target";
type Mode = "assistant" | "review";
type SaveState = "clean" | "dirty" | "exported";
type ExitKind = "home" | "browser";
const cameraTools: { id: ViewName | "reset"; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: Box }, { id: "side", label: "Side view", icon: PanelRight }, { id: "top", label: "Top view", icon: PanelTop }, { id: "target", label: "Target view", icon: Crosshair }, { id: "reset", label: "Reset camera", icon: RotateCcw },
];
const accepted = ".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt,.csv,.tsv,.xls,.xlsx";
const readShared = () => { const payload = new URLSearchParams(location.search).get("design"); return payload ? parseDesign(payload) : null; };
const supportsWebGL = () => { try { const canvas = document.createElement("canvas"); return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")); } catch { return false; } };
const toDisplay = (metres: number, units: UnitSystem) => units === "metric" ? metres : metresToFeet(metres);
const fromDisplay = (value: number, units: UnitSystem) => units === "metric" ? value : feetToMetres(value);
const lengthUnit = (units: UnitSystem) => units === "metric" ? "m" : "ft";

function NumberField({ label, value, unit, step = 1, min = 0, max, onChange, disabled = false }: { label: string; value: number; unit: string; step?: number; min?: number; max?: number; onChange: (value: number) => void; disabled?: boolean }) {
  return <label className="number-field"><span>{label}</span><div><input type="number" value={Number.isInteger(value) ? value : Number(value.toFixed(2))} step={step} min={min} max={max} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))}/><small>{unit}</small></div></label>;
}
function PanelSection({ title, children }: { title: string; children: ReactNode }) { return <section className="editor-section"><h2>{title}</h2>{children}</section>; }
function StaticWellbore({ type }: { type: WellType }) { return <div className={`static-builder-well ${type}`} role="img" aria-label={`Static diagram of a ${type} wellbore`}><div className="static-layers"/><div className="static-main"/><span>Interactive 3D requires WebGL</span></div>; }
function aiToDesign(result: AIExtractionResult, current: WellDesign): WellDesign {
  const draft = result.draft, type = draft.type.value ?? (current.type === "vertical" ? "vertical" : "horizontal"), units = draft.units.value ?? current.units;
  const next = createPreset(type); next.units = units; next.name = draft.name.value || next.name;
  const length = (value: number | null) => value == null ? null : fromDisplay(value, units);
  if (type === "vertical") { const total = length(draft.totalDepth.value); if (total != null) next.main.verticalSection = total; }
  else {
    const kickoff = length(draft.kickoffMd.value), lateral = length(draft.lateralLength.value);
    if (kickoff != null) next.main.kickoffMd = kickoff;
    if (lateral != null) next.main.lateralLength = lateral;
    if (draft.azimuth.value != null) next.main.azimuth = draft.azimuth.value;
    if (draft.buildRate.value != null) next.main.buildRate = units === "metric" ? draft.buildRate.value : draft.buildRate.value / 1.016;
  }
  const sections = draft.sections.filter((section) => section.diameter != null && section.startMd != null && section.endMd != null).map((section,index): HoleSection => ({ id: `section-${index+1}`, name: section.name || `Hole section ${index+1}`, diameterMm: units === "metric" ? section.diameter! : inchesToMm(section.diameter!), startMd: length(section.startMd!)!, endMd: length(section.endMd!)!, color: ["#39dcb9","#43aee8","#866ee8"][index], visible: true }));
  if (sections.length) next.sections = sections;
  return next;
}

export default function FluidLab({ onHome, onAuth, onDirtyChange, exitRequest, onConfirmBrowserExit }: { onHome: (section?: string) => void; onAuth: (path: string) => void; onDirtyChange: (dirty: boolean) => void; exitRequest: number; onConfirmBrowserExit: () => void }) {
  const shared = useRef(readShared());
  const [design, setDesign] = useState<WellDesign>(() => shared.current ?? createPreset("horizontal"));
  const [lastValid, setLastValid] = useState<WellDesign>(() => shared.current ?? createPreset("horizontal"));
  const [mode, setMode] = useState<Mode>("assistant");
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => matchMedia("(max-width: 800px)").matches);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<FluidLabProfile | null>(null);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AIExtractionResult | null>(null);
  const [chat, setChat] = useState<{ role: "assistant" | "user"; text: string }[]>([{ role: "assistant", text: "Upload one well program or field image. I’ll extract only supported vertical or horizontal planning values and show every uncertainty before building." }]);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [aiError, setAiError] = useState("");
  const [view, setView] = useState<ViewName>("overview");
  const [reset, setReset] = useState(0);
  const [visible, setVisible] = useState(!document.hidden);
  const [webgl] = useState(supportsWebGL);
  const [copied, setCopied] = useState(false);
  const [exitKind, setExitKind] = useState<ExitKind | null>(null);
  const [notice, setNotice] = useState(() => new URLSearchParams(location.search).has("design") && !shared.current ? "Invalid shared design. A default horizontal well was loaded." : "");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const reducedMotion = Boolean(useReducedMotion());
  const lowPower = innerWidth < 760 || (navigator.hardwareConcurrency ?? 8) <= 4;
  const generated = useMemo(() => generateWell(design), [design]);
  const rendered = useMemo(() => generateWell(lastValid), [lastValid]);
  const errors = generated.errors;
  const dirty = saveState === "dirty";

  useEffect(() => onAuthStateChanged(auth, (account) => {
    setUser(account); setProfile(null); setQuota(null);
    if (!account) { setAuthReady(true); return; }
    void getProfile().then((result) => { setProfile(result.profile); setQuota(result.quota); }).catch((error) => {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code.includes("failed-precondition") || code.includes("not-found")) onAuth(`/signup?complete=1&email=${encodeURIComponent(account.email ?? "")}`);
      else setAiError(code.includes("permission-denied") ? "This FluidLab account is disabled. Contact UniqEnergy for access." : "Your account status could not be loaded.");
    }).finally(() => setAuthReady(true));
  }), [onAuth]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { const unload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } }; addEventListener("beforeunload", unload); return () => removeEventListener("beforeunload", unload); }, [dirty]);
  useEffect(() => { document.body.classList.add("fluidlab-active"); document.title = "AI 3D Wellbore Builder | UniqEnergy FluidLab"; return () => document.body.classList.remove("fluidlab-active"); }, []);
  useEffect(() => { const media = matchMedia("(max-width: 800px)"), resize = () => { setIsMobile(media.matches); if (!media.matches) setDrawerOpen(false); }, visibility = () => setVisible(!document.hidden); media.addEventListener("change", resize); document.addEventListener("visibilitychange", visibility); return () => { media.removeEventListener("change", resize); document.removeEventListener("visibilitychange", visibility); }; }, []);
  useEffect(() => { if (exitRequest > 0) setExitKind("browser"); }, [exitRequest]);
  useEffect(() => {
    if (!drawerOpen || !isMobile) return; const drawer = drawerRef.current; if (!drawer) return;
    const focusable = () => [...drawer.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]; focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") { setDrawerOpen(false); menuRef.current?.focus(); return; } if (event.key !== "Tab") return; const items=focusable(),first=items[0],last=items.at(-1); if (!first||!last) return; if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();} }; addEventListener("keydown",keydown); return()=>removeEventListener("keydown",keydown);
  }, [drawerOpen,isMobile]);

  const edit = (next: WellDesign) => { setDesign(next); setSaveState("dirty"); };
  const updateMain = (key: keyof MainTrajectory, value: number) => { const next=structuredClone(design); (next.main[key] as number)=value; edit(next); };
  const loadType = (type: "vertical"|"horizontal") => { const next=createPreset(type); next.units=design.units; edit(next); };
  const updateSection = (index:number, patch:Partial<HoleSection>) => { const next=structuredClone(design); next.sections[index]={...next.sections[index],...patch}; edit(next); };
  const buildModel = () => { if (errors.length) return; setLastValid(structuredClone(design)); setReset((value)=>value+1); setNotice("3D well rebuilt from the confirmed values."); };
  const analyzeFile = async () => { if (!file) return; setWorking(true); setAiError(""); try { const result=await analyzeWellFile(file); setAnalysis(result); setQuota(result.quota); setDesign(aiToDesign(result,design)); setSaveState("dirty"); setChat((items)=>[...items,{role:"assistant",text:result.assistantMessage}]); setMode("review"); } catch(error) { const code=typeof error==="object"&&error&&"code" in error?String(error.code):""; setAiError(code.includes("resource-exhausted")?"Your daily document-analysis limit has been reached. It resets at midnight UTC.":error instanceof Error?error.message:"Analysis failed."); } finally { setWorking(false); } };
  const sendMessage = async () => { if (!analysis||!message.trim()||working) return; const text=message.trim(); setMessage(""); setChat((items)=>[...items,{role:"user",text}]); setWorking(true); setAiError(""); try { const result=await refineWellDraft(analysis.draft,text); setAnalysis(result); setQuota(result.quota); setDesign(aiToDesign(result,design)); setSaveState("dirty"); setChat((items)=>[...items,{role:"assistant",text:result.assistantMessage}]); } catch(error) { const code=typeof error==="object"&&error&&"code" in error?String(error.code):""; setAiError(code.includes("resource-exhausted")?"Your daily AI chat limit has been reached. It resets at midnight UTC.":error instanceof Error?error.message:"Correction failed."); } finally { setWorking(false); } };
  const shareUrl = `${location.origin}/fluidlab?design=${serializeDesign(design)}`;
  const copyShare = async () => { if(errors.length)return false; await navigator.clipboard.writeText(shareUrl); history.replaceState({},"",new URL(shareUrl).pathname+new URL(shareUrl).search); setCopied(true);setSaveState("exported");setTimeout(()=>setCopied(false),1800);return true; };
  const exportPng = () => { const source=canvasRef.current;if(!source||errors.length)return false;const output=document.createElement("canvas");output.width=1600;output.height=1050;const context=output.getContext("2d");if(!context)return false;context.fillStyle="#03131d";context.fillRect(0,0,1600,1050);context.drawImage(source,0,0,1600,820);context.fillStyle="#f4fbff";context.font="700 34px system-ui";context.fillText(design.name,60,885);context.fillStyle="#20e4bd";context.font="600 18px system-ui";context.fillText(`${design.type} · ${displayDistance(rendered.summary.totalMd,design.units)} MD`,60,925);context.fillStyle="#839ca8";context.font="15px system-ui";context.fillText("FluidLab planning visualization — not a directional survey record",60,980);const link=document.createElement("a");link.download=`${design.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")||"wellbore"}.png`;link.href=output.toDataURL("image/png");link.click();setSaveState("exported");return true; };
  const requestHome=()=>dirty?setExitKind("home"):onHome(); const completeExit=()=>{setSaveState("clean");onDirtyChange(false);if(exitKind==="browser")onConfirmBrowserExit();else onHome();setExitKind(null);}; const copyAndExit=async()=>{if(await copyShare())completeExit();};

  const assistant = <div className="ai-workflow">
    {!authReady ? <div className="ai-empty">Checking access…</div> : !user ? <div className="signin-card"><Sparkles/><span>FluidLab AI access</span><h2>Build from a well program</h2><p>Create an account or sign in with email to analyze a document or field image. Files are processed temporarily and are not saved by FluidLab.</p><button onClick={()=>onAuth("/signin?returnTo=/fluidlab")}><LogIn/> Sign in with email</button><button className="signin-secondary" onClick={()=>onAuth("/signup")}><UserRound/> Create account</button></div> : profile?.status === "disabled" ? <div className="signin-card"><Sparkles/><span>Account disabled</span><h2>FluidLab access is paused.</h2><p>Contact UniqEnergy if you believe this account should be active.</p><button onClick={()=>signOut(auth)}><LogOut/> Sign out</button></div> : <>
      <div className="account-row"><span><b>{profile ? `${profile.firstName} ${profile.lastName}` : user.email}</b>{quota && <small>{quota.analysesRemaining} files · {quota.refinementsRemaining} chats remaining today</small>}</span><button onClick={()=>signOut(auth)} aria-label="Sign out"><LogOut/></button></div>
      <label className="upload-zone"><input type="file" accept={accepted} onChange={(event)=>setFile(event.target.files?.[0]??null)}/><FileUp/><strong>{file?file.name:"Choose one well-program file"}</strong><span>PDF, image, Word, CSV or Excel · 15 MB maximum</span></label>
      <button className="ai-primary" disabled={!file||working} onClick={analyzeFile}>{working?<i/>:<Bot/>}{working?"Analyzing evidence…":"Extract well details"}</button>
      <div className="chat-feed" aria-live="polite">{chat.map((item,index)=><article className={item.role} key={index}><span>{item.role==="assistant"?<Bot/>:user.email?.slice(0,1)}</span><p>{item.text}</p></article>)}</div>
      {analysis&&<div className="chat-compose"><textarea value={message} maxLength={2000} placeholder="Answer a question or correct a value…" onChange={(event)=>setMessage(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void sendMessage();}}}/><button disabled={!message.trim()||working} onClick={sendMessage} aria-label="Send correction"><Send/></button></div>}
      {aiError&&<div className="validation-box" role="alert">{aiError}</div>}
    </>}
  </div>;

  const review = <div className="editor-content simplified-review">
    {analysis&&<div className="extraction-status"><div><Sparkles/><strong>AI draft</strong><span>{analysis.missingFields.length} missing · {analysis.conflicts.length} conflicts</span></div>{[...analysis.conflicts,...analysis.warnings].map((warning)=><p key={warning}>{warning}</p>)}</div>}
    {errors.length>0&&<div className="validation-box" role="alert"><b>Fix before rebuilding</b><ul>{errors.map((error)=><li key={error}>{error}</li>)}</ul></div>}
    <PanelSection title="Well basics"><label className="text-field"><span>Well name</span><input value={design.name} onChange={(event)=>edit({...design,name:event.target.value})}/></label><div className="type-grid"><button className={design.type==="vertical"?"active":""} onClick={()=>loadType("vertical")}>Vertical</button><button className={design.type==="horizontal"?"active":""} onClick={()=>loadType("horizontal")}>Horizontal</button></div><div className="unit-toggle"><button className={design.units==="metric"?"active":""} onClick={()=>edit({...design,units:"metric"})}>Metric</button><button className={design.units==="imperial"?"active":""} onClick={()=>edit({...design,units:"imperial"})}>Imperial</button></div></PanelSection>
    <PanelSection title={design.type==="vertical"?"Vertical depth":"Horizontal trajectory"}><div className="control-grid">{design.type==="vertical"?<NumberField label="Total depth" value={toDisplay(design.main.verticalSection,design.units)} unit={lengthUnit(design.units)} min={100} onChange={(value)=>updateMain("verticalSection",fromDisplay(value,design.units))}/>:<><NumberField label="Kickoff MD" value={toDisplay(design.main.kickoffMd,design.units)} unit={lengthUnit(design.units)} min={100} onChange={(value)=>updateMain("kickoffMd",fromDisplay(value,design.units))}/><NumberField label="Build rate" value={design.units==="metric"?design.main.buildRate:design.main.buildRate*1.016} unit={design.units==="metric"?"°/30m":"°/100ft"} step={.1} min={.1} max={20} onChange={(value)=>updateMain("buildRate",design.units==="metric"?value:value/1.016)}/><NumberField label="Azimuth" value={design.main.azimuth} unit="°" max={359.99} onChange={(value)=>updateMain("azimuth",value)}/><NumberField label="Lateral length" value={toDisplay(design.main.lateralLength,design.units)} unit={lengthUnit(design.units)} onChange={(value)=>updateMain("lateralLength",fromDisplay(value,design.units))}/></>}</div></PanelSection>
    <PanelSection title="Hole sections"><div className="section-editor">{design.sections.map((section,index)=><fieldset key={section.id}><legend><input type="color" value={section.color} onChange={(event)=>updateSection(index,{color:event.target.value})}/><input value={section.name} aria-label={`Section ${index+1} name`} onChange={(event)=>updateSection(index,{name:event.target.value})}/><label><input type="checkbox" checked={section.visible} onChange={(event)=>updateSection(index,{visible:event.target.checked})}/>Show</label></legend><NumberField label="Bit diameter" value={design.units==="metric"?section.diameterMm:mmToInches(section.diameterMm)} unit={design.units==="metric"?"mm":"in"} step={.1} onChange={(value)=>updateSection(index,{diameterMm:design.units==="metric"?value:inchesToMm(value)})}/><NumberField label="Start MD" value={toDisplay(section.startMd,design.units)} unit={lengthUnit(design.units)} onChange={(value)=>updateSection(index,{startMd:fromDisplay(value,design.units)})}/><NumberField label="End MD" value={toDisplay(section.endMd,design.units)} unit={lengthUnit(design.units)} onChange={(value)=>updateSection(index,{endMd:fromDisplay(value,design.units)})}/></fieldset>)}</div></PanelSection>
    <button className="ai-primary build-button" disabled={Boolean(errors.length)} onClick={buildModel}>Build confirmed 3D well</button>
    <div className="review-summary"><span>Total MD <b>{displayDistance(rendered.summary.totalMd,design.units)}</b></span><span>TVD <b>{displayDistance(rendered.summary.tvd,design.units)}</b></span><a href={consultationMailto(design,rendered.summary,shareUrl)}>Email design ↗</a></div>
  </div>;

  return <main className={`fluidlab-workspace ${panelCollapsed?"panel-collapsed":""}`}>
    <div className="workspace-scene">{webgl?<Suspense fallback={<div className="scene-loading"><i/>Generating trajectory…</div>}><WellboreScene design={lastValid} reducedMotion={reducedMotion} lowPower={lowPower} active={visible} view={view} reset={reset} onCanvas={(canvas)=>{canvasRef.current=canvas;}}/></Suspense>:<StaticWellbore type={lastValid.type}/>}</div>
    <header className="workspace-topbar"><button className="workspace-brand" onClick={requestHome}><i/>Uniq<strong>Energy</strong><span>/ FluidLab AI</span></button><div className="workspace-title"><input aria-label="Well name" value={design.name} onChange={(event)=>edit({...design,name:event.target.value})}/><small>{design.type} planning model</small></div><div className="workspace-status"><span className={saveState}>{saveState==="dirty"?"Not saved":saveState==="exported"?"Exported":"Ready"}</span><button onClick={copyShare} disabled={Boolean(errors.length)}>{copied?"Copied ✓":"Copy link"}</button><button onClick={exportPng} disabled={!webgl||Boolean(errors.length)}>PNG</button></div></header>
    <button ref={menuRef} className="mobile-menu-button" onClick={()=>setDrawerOpen(true)} aria-expanded={drawerOpen} aria-controls="fluidlab-controls"><span/><span/><span/><b>Build</b></button>{drawerOpen&&isMobile&&<button className="drawer-backdrop" aria-label="Close controls" onClick={()=>setDrawerOpen(false)}/>} 
    <aside ref={drawerRef} id="fluidlab-controls" className={`workspace-panel ${drawerOpen?"drawer-open":""}`}><div className="panel-heading"><div><span>FluidLab AI</span><strong>{mode==="assistant"?"Import & chat":"Review well"}</strong></div><div><button className="desktop-collapse" onClick={()=>setPanelCollapsed(!panelCollapsed)} aria-label={panelCollapsed?"Expand panel":"Collapse panel"}>{panelCollapsed?<PanelLeftOpen/>:<PanelLeftClose/>}</button>{isMobile&&<button onClick={()=>setDrawerOpen(false)} aria-label="Close controls">×</button>}</div></div><nav className="tab-strip" aria-label="Builder modes"><button className={mode==="assistant"?"active":""} onClick={()=>setMode("assistant")}><Bot/>Import & Chat</button><button className={mode==="review"?"active":""} onClick={()=>setMode("review")}><Sparkles/>Review Well{analysis?.missingFields.length?<b/>:null}</button></nav><div className="panel-body">{mode==="assistant"?assistant:review}</div></aside>
    <div className="camera-toolbar" aria-label="Camera viewpoints">{cameraTools.map(({id,label,icon:Icon})=><button className={id!=="reset"&&view===id?"active":""} onClick={()=>id==="reset"?setReset((value)=>value+1):setView(id)} key={id} aria-label={label} title={label}><Icon/><span>{label}</span></button>)}</div>
    {notice&&<div className="workspace-notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
    {exitKind&&<div className="exit-overlay"><section ref={dialogRef} className="exit-dialog" role="alertdialog" aria-modal="true" aria-labelledby="exit-title"><span>Unsaved design</span><h2 id="exit-title">Your FluidLab design is not stored.</h2><p>Copy a share link before leaving, or leave without preserving the current changes.</p><div><button onClick={()=>setExitKind(null)}>Stay and continue</button><button onClick={copyAndExit} disabled={Boolean(errors.length)}>Copy link, then leave</button><button className="danger" onClick={completeExit}>Leave without saving</button></div></section></div>}
  </main>;
}
