/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { adminListUsers, adminUpdateUserAccess } from "../../core/api";
import type { PortalUser, UserRole, ManagedMiniAppId } from "../../core/types";
const grants: { id: ManagedMiniAppId; label: string }[] = [
  { id: "fluidlab", label: "FluidLab" },
  { id: "invoice-qb", label: "Invoice QB" },
  { id: "contact-form", label: "Contact Form" },
  { id: "uex", label: "UEX management" },
];
function Row({
  user,
  onSaved,
}: {
  user: PortalUser;
  onSaved: () => Promise<void>;
}) {
  const [role, setRole] = useState(user.role),
    [status, setStatus] = useState(user.status),
    [apps, setApps] = useState(user.enabledMiniApps),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await adminUpdateUserAccess({
        uid: user.uid,
        role,
        status,
        enabledMiniApps: apps,
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save access.");
    } finally {
      setBusy(false);
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
      <label>
        Role
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
        >
          <option value="member">Member</option>
          <option value="employee">Employee</option>
          <option value="admin">Administrator</option>
        </select>
      </label>
      <label>
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "active" | "disabled")}
        >
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </label>
      {grants.map((g) => (
        <label key={g.id}>
          <input
            type="checkbox"
            disabled={role !== "employee"}
            checked={
              role === "admin" || (role === "employee" && apps.includes(g.id))
            }
            onChange={() =>
              setApps((a) =>
                a.includes(g.id) ? a.filter((i) => i !== g.id) : [...a, g.id],
              )
            }
          />
          {g.label}
        </label>
      ))}
      <button
        className="portal-button"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? "Saving…" : "Save access"}
      </button>
      {error && (
        <p role="alert" className="portal-error">
          {error}
        </p>
      )}
    </article>
  );
}
export default function UserAccessApp() {
  const [users, setUsers] = useState<PortalUser[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const load = async (next?: string) => {
    setLoading(true);
    setError("");
    try {
      const r = await adminListUsers({
        query: query.trim() || undefined,
        cursor: next,
      });
      setUsers((old) => (next ? [...old, ...r.users] : r.users));
      setCursor(r.cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="miniapp-page">
      <div className="miniapp-heading">
        <div>
          <span className="miniapp-eyebrow">Administration</span>
          <h1>User access</h1>
          <p>
            Everyone signs up with an email code. Promote members and assign
            staff tools here.
          </p>
        </div>
      </div>
      <form
        className="portal-form"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          Find by email
          <input
            type="email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Exact email address"
          />
        </label>
        <button className="portal-button" disabled={loading}>
          Search / refresh
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {users.map((u) => (
        <Row
          key={`${u.uid}-${u.role}-${u.status}-${u.enabledMiniApps.join()}`}
          user={u}
          onSaved={() => load()}
        />
      ))}
      {!loading && !users.length && <p>No accounts found.</p>}
      {cursor && (
        <button
          className="portal-button"
          disabled={loading}
          onClick={() => void load(cursor)}
        >
          Load more
        </button>
      )}
    </main>
  );
}
