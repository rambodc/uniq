import { useEffect, useState, type FormEvent } from "react";
import { ASSIGNABLE_MINI_APP_IDS, MINI_APPS, USER_TYPE_LABELS, type MiniAppId, type UserType } from "../auth/miniApps";
import { createUser, listUsers, messageOf, sendUserInvite, setUserDisabled, updateUser, type InviteResult, type UserInput, type UserRecord } from "../core/api";
import { previewUsers } from "../auth/preview";
import { PageShell } from "../auth/Shell";
import Avatar from "../auth/Avatar";

const empty: UserInput = { firstName: "", lastName: "", email: "", type: "staff", miniApps: [] };
const problems = new Set(["bounced", "complained", "failed"]);

export default function UsersApp() {
  const [users, setUsers] = useState<UserRecord[]>(() => previewUsers() ?? []);
  const [loading, setLoading] = useState(() => previewUsers() == null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<(UserInput & { uid?: string; you?: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    return listUsers().then((result) => { setUsers(result.users); setError(""); }, (cause: unknown) => setError(messageOf(cause, "Users could not be loaded."))).finally(() => setLoading(false));
  }
  useEffect(() => {
    if (previewUsers()) return;
    let active = true;
    listUsers().then((result) => { if (active) { setUsers(result.users); setLoading(false); } }, (cause: unknown) => { if (active) { setError(messageOf(cause, "Users could not be loaded.")); setLoading(false); } });
    return () => { active = false; };
  }, []);

  function inviteNote(result: InviteResult) {
    setNotice(result.sent ? "Invite sent." : `Invite was not sent. ${result.reason}`);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    setNotice("");
    const input: UserInput = { firstName: editing.firstName, lastName: editing.lastName, email: editing.email, type: editing.type, miniApps: editing.type === "staff" ? editing.miniApps : [] };
    try {
      if (editing.uid) await updateUser(editing.uid, input);
      else inviteNote((await createUser(input)).invite);
      setEditing(null);
      await load();
    } catch (cause) { setError(messageOf(cause, "That user could not be saved.")); } finally { setBusy(false); }
  }
  async function disable(user: UserRecord) {
    const next = !user.disabled;
    if (next && !window.confirm(`Disable ${user.email}? They will not be able to sign in until you enable them.`)) return;
    setError("");
    try { await setUserDisabled(user.uid, next); await load(); } catch (cause) { setError(messageOf(cause, "That user could not be updated.")); }
  }
  async function resend(user: UserRecord) {
    setError("");
    try { inviteNote((await sendUserInvite(user.uid)).invite); await load(); } catch (cause) { setError(messageOf(cause, "The invite could not be sent.")); }
  }
  function toggleApp(id: MiniAppId) {
    setEditing((current) => current ? { ...current, miniApps: current.miniApps.includes(id) ? current.miniApps.filter((item) => item !== id) : [...current.miniApps, id] } : current);
  }
  const alerts = users.filter((user) => user.invite && problems.has(user.invite.status));

  return <PageShell title="User Access" eyebrow="Super admin" appId="users" back>
    <p className="portal-lead">Invite people with email and password. Staff only see the mini apps you assign. Profile is available to everyone.</p>
    {alerts.length > 0 && <div className="portal-status error" role="alert">{alerts.length} invite{alerts.length === 1 ? "" : "s"} need attention.</div>}
    {error && <div className="portal-status error" role="alert">{error}</div>}
    {notice && <div className="portal-status success" role="status">{notice}</div>}
    <div className="portal-toolbar">
      <button type="button" className="button-primary" onClick={() => setEditing({ ...empty })}>Invite user</button>
    </div>
    {loading ? <p className="portal-empty">Loading users…</p> : <ul className="portal-people">
      {users.map((user) => <li key={user.uid}>
        <Avatar src={user.photo} firstName={user.firstName} lastName={user.lastName} />
        <div>
          <strong>{user.firstName} {user.lastName}</strong>
          <small>{user.email}</small>
          <small>{USER_TYPE_LABELS[user.type]}{user.disabled ? " · Disabled" : ""}{user.you ? " · You" : ""}</small>
          <small>{user.type === "super_admin" ? "All mini apps" : user.miniApps.map((id) => MINI_APPS.find((app) => app.id === id)?.name || id).join(", ") || "Profile only"}</small>
          {user.invite && <small>Invite {user.invite.status}{user.invite.error ? `: ${user.invite.error}` : ""}</small>}
        </div>
        <div className="portal-row">
          <button type="button" onClick={() => setEditing({ uid: user.uid, you: user.you, firstName: user.firstName, lastName: user.lastName, email: user.email, type: user.type, miniApps: user.miniApps })}>Edit</button>
          {!user.you && <button type="button" onClick={() => void disable(user)}>{user.disabled ? "Enable" : "Disable"}</button>}
          {!user.disabled && <button type="button" onClick={() => void resend(user)}>Resend invite</button>}
        </div>
      </li>)}
    </ul>}
    {editing && <form className="portal-card portal-form" onSubmit={save}>
      <h2>{editing.uid ? "Edit user" : "Invite user"}</h2>
      <div className="portal-form-grid">
      <label>First name<input value={editing.firstName} onChange={(event) => setEditing({ ...editing, firstName: event.target.value })} required maxLength={60} /></label>
      <label>Last name<input value={editing.lastName} onChange={(event) => setEditing({ ...editing, lastName: event.target.value })} required maxLength={60} /></label>
      <label>Email<input type="email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} required disabled={editing.you} autoComplete="off" /></label>
      <label>Type<select value={editing.type} disabled={editing.you} onChange={(event) => setEditing({ ...editing, type: event.target.value as UserType })}>
        <option value="staff">Staff</option>
        <option value="super_admin">Super admin</option>
      </select></label>
      {editing.type === "staff" && <fieldset className="portal-span" disabled={editing.you}>
        <legend>Mini apps</legend>
        {ASSIGNABLE_MINI_APP_IDS.map((id) => <label key={id} className="portal-check"><input type="checkbox" checked={editing.miniApps.includes(id)} onChange={() => toggleApp(id)} />{MINI_APPS.find((app) => app.id === id)?.name}</label>)}
      </fieldset>}
      {editing.type === "super_admin" && <p className="portal-span">Super admins can open every mini app, including ones added later.</p>}
      </div>
      <div className="portal-row">
        <button className="button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : editing.uid ? "Save" : "Send invite"}</button>
        <button type="button" onClick={() => setEditing(null)}>Cancel</button>
      </div>
    </form>}
  </PageShell>;
}
