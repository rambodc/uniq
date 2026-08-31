import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import {
  adminCancelInvite,
  adminInviteUser,
  adminListUsers,
  adminResendInvite,
  adminUpdateInvite,
  adminUpdateUserAccess,
} from "../../core/api";
import type {
  Invitation,
  ManagedMiniAppId,
  PortalUser,
  UserRole,
} from "../../core/types";

const grants: { id: ManagedMiniAppId; label: string }[] = [
  { id: "fluidlab", label: "FluidLab" },
  { id: "contact-form", label: "Contact Form" },
];
function UserAccessRow({
  user,
  onSaved,
}: {
  user: PortalUser;
  onSaved: () => Promise<void>;
}) {
  const [selectedRole, setSelectedRole] = useState(user.role),
    [selectedStatus, setSelectedStatus] = useState(user.status),
    [apps, setApps] = useState(user.enabledMiniApps),
    [saving, setSaving] = useState(false);
  const toggle = (id: ManagedMiniAppId) =>
    setApps((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  const save = async () => {
    setSaving(true);
    try {
      await adminUpdateUserAccess({
        uid: user.uid,
        role: selectedRole,
        status: selectedStatus,
        enabledMiniApps: apps,
      });
      await onSaved();
    } finally {
      setSaving(false);
    }
  };
  return (
    <article className="access-row access-editor">
      <div>
        <b>
          {user.firstName} {user.lastName}
        </b>
        <small>{user.email}</small>
      </div>
      <select
        value={selectedRole}
        onChange={(event) => setSelectedRole(event.target.value as UserRole)}
      >
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </select>
      <select
        value={selectedStatus}
        onChange={(event) =>
          setSelectedStatus(event.target.value as "active" | "disabled")
        }
      >
        <option value="active">Active</option>
        <option value="disabled">Disabled</option>
      </select>
      {grants.map((grant) => (
        <label key={grant.id}>
          <input
            type="checkbox"
            checked={selectedRole === "admin" || apps.includes(grant.id)}
            disabled={selectedRole === "admin"}
            onChange={() => toggle(grant.id)}
          />
          {grant.label}
        </label>
      ))}
      <button disabled={saving} onClick={() => void save()}>
        {saving ? "Saving…" : "Save"}
      </button>
    </article>
  );
}
export default function UserAccessApp() {
  const [users, setUsers] = useState<PortalUser[]>([]),
    [invitations, setInvitations] = useState<Invitation[]>([]),
    [email, setEmail] = useState(""),
    [firstName, setFirstName] = useState(""),
    [lastName, setLastName] = useState(""),
    [role, setRole] = useState<UserRole>("user"),
    [enabled, setEnabled] = useState<ManagedMiniAppId[]>([]),
    [error, setError] = useState(""),
    [statusMessage, setStatusMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [editing, setEditing] = useState<Invitation | null>(null);
  const load = async () => {
    const result = await adminListUsers();
    setUsers(result.users);
    setInvitations(result.invitations);
    setLoading(false);
  };
  useEffect(() => {
    let active = true;
    void adminListUsers()
      .then((result) => {
        if (active) {
          setUsers(result.users);
          setInvitations(result.invitations);
        }
      })
      .catch(() => {
        if (active) setError("User access information could not be loaded.");
      }).finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
    };
  }, []);
  const invite = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatusMessage("");
    try {
      await adminInviteUser({
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        enabledMiniApps: enabled,
      });
      setEmail("");
      setFirstName("");
      setLastName("");
      await load();
      setStatusMessage("Invitation sent.");
    } catch {
      setError("The invitation could not be sent.");
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id: ManagedMiniAppId) =>
    setEnabled((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  const saveInvitation = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setBusy(true); setError(""); setStatusMessage("");
    try { await adminUpdateInvite({ invitationId: editing.id, email: editing.email.trim(), firstName: editing.firstName.trim(), lastName: editing.lastName.trim(), role: editing.role, enabledMiniApps: editing.enabledMiniApps }); await load(); setEditing(null); setStatusMessage("Invitation updated."); }
    catch { setError("The invitation could not be updated."); }
    finally { setBusy(false); }
  };
  return (
    <main className="miniapp-page user-access-page">
      <div className="miniapp-heading">
        <div>
          <span className="miniapp-eyebrow">Administration</span>
          <h1>User Access</h1>
          <p>Invite teammates and manage their mini-app permissions.</p>
        </div>
      </div>
      {error && <p className="portal-error">{error}</p>}
      {statusMessage && <p className="portal-success">{statusMessage}</p>}
      <form className="portal-panel portal-form invite-form" onSubmit={invite}>
        <h2>Invite a user</h2>
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <div className="form-pair"><label>First name<input required maxLength={80} value={firstName} onChange={(event) => setFirstName(event.target.value)}/></label><label>Last name<input required maxLength={80} value={lastName} onChange={(event) => setLastName(event.target.value)}/></label></div>
        <label>
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <fieldset>
          <legend>Mini-app access</legend>
          {grants.map((grant) => (
            <label key={grant.id}>
              <input
                type="checkbox"
                checked={role === "admin" || enabled.includes(grant.id)}
                disabled={role === "admin"}
                onChange={() => toggle(grant.id)}
              />
              {grant.label}
            </label>
          ))}
        </fieldset>
        <button className="portal-button" disabled={busy}>
          {busy ? "Sending…" : "Send invitation"}
        </button>
      </form>
      <section className="portal-panel">
        <h2>Active users</h2>
        {loading ? <p className="portal-muted">Loading users…</p> : users.length ? users.map((item) => (
          <UserAccessRow key={item.uid} user={item} onSaved={load} />
        )) : <p className="portal-muted">No active users.</p>}
      </section>
      <section className="portal-panel">
        <h2>Invitations</h2>
        {loading ? <p className="portal-muted">Loading invitations…</p> : invitations.length ? invitations.map((item) => (
          <article className="access-row" key={item.id}>
            <div>
              <b>{item.email}</b>
              <small>
                {item.status} · {item.role}
              </small>
            </div>
            {item.status === "pending" && (
              <div>
                <button onClick={() => setEditing({ ...item, enabledMiniApps: [...item.enabledMiniApps] })}>Edit</button>
                <button
                  onClick={() => void adminResendInvite(item.id).then(load)}
                >
                  Resend
                </button>
                <button
                  onClick={() => void adminCancelInvite(item.id).then(load)}
                >
                  Cancel
                </button>
              </div>
            )}
          </article>
        )) : <p className="portal-muted">No invitations yet.</p>}
      </section>
      {editing && <div className="portal-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><form className="portal-modal portal-form" role="dialog" aria-modal="true" aria-labelledby="edit-invitation-title" onSubmit={saveInvitation}><header><div><span className="miniapp-eyebrow">Invitation</span><h2 id="edit-invitation-title">Edit invitation</h2></div><button type="button" aria-label="Close" onClick={() => setEditing(null)}><X/></button></header><label>Email<input type="email" required value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })}/></label><div className="form-pair"><label>First name<input required maxLength={80} value={editing.firstName} onChange={(event) => setEditing({ ...editing, firstName: event.target.value })}/></label><label>Last name<input required maxLength={80} value={editing.lastName} onChange={(event) => setEditing({ ...editing, lastName: event.target.value })}/></label></div><label>Role<select value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value as UserRole })}><option value="user">User</option><option value="admin">Admin</option></select></label><fieldset><legend>Mini-app access</legend>{grants.map((grant) => <label key={grant.id}><input type="checkbox" checked={editing.role === "admin" || editing.enabledMiniApps.includes(grant.id)} disabled={editing.role === "admin"} onChange={() => setEditing({ ...editing, enabledMiniApps: editing.enabledMiniApps.includes(grant.id) ? editing.enabledMiniApps.filter((id) => id !== grant.id) : [...editing.enabledMiniApps, grant.id] })}/>{grant.label}</label>)}</fieldset><div className="modal-actions"><button type="button" className="portal-button secondary" onClick={() => setEditing(null)}>Cancel</button><button className="portal-button" disabled={busy}>{busy ? "Saving…" : "Save invitation"}</button></div></form></div>}
    </main>
  );
}
