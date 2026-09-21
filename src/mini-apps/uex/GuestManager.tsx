/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { call, type Guest } from "./api";

export default function GuestManager({ id, status }: { id: string; status: string }) {
  const [guests, setGuests] = useState<Guest[]>([]), [email, setEmail] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const load = async () => setGuests((await call<{ guests: Guest[] }>("uexGuests", { id })).guests);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setNotice(""); try { await fn(); await load(); } catch (e) { setNotice(e instanceof Error ? e.message : "Please try again."); } finally { setBusy(false); } };
  useEffect(() => { void run(load); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="builder-guests">
    <h2>Guests <span>{guests.length}</span></h2>
    <p>{guests.filter((g) => g.rsvp === "accepted" && !g.revoked).length} attending · {guests.filter((g) => g.rsvp === "pending" && !g.revoked).length} pending · {guests.filter((g) => g.rsvp === "declined" && !g.revoked).length} declined</p>
    <form className="guest-add" onSubmit={(e) => { e.preventDefault(); void run(async () => { await call("uexAddGuests", { id, guests: [{ email }] }); setEmail(""); }); }}>
      <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="guest@example.com" /></label>
      <button disabled={busy || status === "cancelled"}>Invite guest</button>
    </form>
    {notice && <p role="status">{notice}</p>}
    <div className="guest-table-wrap"><table><thead><tr><th>Guest</th><th>RSVP</th><th>Delivery</th><th>Ticket</th><th /></tr></thead><tbody>{guests.map((g) => <tr key={g.id}>
      <td><b>{g.name || "Name added during verification"}</b><small>{g.email}</small></td><td>{g.revoked ? "Revoked" : g.rsvp}</td><td>{g.delivery}{g.delivery === "failed" && <button disabled={busy || status === "draft"} onClick={() => void run(async () => { await call("uexSendEmails", { id, kind: "invitation", guestIds: [g.id] }); })}>Retry</button>}</td><td>{g.ticket || "—"}</td>
      <td><button disabled={busy || g.revoked} onClick={() => void run(async () => { await call("uexRevokeGuest", { id, guestId: g.id }); })}>Revoke</button></td>
    </tr>)}</tbody></table></div>
  </section>;
}
