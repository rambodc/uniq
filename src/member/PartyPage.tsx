/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import EventDocument from "../mini-apps/uex/EventDocument";
import { CalendarDays, MapPin, Ticket } from "lucide-react";
import { call, myParty, when, type Party } from "../mini-apps/uex/api";
export default function PartyPage() {
  const { id = "" } = useParams(),
    [party, setParty] = useState<Party | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      setParty((await myParty(id)).party);
    } catch (e) {
      setParty(null);
      setError(e instanceof Error ? e.message : "Party unavailable.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setError("");
    void load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const respond = async (rsvp: string) => {
    setBusy(true);
    setError("");
    try {
      await call("uexRsvp", { id, rsvp });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update RSVP.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="member-main party-page">
      <Link className="member-back" to="/member">
        ← My invitations
      </Link>
      {loading && <p role="status">Opening your party…</p>}
      {error && (
        <p role="alert" className="portal-error">
          {error}
        </p>
      )}
      {party && (
        <>
          <div className="party-details">
            {party.document ? (
              <div>
                <p className="member-eyebrow">
                  {party.status === "cancelled"
                    ? "EVENT CANCELLED"
                    : party.archived
                      ? "ARCHIVED PARTY"
                      : "YOU’RE INVITED"}
                </p>
                <EventDocument
                  document={party.document}
                  assets={party.assets}
                />
              </div>
            ) : (
              <section>
                <span className="member-eyebrow">
                  {party.status === "cancelled"
                    ? "EVENT CANCELLED"
                    : party.archived
                      ? "ARCHIVED PARTY"
                      : "YOU’RE INVITED"}
                </span>
                <h1>{party.name}</h1>
                <p className="party-meta">
                  <CalendarDays />
                  {when(party)} ({party.timezone})
                </p>
                <p className="party-meta">
                  <MapPin />
                  {party.location}
                </p>
                <p className="party-description">{party.description}</p>
              </section>
            )}
            <aside className="guest-ticket">
              <Ticket />
              <h2>Your invitation</h2>
              <p>{party.guest?.name}</p>
              <span className="rsvp-status">
                {party.status === "cancelled" ? "Cancelled" : party.guest?.rsvp}
              </span>
              {party.guest?.ticketValid ? (
                <>
                  <small>Ticket reference</small>
                  <strong className="ticket-reference">
                    {party.guest.ticket}
                  </strong>
                  <p>Keep this page handy for the party.</p>
                </>
              ) : party.guest?.ticket ? (
                <p>Your ticket is not valid.</p>
              ) : (
                <p>Accept your invitation to receive your ticket.</p>
              )}
              {!party.guest?.readOnly ? (
                <div className="rsvp-actions">
                  <button
                    disabled={busy || party.guest?.rsvp === "accepted"}
                    onClick={() => void respond("accepted")}
                  >
                    I’m attending
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || party.guest?.rsvp === "declined"}
                    onClick={() => void respond("declined")}
                  >
                    Decline
                  </button>
                </div>
              ) : (
                <p>RSVPs are closed.</p>
              )}
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
