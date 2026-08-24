import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { Box, FolderOpen, LogOut, Search, Trash2, UserRound } from "lucide-react";
import { auth } from "../firebaseClient";
import { createFluidLabProject, deleteProject, getAccount, listProjects, updateAccount, type AccountProfile, type Project } from "../fluidlab/projects";
import "./account.css";

export default function AccountPortal({ page, navigate }: { page: "projects" | "profile"; navigate: (path: string) => void }) {
  const [user, setUser] = useState<User | null>(null), [account, setAccount] = useState<AccountProfile | null>(null),
    [projects, setProjects] = useState<Project[]>([]), [loading, setLoading] = useState(true), [working, setWorking] = useState(false),
    [error, setError] = useState(""), [query, setQuery] = useState(""), [firstName, setFirstName] = useState(""), [lastName, setLastName] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const profile = await getAccount(); setAccount(profile); setFirstName(profile.firstName); setLastName(profile.lastName);
      if (page === "projects") setProjects(await listProjects());
    } catch (requestError) {
      const code = String((requestError as { code?: string }).code || "");
      if (code.includes("failed-precondition") || code.includes("not-found")) navigate(`/signup?complete=1&email=${encodeURIComponent(auth.currentUser?.email || "")}`);
      else setError("Your account could not be loaded. Please try again.");
    } finally { setLoading(false); }
  }, [navigate, page]);
  useEffect(() => onAuthStateChanged(auth, (current) => {
    if (!current) { navigate(`/signin?returnTo=${encodeURIComponent(location.pathname)}`); return; }
    setUser(current); void load();
  }), [load, navigate]);
  const shown = useMemo(() => projects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase())), [projects, query]);
  const create = async () => { setWorking(true); setError(""); try { const project = await createFluidLabProject(); navigate(`/account/projects/${project.id}/fluidlab`); } catch { setError("The FluidLab project could not be created."); } finally { setWorking(false); } };
  const remove = async (project: Project) => { if (!confirm(`Permanently delete “${project.name}”?`)) return; try { await deleteProject(project.id); setProjects((items) => items.filter((item) => item.id !== project.id)); } catch { setError("The project could not be deleted."); } };
  const saveProfile = async (event: FormEvent) => { event.preventDefault(); setWorking(true); setError(""); try { const profile = await updateAccount(firstName, lastName); setAccount(profile); } catch { setError("Your profile could not be updated."); } finally { setWorking(false); } };
  return <main className="account-shell"><header><button className="account-brand" onClick={() => navigate("/account")}><i/>Uniq<strong>Energy</strong><span>/ Account</span></button><nav><button className={page === "projects" ? "active" : ""} onClick={() => navigate("/account")}><FolderOpen/> Projects</button><button className={page === "profile" ? "active" : ""} onClick={() => navigate("/account/profile")}><UserRound/> Profile</button></nav></header>
    <section className="account-content">{error && <p className="account-error">{error}</p>}{loading ? <p className="account-empty">Loading your account…</p> : page === "profile" ? <form className="profile-card" onSubmit={saveProfile}><span>Account profile</span><h1>{account?.firstName} {account?.lastName}</h1><label>First name<input required maxLength={60} value={firstName} onChange={(event) => setFirstName(event.target.value)}/></label><label>Last name<input required maxLength={60} value={lastName} onChange={(event) => setLastName(event.target.value)}/></label><label>Email<input readOnly value={user?.email || account?.email || ""}/><small>Your login email cannot be changed here.</small></label><div className="profile-status">Status <b>{account?.status}</b></div><button className="account-primary" disabled={working}>{working ? "Saving…" : "Save profile"}</button><button type="button" className="account-logout" onClick={() => void signOut(auth).then(() => navigate("/signin"))}><LogOut/> Sign out</button></form> : <><div className="account-heading"><span>UniqEnergy applications</span><h1>Projects</h1><p>Create and manage every project connected to your account.</p></div><section className="app-section"><h2>Available apps</h2><button className="app-card" disabled={working} onClick={() => void create()}><Box/><span><b>FluidLab</b><small>Build conceptual MD-only well profiles in 3D.</small></span><em>{working ? "Creating…" : "New project →"}</em></button></section><section className="saved-projects"><div><h2>Recent projects</h2><label><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects"/></label></div>{shown.length ? <div className="account-project-grid">{shown.map((project) => <article key={project.id}><button onClick={() => navigate(`/account/projects/${project.id}/fluidlab`)}><FolderOpen/><span><b>{project.name}</b><small>FluidLab · Autosaved {new Date(project.updatedAt).toLocaleString()}</small></span></button><button title="Delete project permanently" onClick={() => void remove(project)}><Trash2/></button></article>)}</div> : <p className="account-empty">{query ? "No matching projects." : "No projects yet. Create your first FluidLab project above."}</p>}</section></>}</section>
  </main>;
}
