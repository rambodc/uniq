import { useState, type FormEvent } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../core/firebase";
import { updateCurrentUser, revokeMySessions } from "../../core/api";
import { usePortalAuth } from "../../portal/AuthContext";
export default function AccountApp() {
  const { user, refresh } = usePortalAuth();
  const [first, setFirst] = useState(user?.firstName || ""),
    [last, setLast] = useState(user?.lastName || ""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, success = "") => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await updateCurrentUser(first, last);
      await refresh();
    }, "Profile saved.");
  };
  return (
    <main className="miniapp-page account-page">
      <div className="miniapp-heading">
        <div>
          <span className="miniapp-eyebrow">UniqAccount</span>
          <h1>Your account</h1>
          <p>
            {user?.email} · {user?.role}
          </p>
        </div>
      </div>
      <form className="account-card portal-form" onSubmit={save}>
        <label>
          First name
          <input
            required
            maxLength={80}
            value={first}
            onChange={(e) => setFirst(e.target.value)}
          />
        </label>
        <label>
          Last name
          <input
            required
            maxLength={80}
            value={last}
            onChange={(e) => setLast(e.target.value)}
          />
        </label>
        <button className="portal-button" disabled={busy}>
          Save profile
        </button>
      </form>
      <section className="account-card">
        <h2>Sign-in and devices</h2>
        <p>You sign in with a code sent to your email.</p>
        <div className="account-actions">
          <button
            className="portal-button"
            disabled={busy}
            onClick={() => void run(() => signOut(auth))}
          >
            Sign out
          </button>
          <button
            className="portal-button danger"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await revokeMySessions();
                await signOut(auth);
              })
            }
          >
            Sign out all devices
          </button>
        </div>
      </section>
      {message && <p role="status">{message}</p>}
    </main>
  );
}
