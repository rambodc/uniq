/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, type FormEvent } from "react";
import { Plus, ArrowLeft, Mail, Users, CalendarDays } from "lucide-react";
import { call, when, type Party, type Guest } from "./api";
import "./uex.css";
const initial = () => ({
  name: "",
  description: "",
  location: "",
  timezone: "America/Edmonton",
  startsAt: "",
  endsAt: "",
  status: "draft" as Party["status"],
  archived: false,
});
// datetime-local values represent the selected event timezone, not the host's browser.
export function inZone(iso: string, zone: string) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
export function toUtc(local: string, zone: string) {
  const target = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(target)) throw new Error("Enter a valid date and time.");
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const represented = Date.parse(
      `${inZone(new Date(guess).toISOString(), zone)}:00Z`,
    );
    guess += target - represented;
  }
  const result = new Date(guess).toISOString();
  if (inZone(result, zone) !== local)
    throw new Error(
      "This time does not exist in the selected timezone. Choose another time.",
    );
  return result;
}
export function parseGuests(value: string) {
  return value
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const m = line.match(/^\s*(.+?)\s*(?:<|,)\s*([^<>,\s]+@[^<>,\s]+)>?\s*$/);
      if (!m) throw new Error("Use Name, email@example.com on each line.");
      return { name: m[1].trim(), email: m[2].trim() };
    });
}
export default function UexApp() {
  const [parties, setParties] = useState<Party[]>([]),
    [selected, setSelected] = useState<Party | null>(null),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(initial),
    [guests, setGuests] = useState<Guest[]>([]),
    [guestText, setGuestText] = useState(""),
    [checked, setChecked] = useState<string[]>([]),
    [kind, setKind] = useState("invitation"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [cover, setCover] = useState<File | null>(null);
  const load = async () =>
    setParties((await call<{ parties: Party[] }>("uexListParties")).parties);
  const loadGuests = async (id: string) =>
    setGuests((await call<{ guests: Guest[] }>("uexGuests", { id })).guests);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void run(load);
  }, []);
  const open = async (p: Party) => {
    setSelected(p);
    setDraft({
      ...p,
      startsAt: inZone(p.startsAt, p.timezone),
      endsAt: inZone(p.endsAt, p.timezone),
    });
    setEditing(true);
    setCover(null);
    setChecked([]);
    setGuestText("");
    setGuests([]);
    setKind(p.status === "cancelled" ? "cancellation" : "invitation");
    await loadGuests(p.id);
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const values = {
        ...draft,
        startsAt: toUtc(draft.startsAt, draft.timezone),
        endsAt: toUtc(draft.endsAt, draft.timezone),
      };
      const r = await call<{ id: string }>("uexSaveParty", {
        ...values,
        id: selected?.id,
      });
      setSelected({ ...values, id: r.id });
      if (cover) {
        if (cover.size > 5 * 1024 * 1024)
          throw new Error("Choose an image no larger than 5 MB.");
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () => reject(new Error("Could not read image."));
          reader.readAsDataURL(cover);
        });
        await call("uexUploadCover", { id: r.id, base64 });
        setCover(null);
      }
      await load();
      setNotice(
        "Party saved. Emails are sent only when you choose Send below.",
      );
    });
  };
  const add = () =>
    run(async () => {
      await call("uexAddGuests", {
        id: selected!.id,
        guests: parseGuests(guestText),
      });
      setGuestText("");
      await loadGuests(selected!.id);
      setNotice("Guests added. Select recipients to send their invitations.");
    });
  const send = () =>
    run(async () => {
      let sent = 0,
        failed = 0,
        skipped = 0;
      for (let i = 0; i < checked.length; i += 20) {
        const r = await call<{ results: { status: string }[] }>(
          "uexSendEmails",
          { id: selected!.id, kind, guestIds: checked.slice(i, i + 20) },
        );
        r.results.forEach((x) => {
          if (x.status === "sent") sent++;
          else if (x.status === "failed") failed++;
          else skipped++;
        });
      }
      await loadGuests(selected!.id);
      setNotice(
        `${sent} sent · ${failed} failed · ${skipped} skipped (recently sent, sending, or revoked). Select failed recipients to retry.`,
      );
    });
  return (
    <main className="miniapp-page uex-admin">
      <div className="miniapp-heading">
        <div>
          <span className="miniapp-eyebrow">Uniq Exclusive</span>
          <h1>
            {editing
              ? selected
                ? draft.name || "Edit party"
                : "Create a party"
              : "UEX parties"}
          </h1>
          <p>Bring people together. Make it an occasion.</p>
        </div>
        {editing ? (
          <button
            className="portal-button secondary"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setSelected(null);
            }}
          >
            <ArrowLeft size={16} /> All parties
          </button>
        ) : (
          <button
            className="portal-button"
            onClick={() => {
              setSelected(null);
              setDraft(initial());
              setEditing(true);
              setGuests([]);
              setCover(null);
              setError("");
              setNotice("");
            }}
          >
            <Plus size={16} /> Create party
          </button>
        )}
      </div>
      {error && (
        <p className="portal-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="portal-success" role="status">
          {notice}
        </p>
      )}
      {!editing ? (
        <>
          <div className="uex-party-list">
            {parties.map((p) => (
              <button
                key={p.id}
                className="uex-summary"
                disabled={busy}
                onClick={() => void run(() => open(p))}
              >
                <CalendarDays />
                <span>
                  <b>{p.name}</b>
                  <small>{when(p)}</small>
                  <small>{p.location}</small>
                </span>
                <em>{p.archived ? "Archived" : p.status}</em>
              </button>
            ))}
          </div>
          {!parties.length && !busy && (
            <div className="uex-empty">
              <CalendarDays size={36} />
              <h2>Your first gathering starts here.</h2>
              <p>
                Create a party, add your guests, and send their invitations.
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <form className="portal-form uex-editor" onSubmit={save}>
            <label>
              Party name
              <input
                required
                maxLength={120}
                placeholder="UEX 1"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                required
                maxLength={5000}
                rows={4}
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            <div className="form-pair">
              <label>
                Starts
                <input
                  type="datetime-local"
                  required
                  value={draft.startsAt}
                  onChange={(e) =>
                    setDraft({ ...draft, startsAt: e.target.value })
                  }
                />
              </label>
              <label>
                Ends
                <input
                  type="datetime-local"
                  required
                  value={draft.endsAt}
                  onChange={(e) =>
                    setDraft({ ...draft, endsAt: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="form-pair">
              <label>
                Timezone
                <input
                  required
                  value={draft.timezone}
                  onChange={(e) =>
                    setDraft({ ...draft, timezone: e.target.value })
                  }
                />
              </label>
              <label>
                Location
                <input
                  required
                  maxLength={500}
                  value={draft.location}
                  onChange={(e) =>
                    setDraft({ ...draft, location: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="form-pair">
              <label>
                Party status
                <select
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      status: e.target.value as Party["status"],
                    })
                  }
                >
                  <option value="draft">Draft — guests cannot open yet</option>
                  <option value="published">
                    Published — invited guests only
                  </option>
                  <option value="cancelled">Cancelled — tickets invalid</option>
                </select>
              </label>
              <label>
                Cover image (optional, up to 5 MB)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setCover(e.target.files?.[0] || null)}
                />
              </label>
            </div>
            <label className="uex-check">
              <input
                type="checkbox"
                checked={draft.archived}
                onChange={(e) =>
                  setDraft({ ...draft, archived: e.target.checked })
                }
              />{" "}
              Archive: hide from member home, retain read-only access
            </label>
            <button className="portal-button" disabled={busy}>
              {busy ? "Working…" : "Save party"}
            </button>
          </form>
          {selected && (
            <section className="uex-guests">
              <h2>
                <Users /> Guest list
              </h2>
              <div className="uex-counts">
                {["pending", "accepted", "declined"].map((s) => (
                  <span key={s}>
                    <b>
                      {guests.filter((g) => !g.revoked && g.rsvp === s).length}
                    </b>{" "}
                    {s}
                  </span>
                ))}
              </div>
              <form
                className="portal-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void add();
                }}
              >
                <label>
                  Add named guests
                  <textarea
                    required
                    rows={3}
                    value={guestText}
                    onChange={(e) => setGuestText(e.target.value)}
                    placeholder={
                      "Sarah Smith, sarah@example.com\nAlex Jones, alex@example.com"
                    }
                  />
                </label>
                <small>
                  One person per line. Up to 100 at a time. Existing invitations
                  are kept.
                </small>
                <button className="portal-button secondary" disabled={busy}>
                  Add guests
                </button>
              </form>
              <div className="uex-send">
                <label>
                  <input
                    type="checkbox"
                    checked={
                      !!guests.filter((g) => !g.revoked).length &&
                      checked.length === guests.filter((g) => !g.revoked).length
                    }
                    onChange={(e) =>
                      setChecked(
                        e.target.checked
                          ? guests.filter((g) => !g.revoked).map((g) => g.id)
                          : [],
                      )
                    }
                  />{" "}
                  Select active guests
                </label>
                <select
                  aria-label="Email type"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="invitation">Invitation / resend</option>
                  <option value="update">Party update</option>
                  <option value="cancellation">Cancellation notice</option>
                </select>
                <button
                  className="portal-button"
                  disabled={busy || !checked.length}
                  onClick={() => void send()}
                >
                  <Mail size={16} /> Send to {checked.length}
                </button>
              </div>
              <div className="uex-guest-list">
                {guests.map((g) => (
                  <article key={g.id}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${g.name}`}
                      disabled={g.revoked}
                      checked={checked.includes(g.id)}
                      onChange={(e) =>
                        setChecked((old) =>
                          e.target.checked
                            ? [...old, g.id]
                            : old.filter((id) => id !== g.id),
                        )
                      }
                    />
                    <div>
                      <b>{g.name}</b>
                      <small>{g.email}</small>
                    </div>
                    <span>
                      {g.revoked ? "Revoked" : g.rsvp}
                      <small>Email: {g.delivery}</small>
                      {g.ticket && <small>Ticket: {g.ticket}</small>}
                    </span>
                    <button
                      disabled={busy || g.revoked}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Revoke ${g.name}’s invitation and ticket?`,
                          )
                        )
                          void run(async () => {
                            await call("uexRevokeGuest", {
                              id: selected.id,
                              guestId: g.id,
                            });
                            setChecked((old) =>
                              old.filter((id) => id !== g.id),
                            );
                            await loadGuests(selected.id);
                          });
                      }}
                    >
                      Revoke
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
