import { useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, RefreshCw, ShieldCheck, TriangleAlert, UserRound } from "lucide-react";
import { ASSIGNABLE_MINI_APP_IDS, ICONS, USER_TYPE_LABELS, miniAppById, type MiniAppId, type UserType } from "../auth/miniApps";
import { createUser, messageOf, updateUser, type UserInput, type UserRecord } from "../core/api";
import { PageShell } from "../auth/Shell";
import Avatar from "../auth/Avatar";
import ConfirmDialog from "./ConfirmDialog";
import type { ToastTone } from "./Toasts";
import { EMPTY_USER, cleanInput, fullName, inviteBadge, lastSeen, validateUser, type FieldErrors } from "./userHelpers";

type Props = { users: UserRecord[]; loading: boolean; error: string; reload: () => Promise<void>; toast: (tone: ToastTone, text: string) => void };

/** `/users/new` and `/users/:uid/edit`. Waits for the list when an edit link is opened directly. */
export default function UserFormPage(props: Props) {
  const { uid } = useParams();
  const record = uid ? props.users.find((user) => user.uid === uid) : undefined;
  const title = uid ? "Edit user" : "Invite user";
  if (uid && !record) return <PageShell title={title} eyebrow="User Access" appId="users" back backTo="/users">
    {props.loading ? <div className="users-state" role="status"><span className="users-spinner" aria-hidden="true" /><p>Loading user…</p></div>
      : props.error ? <div className="users-state is-error" role="alert"><TriangleAlert size={22} aria-hidden="true" /><p>{props.error}</p><button type="button" className="users-btn" onClick={() => void props.reload()}><RefreshCw size={16} aria-hidden="true" />Try again</button></div>
      : <div className="users-state"><p>That user was not found. They may have been removed.</p><Link className="users-btn" to="/users">Back to users</Link></div>}
  </PageShell>;
  return <UserForm key={record?.uid ?? "new"} record={record} {...props} />;
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return <div className={error ? "users-field has-error" : "users-field"}>
    <label htmlFor={id}>{label}</label>
    {children}
    {error ? <p className="users-field-error" id={`${id}-msg`}>{error}</p> : hint ? <p className="users-field-hint" id={`${id}-msg`}>{hint}</p> : null}
  </div>;
}

export function UserForm({ record, reload, toast }: Props & { record?: UserRecord }) {
  const navigate = useNavigate();
  const initial: UserInput = record ? { firstName: record.firstName, lastName: record.lastName, email: record.email, type: record.type, miniApps: [...record.miniApps] } : { ...EMPTY_USER };
  const [draft, setDraft] = useState<UserInput>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [leaving, setLeaving] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const you = !!record?.you;
  const isEdit = !!record;
  const dirty = JSON.stringify(cleanInput(draft)) !== JSON.stringify(cleanInput(initial));

  function change(patch: Partial<UserInput>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (tried) setErrors(validateUser(next));
  }
  function toggleApp(id: MiniAppId) {
    change({ miniApps: draft.miniApps.includes(id) ? draft.miniApps.filter((item) => item !== id) : [...draft.miniApps, id] });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    setFailure("");
    const found = validateUser(draft);
    setErrors(found);
    const first = (["firstName", "lastName", "email"] as const).find((key) => found[key]);
    if (first) { form.current?.querySelector<HTMLInputElement>(`#user-${first}`)?.focus(); return; }
    const input = cleanInput(draft);
    setBusy(true);
    try {
      if (record) {
        await updateUser(record.uid, input);
        toast("success", `Saved ${fullName(input)}.`);
      } else {
        const { invite } = await createUser(input);
        toast(invite.sent ? "success" : "error", invite.sent ? `Invite sent to ${input.email}.` : `${fullName(input)} was added, but the invite was not sent. ${invite.reason}`);
      }
      await reload();
      navigate("/users");
    } catch (cause) {
      const message = messageOf(cause, record ? "That user could not be saved." : "That user could not be invited.");
      setFailure(message);
      toast("error", message);
      setBusy(false);
    }
  }
  const cancel = () => { if (dirty && !busy) setLeaving(true); else navigate("/users"); };
  const describedBy = (key: keyof FieldErrors, hint?: boolean) => errors[key] || hint ? `user-${key}-msg` : undefined;
  const invite = record ? inviteBadge(record) : null;

  return <PageShell title={isEdit ? "Edit user" : "Invite user"} eyebrow="User Access" appId="users" back backTo="/users">
    <form ref={form} className="users-form" noValidate onSubmit={save} aria-busy={busy}>
      {record && <div className="users-form-who">
        <Avatar src={record.photo} firstName={record.firstName} lastName={record.lastName} size={52} />
        <div>
          <strong>{fullName(record)}{record.you && <span className="user-badge is-you">You</span>}</strong>
          <span>{record.email}</span>
          <span className="users-form-who-meta">
            {record.disabled && <span className="user-badge is-danger">Disabled</span>}
            {invite && <span className={`user-badge is-${invite.tone}`}>{invite.label}</span>}
            <span className="user-card-seen">{lastSeen(record.lastSignInAt)}</span>
          </span>
        </div>
      </div>}
      {!isEdit && <p className="portal-lead users-lead">They get an email with a link to set a password. Profile is always included.</p>}
      {failure && <div className="portal-status error" role="alert">{failure}</div>}

      <section className="users-section" aria-labelledby="users-sec-name">
        <h2 id="users-sec-name">Name</h2>
        <div className="users-grid-2">
          <Field id="user-firstName" label="First name" error={errors.firstName}>
            <input id="user-firstName" value={draft.firstName} onChange={(event) => change({ firstName: event.target.value })} maxLength={60} autoComplete="off" autoCapitalize="words" aria-invalid={!!errors.firstName} aria-describedby={describedBy("firstName")} required />
          </Field>
          <Field id="user-lastName" label="Last name" error={errors.lastName}>
            <input id="user-lastName" value={draft.lastName} onChange={(event) => change({ lastName: event.target.value })} maxLength={60} autoComplete="off" autoCapitalize="words" aria-invalid={!!errors.lastName} aria-describedby={describedBy("lastName")} required />
          </Field>
        </div>
      </section>

      <section className="users-section" aria-labelledby="users-sec-email">
        <h2 id="users-sec-email">Sign-in</h2>
        <Field id="user-email" label="Email" error={errors.email} hint={you ? "Ask another super admin to change your email." : isEdit ? "They sign in with this address." : "The invite goes to this address."}>
          <input id="user-email" type="email" inputMode="email" value={draft.email} onChange={(event) => change({ email: event.target.value })} disabled={you} maxLength={200} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={!!errors.email} aria-describedby={describedBy("email", true)} required />
        </Field>
      </section>

      <section className="users-section" aria-labelledby="users-sec-access">
        <h2 id="users-sec-access">Access</h2>
        {you && <p className="users-field-hint">You can change your own name here. Ask another super admin to change your access.</p>}
        <fieldset className="users-choices" disabled={you}>
          <legend>User type</legend>
          {(["staff", "super_admin"] as UserType[]).map((type) => <label key={type} className={draft.type === type ? "users-choice is-on" : "users-choice"}>
            <input type="radio" name="user-type" value={type} checked={draft.type === type} onChange={() => change({ type })} />
            <span className="users-choice-icon" aria-hidden="true">{type === "staff" ? <UserRound size={20} /> : <ShieldCheck size={20} />}</span>
            <span><strong>{USER_TYPE_LABELS[type]}</strong><small>{type === "staff" ? "Only the mini apps you pick, plus Profile." : "Every mini app, including User Access and Builder."}</small></span>
          </label>)}
        </fieldset>
        {draft.type === "staff" ? <fieldset className="users-apps" disabled={you}>
          <legend>Mini apps <span>{draft.miniApps.length} of {ASSIGNABLE_MINI_APP_IDS.length}</span></legend>
          <div className="users-apps-tools">
            <button type="button" className="users-link" onClick={() => change({ miniApps: [...ASSIGNABLE_MINI_APP_IDS] })}>Select all</button>
            <button type="button" className="users-link" onClick={() => change({ miniApps: [] })}>Clear</button>
          </div>
          <div className="users-apps-grid">
            {ASSIGNABLE_MINI_APP_IDS.map((id) => {
              const app = miniAppById(id);
              const Icon = ICONS[app.icon];
              const on = draft.miniApps.includes(id);
              return <label key={id} className={on ? "users-app is-on" : "users-app"} style={{ "--accent": app.accent } as CSSProperties}>
                <input type="checkbox" checked={on} onChange={() => toggleApp(id)} />
                <span className="users-app-icon" aria-hidden="true"><Icon size={18} /></span>
                <span className="users-app-name">{app.name}</span>
                <span className="users-app-tick" aria-hidden="true">{on && <Check size={16} />}</span>
              </label>;
            })}
          </div>
          {draft.miniApps.length === 0 && <p className="users-field-hint">No mini apps picked: they will only see Profile.</p>}
        </fieldset> : <p className="users-field-hint">Super admins can open every mini app, including ones added later.</p>}
      </section>

      <div className="users-form-bar">
        <button type="button" className="users-btn" onClick={cancel} disabled={busy}>Cancel</button>
        <button type="submit" className="users-btn is-primary" disabled={busy || (isEdit && !dirty)}>{busy ? (isEdit ? "Saving…" : "Sending invite…") : isEdit ? "Save changes" : "Send invite"}</button>
      </div>
    </form>
    <ConfirmDialog open={leaving} icon="warn" tone="danger" title="Discard changes?" body="Your changes to this user have not been saved." confirmLabel="Discard" onConfirm={() => { setLeaving(false); navigate("/users"); }} onCancel={() => setLeaving(false)} />
  </PageShell>;
}
