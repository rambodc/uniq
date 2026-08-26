import { useState, type FormEvent } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { updateCurrentUser } from "../../core/api";
import { auth } from "../../core/firebase";
import { usePortalAuth } from "../../portal/AuthContext";

export default function AccountApp() {
  const { user, refresh } = usePortalAuth();
  const [firstName, setFirstName] = useState(user?.firstName || ""),
    [lastName, setLastName] = useState(user?.lastName || ""),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  if (!user) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");
    try {
      await updateCurrentUser(firstName.trim(), lastName.trim());
      await refresh();
      setStatus("Profile saved.");
    } catch {
      setError("Your profile could not be saved.");
    }
  };
  const resetPassword = async () => {
    setError("");
    try { await sendPasswordResetEmail(auth, user.email); setStatus("Password reset instructions sent."); }
    catch { setError("Password reset instructions could not be sent."); }
  };
  return (
    <main className="miniapp-page">
      <div className="miniapp-heading">
        <div>
          <span className="miniapp-eyebrow">Account</span>
          <h1>Your profile</h1>
        </div>
      </div>
      <form className="portal-panel portal-form" onSubmit={submit}>
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
          Email
          <input readOnly value={user.email} />
        </label>
        <label>
          Role
          <input readOnly value={user.role} />
        </label>
        {error && <p className="portal-error">{error}</p>}
        {status && <p className="portal-success">{status}</p>}
        <button className="portal-button">Save profile</button>
      </form>
      <section className="portal-panel">
        <h2>Sign-in security</h2>
        <p>Send a secure password reset link to {user.email}.</p>
        <button className="portal-button" onClick={() => void resetPassword()}>Reset password</button>
      </section>
    </main>
  );
}
