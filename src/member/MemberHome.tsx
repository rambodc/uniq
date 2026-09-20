/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { MapPin, ArrowUpRight, CalendarDays } from "lucide-react";
import { usePortalAuth } from "../portal/AuthContext";
import { myParties, when, type Party } from "../mini-apps/uex/api";
import "./member.css";
export function MemberLayout() {
  const { user } = usePortalAuth();
  return (
    <div className="member-shell">
      <header className="member-nav">
        <Link to="/" className="member-logo">
          <img src="/brand/uniqenergy-mark-64.png" alt="" />
          UniqEnergy
        </Link>
        <nav>
          <Link to="/member">My home</Link>
          <Link to="/member/account">Account</Link>
          {user?.role !== "member" && <Link to="/portal">Staff portal ↗</Link>}
        </nav>
      </header>
      <Outlet />
      <footer className="member-footer">
        UniqEnergy · Your tools. Your experiences.
      </footer>
    </div>
  );
}
export default function MemberHome() {
  const { user } = usePortalAuth(),
    [parties, setParties] = useState<Party[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setParties((await myParties()).parties);
    } catch {
      setError("Your invitations could not be loaded.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <main className="member-main">
      <section className="member-hero">
        <span className="member-eyebrow">YOUR UNIQACCOUNT</span>
        <h1>Welcome, {user?.firstName}.</h1>
        <p>A place for your tools, your invitations, and what comes next.</p>
      </section>
      <section className="member-section">
        <div className="member-section-title">
          <h2>Your tools</h2>
          <span>Ready when you are</span>
        </div>
        <Link to="/apps/lsd-finder" className="member-tool">
          <div className="member-tool-icon">
            <MapPin size={38} />
          </div>
          <div>
            <h3>LSD Finder</h3>
            <p>
              Find Alberta land locations and keep your own map of saved pins.
            </p>
          </div>
          <ArrowUpRight />
        </Link>
      </section>
      <section className="member-section">
        <div className="member-section-title">
          <h2>Your invitations</h2>
          <span>Made for you</span>
        </div>
        {loading && <p role="status">Loading invitations…</p>}
        {error && (
          <p role="alert">
            {error} <button onClick={() => void load()}>Retry</button>
          </p>
        )}
        <div className="party-grid">
          {parties.map((p) => (
            <Link
              to={`/member/parties/${p.id}`}
              className="party-card"
              key={p.id}
            >
              <div className="party-cover">
                {p.coverUrl ? (
                  <img src={p.coverUrl} alt="" />
                ) : (
                  <>
                    <span>UNIQ EXCLUSIVE</span>
                    <b>UEX</b>
                  </>
                )}
              </div>
              <div className="party-card-body">
                <span className="member-eyebrow">
                  {p.status === "cancelled"
                    ? "Cancelled"
                    : new Date(p.endsAt) < new Date()
                      ? "Past party"
                      : p.guest?.rsvp}
                </span>
                <h3>{p.name}</h3>
                <p>
                  <CalendarDays size={16} />
                  {when(p)}
                </p>
                <p>{p.location}</p>
                <span className="party-link">
                  View your party <ArrowUpRight size={18} />
                </span>
              </div>
            </Link>
          ))}
        </div>
        {!loading && !error && !parties.length && (
          <div className="member-empty">
            <CalendarDays />
            <h3>Your next invitation belongs here.</h3>
            <p>
              When you’re invited to a UEX party, you’ll find it on this page.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
