import { useEffect, useState, type FormEvent } from "react";
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
  { id: "fluid-programs", label: "Fluid Programs" },
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
    [busy, setBusy] = useState(false);
  const load = async () => {
    const result = await adminListUsers();
    setUsers(result.users);
    setInvitations(result.invitations);
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
      });
    return () => {
      active = false;
    };
  }, []);
  const invite = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
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
  const editInvitation = async (item: Invitation) => {
    const nextEmail = prompt("Invitation email", item.email);
    if (!nextEmail) return;
    const nextFirstName = prompt("First name", item.firstName);
    if (nextFirstName === null) return;
    const nextLastName = prompt("Last name", item.lastName);
    if (nextLastName === null) return;
    await adminUpdateInvite({
      invitationId: item.id,
      email: nextEmail,
      firstName: nextFirstName,
      lastName: nextLastName,
      role: item.role,
      enabledMiniApps: item.enabledMiniApps,
    });
    await load();
  };
  return (
    <main className="miniapp-page">
      <div className="miniapp-heading">
        <div>
          <span className="miniapp-eyebrow">Administration</span>
          <h1>User Access</h1>
        </div>
      </div>
      {error && <p className="portal-error">{error}</p>}
      <form className="portal-panel portal-form" onSubmit={invite}>
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
        <label>
          First name
          <input
            required
            maxLength={80}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </label>
        <label>
          Last name
          <input
            required
            maxLength={80}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </label>
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
        {users.map((item) => (
          <UserAccessRow key={item.uid} user={item} onSaved={load} />
        ))}
      </section>
      <section className="portal-panel">
        <h2>Invitations</h2>
        {invitations.map((item) => (
          <article className="access-row" key={item.id}>
            <div>
              <b>{item.email}</b>
              <small>
                {item.status} · {item.role}
              </small>
            </div>
            {item.status === "pending" && (
              <div>
                <button onClick={() => void editInvitation(item)}>Edit</button>
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
        ))}
      </section>
    </main>
  );
}
