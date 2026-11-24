import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Ban, Pencil, RefreshCw, RotateCcw, Search, Send, TriangleAlert, UserPlus, X } from "lucide-react";
import { USER_TYPE_LABELS } from "../auth/miniApps";
import { messageOf, sendUserInvite, setUserDisabled, type UserRecord } from "../core/api";
import { PageShell } from "../auth/Shell";
import Avatar from "../auth/Avatar";
import ConfirmDialog from "./ConfirmDialog";
import type { ToastTone } from "./Toasts";
import { FILTERS, appChips, filterCounts, fullName, inviteBadge, lastSeen, needsAttention, visibleUsers, type UserFilter } from "./userHelpers";

type Pending = { kind: "disable" | "invite"; user: UserRecord } | null;

export function UserCard({ user, busy, onInvite, onDisable, onEnable }: {
  user: UserRecord;
  busy?: boolean;
  onInvite?: (user: UserRecord) => void;
  onDisable?: (user: UserRecord) => void;
  onEnable?: (user: UserRecord) => void;
}) {
  const chips = appChips(user.miniApps);
  const invite = inviteBadge(user);
  const name = fullName(user);
  return <li className={user.disabled ? "user-card is-disabled" : "user-card"}>
    <div className="user-card-head">
      <Avatar src={user.photo} firstName={user.firstName} lastName={user.lastName} size={44} />
      <div className="user-card-id">
        <strong title={name}>{name}{user.you && <span className="user-badge is-you">You</span>}</strong>
        <span className="user-card-email" title={user.email}>{user.email}</span>
      </div>
    </div>
    <div className="user-card-access" title={user.type === "staff" && chips.all.length ? chips.all.join(", ") : undefined}>
      <span className="user-role">{USER_TYPE_LABELS[user.type]}</span>
      {user.type === "super_admin" ? <span className="user-chip is-all">All mini apps</span>
        : chips.shown.length ? <>{chips.shown.map((label) => <span key={label} className="user-chip">{label}</span>)}{chips.more > 0 && <span className="user-chip is-more">+{chips.more} more</span>}</>
        : <span className="user-chip is-muted">Profile only</span>}
    </div>
    <div className="user-card-meta">
      {user.disabled && <span className="user-badge is-danger">Disabled</span>}
      {invite && <span className={`user-badge is-${invite.tone}`}>{invite.label}</span>}
      <span className="user-card-seen">{lastSeen(user.lastSignInAt)}</span>
    </div>
    {needsAttention(user) && user.invite?.error && <p className="user-card-error">{user.invite.error}</p>}
    <div className="user-card-actions">
      <Link className="users-btn is-small" to={`/users/${encodeURIComponent(user.uid)}/edit`} aria-label={`Edit ${name}`}><Pencil size={15} aria-hidden="true" />Edit</Link>
      {!user.disabled && <button type="button" className="users-btn is-small" disabled={busy} onClick={() => onInvite?.(user)}><Send size={15} aria-hidden="true" />{user.invite ? "Resend invite" : "Send invite"}</button>}
      {!user.you && (user.disabled
        ? <button type="button" className="users-btn is-small" disabled={busy} onClick={() => onEnable?.(user)}><RotateCcw size={15} aria-hidden="true" />Enable</button>
        : <button type="button" className="users-btn is-small is-danger-text" disabled={busy} onClick={() => onDisable?.(user)}><Ban size={15} aria-hidden="true" />Disable</button>)}
    </div>
  </li>;
}

export function UserSkeleton() {
  return <ul className="user-grid" aria-hidden="true">{[0, 1, 2, 3].map((key) => <li key={key} className="user-card is-skeleton"><div className="user-card-head"><span className="sk sk-avatar" /><div className="user-card-id"><span className="sk sk-line" /><span className="sk sk-line is-short" /></div></div><span className="sk sk-line" /><span className="sk sk-line is-short" /></li>)}</ul>;
}

export default function UserList({ users, loading, error, reload, toast }: {
  users: UserRecord[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  toast: (tone: ToastTone, text: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const [pending, setPending] = useState<Pending>(null);
  const [working, setWorking] = useState<string | null>(null);
  const shown = useMemo(() => visibleUsers(users, query, filter), [users, query, filter]);
  const counts = useMemo(() => filterCounts(users), [users]);

  async function run(user: UserRecord, action: () => Promise<[ToastTone, string]>, failure: string) {
    setWorking(user.uid);
    try {
      const [tone, message] = await action();
      toast(tone, message);
      await reload();
    } catch (cause) { toast("error", messageOf(cause, failure)); } finally { setWorking(null); setPending(null); }
  }
  const confirm = () => {
    if (!pending) return;
    const { user, kind } = pending;
    if (kind === "disable") void run(user, async () => { await setUserDisabled(user.uid, true); return ["success", `${fullName(user)} is disabled.`]; }, "That user could not be disabled.");
    else void run(user, async () => { const { invite } = await sendUserInvite(user.uid); return invite.sent ? ["success", `Invite sent to ${user.email}.`] : ["error", `The invite was not sent. ${invite.reason}`]; }, "The invite could not be sent.");
  };
  const enable = (user: UserRecord) => void run(user, async () => { await setUserDisabled(user.uid, false); return ["success", `${fullName(user)} is enabled again.`]; }, "That user could not be enabled.");
  const filtering = query.trim() !== "" || filter !== "all";

  return <PageShell title="User Access" eyebrow="Super admin" appId="users" back>
    <p className="portal-lead users-lead">Invite people with email and password. Staff only see the mini apps you assign. Profile is available to everyone.</p>
    {counts.attention > 0 && filter !== "attention" && <div className="users-alert" role="alert">
      <TriangleAlert size={18} aria-hidden="true" />
      <span>{counts.attention} invite{counts.attention === 1 ? "" : "s"} need{counts.attention === 1 ? "s" : ""} attention.</span>
      <button type="button" className="users-link" onClick={() => setFilter("attention")}>Show</button>
    </div>}
    <div className="users-toolbar">
      <label className="users-search">
        <Search size={18} aria-hidden="true" />
        <span className="users-sr">Search users</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or mini app" autoComplete="off" />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={16} aria-hidden="true" /></button>}
      </label>
      <Link className="users-btn is-primary users-new" to="/users/new"><UserPlus size={18} aria-hidden="true" />Invite user</Link>
    </div>
    <div className="users-filters" role="group" aria-label="Filter users">
      {FILTERS.map(({ id, label }) => (id === "all" || counts[id] > 0 || filter === id) && <button key={id} type="button" aria-pressed={filter === id} className={filter === id ? "users-filter is-active" : "users-filter"} onClick={() => setFilter(id)}>{label}<span>{counts[id]}</span></button>)}
    </div>
    {error && !loading && <div className="users-state is-error" role="alert">
      <TriangleAlert size={22} aria-hidden="true" />
      <p>{error}</p>
      <button type="button" className="users-btn" onClick={() => void reload()}><RefreshCw size={16} aria-hidden="true" />Try again</button>
    </div>}
    {loading && !users.length ? <UserSkeleton /> : !error || users.length ? shown.length ? <>
      {filtering && <p className="users-count" aria-live="polite">{shown.length} of {users.length} users</p>}
      <ul className="user-grid">{shown.map((user) => <UserCard key={user.uid} user={user} busy={working === user.uid} onInvite={(item) => setPending({ kind: "invite", user: item })} onDisable={(item) => setPending({ kind: "disable", user: item })} onEnable={enable} />)}</ul>
    </> : <div className="users-state">
      {filtering ? <><p>No users match {query.trim() ? <>“{query.trim()}”</> : "this filter"}.</p><button type="button" className="users-btn" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button></>
        : <><p>No users yet. Invite the first person to get started.</p><Link className="users-btn is-primary" to="/users/new"><UserPlus size={18} aria-hidden="true" />Invite user</Link></>}
    </div> : null}
    <ConfirmDialog
      open={pending?.kind === "disable"}
      tone="danger"
      title={pending ? `Disable ${fullName(pending.user)}?` : ""}
      body={pending ? `${pending.user.email} won't be able to sign in or open any mini app until you enable the account again.` : ""}
      confirmLabel="Disable user"
      busyLabel="Disabling…"
      busy={!!working}
      onConfirm={confirm}
      onCancel={() => setPending(null)}
    />
    <ConfirmDialog
      open={pending?.kind === "invite"}
      title={pending?.user.invite ? "Resend invite?" : "Send invite?"}
      body={pending ? `${pending.user.email} will get an email with a link to set a password and sign in to uniqenergy.com.` : ""}
      confirmLabel={pending?.user.invite ? "Resend invite" : "Send invite"}
      busyLabel="Sending…"
      busy={!!working}
      onConfirm={confirm}
      onCancel={() => setPending(null)}
    />
  </PageShell>;
}
