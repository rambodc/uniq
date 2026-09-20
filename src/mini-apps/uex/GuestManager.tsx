/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { call, type Guest } from "./api";
import { parseGuests } from "./inputs";
export default function GuestManager({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [guests, setGuests] = useState<Guest[]>([]),
    [email, setEmail] = useState(""),
    [first, setFirst] = useState(""),
    [last, setLast] = useState(""),
    [bulk, setBulk] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [kind, setKind] = useState("invitation"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const load = async () =>
    setGuests((await call<{ guests: Guest[] }>("uexGuests", { id })).guests);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    try {
      await fn();
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void run(load);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="builder-guests">
      <h2>
        Your guest list <span>{guests.length}</span>
      </h2>
      <p>
        {guests.filter((g) => g.rsvp === "accepted" && !g.revoked).length}{" "}
        attending ·{" "}
        {guests.filter((g) => g.rsvp === "pending" && !g.revoked).length}{" "}
        pending ·{" "}
        {guests.filter((g) => g.rsvp === "declined" && !g.revoked).length}{" "}
        declined
      </p>
      <form
        className="guest-add"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await call("uexAddGuests", {
              id,
              guests: [{ email, firstName: first, lastName: last }],
            });
            setEmail("");
            setFirst("");
            setLast("");
          });
        }}
      >
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          First name <small>optional</small>
          <input
            value={first}
            maxLength={80}
            onChange={(e) => setFirst(e.target.value)}
          />
        </label>
        <label>
          Last name <small>optional</small>
          <input
            value={last}
            maxLength={80}
            onChange={(e) => setLast(e.target.value)}
          />
        </label>
        <button disabled={busy}>Add guest</button>
      </form>
      <details>
        <summary>Add several guests</summary>
        <textarea
          aria-label="Guest list"
          placeholder={"email@example.com\nAlex Smith, alex@example.com"}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
        />
        <button
          disabled={busy || !bulk.trim()}
          onClick={() =>
            void run(async () => {
              await call("uexAddGuests", {
                id,
                guests: parseGuests(bulk).map((g) => {
                  const [firstName, ...rest] = g.name.split(" ");
                  return { ...g, firstName, lastName: rest.join(" ") };
                }),
              });
              setBulk("");
            })
          }
        >
          Add list
        </button>
      </details>
      <div className="builder-actions">
        <label>
          Email type{" "}
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="invitation">Invitation / resend</option>
            <option value="update">Party update</option>
            <option value="cancellation">Cancellation</option>
          </select>
        </label>
        <button
          disabled={busy || !selected.length || status === "draft"}
          onClick={() =>
            void run(async () => {
              const results: { status: string }[] = [];
              for (let i = 0; i < selected.length; i += 20) {
                const r = await call<{ results: { status: string }[] }>(
                  "uexSendEmails",
                  { id, kind, guestIds: selected.slice(i, i + 20) },
                );
                results.push(...r.results);
              }
              setNotice(
                `${results.filter((r) => r.status === "sent").length} sent · ${results.filter((r) => r.status === "failed").length} failed · ${results.filter((r) => r.status === "skipped").length} skipped. Select failed deliveries to retry.`,
              );
            })
          }
        >
          Send to {selected.length} selected
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      <div className="guest-table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all guests"
                  checked={
                    guests.some((g) => !g.revoked) &&
                    guests
                      .filter((g) => !g.revoked)
                      .every((g) => selected.includes(g.id))
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? guests.filter((g) => !g.revoked).map((g) => g.id)
                        : [],
                    )
                  }
                />
              </th>
              <th>Guest</th>
              <th>RSVP</th>
              <th>Email</th>
              <th>Ticket</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {guests.map((g) => (
              <tr key={g.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${g.email}`}
                    disabled={g.revoked}
                    checked={selected.includes(g.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, g.id]
                          : selected.filter((v) => v !== g.id),
                      )
                    }
                  />
                </td>
                <td>
                  <b>{g.name || "Name added during verification"}</b>
                  <small>{g.email}</small>
                </td>
                <td>{g.revoked ? "Revoked" : g.rsvp}</td>
                <td>{g.delivery}</td>
                <td>{g.ticket || "—"}</td>
                <td>
                  <button
                    disabled={busy || g.revoked}
                    onClick={() => {
                      if (window.confirm(`Revoke ${g.email}’s invitation?`))
                        void run(async () => {
                          await call("uexRevokeGuest", { id, guestId: g.id });
                        });
                    }}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
