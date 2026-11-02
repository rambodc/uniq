import { useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../core/firebase";
import { getAccess } from "../core/api";
import { safeNext } from "./next";
import { NOT_AUTHORIZED, RESET_CONTINUE_URL, RESET_SENT, accessErrorMessage, resetOutcome, signInErrorMessage } from "./signInMessages";
import { useAuth } from "./AuthContext";
import LoadingScreen from "./LoadingScreen";
import { ThemeToggle } from "./Theme";

export default function SignIn() {
  const { user, type, loading, accessLoading } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  if (loading || (user && accessLoading)) return <LoadingScreen />;
  if (user && user.emailVerified && type) return <Navigate to={next} replace />;
  const switchTo = (to: "signin" | "reset") => { setMode(to); setError(""); setSent(false); };
  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      if (!result.user.emailVerified) { await auth.signOut(); throw new Error(NOT_AUTHORIZED); }
      const access = await getAccess().catch(async (cause: unknown) => { await auth.signOut(); throw new Error(accessErrorMessage(cause)); });
      if (!access.type) { await auth.signOut(); throw new Error(NOT_AUTHORIZED); }
    } catch (cause) { setError(signInErrorMessage(cause)); } finally { setBusy(false); }
  }
  async function reset(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const outcome = resetOutcome(await sendPasswordResetEmail(auth, email.trim().toLowerCase(), { url: RESET_CONTINUE_URL }).then(() => undefined, (cause: unknown) => cause ?? new Error("reset failed")));
    if (outcome.sent) setSent(true);
    else setError(outcome.message);
    setBusy(false);
  }
  return <main className="portal-auth">
    <Link className="portal-back" to="/">Back to UniqEnergy</Link>
    <div className="portal-auth-tools"><ThemeToggle /></div>
    {mode === "signin"
      ? <form className="portal-card" onSubmit={signIn}>
        <img src="/brand/uniqenergy-mark-180.png" alt="UniqEnergy" width={72} height={72} />
        <p className="portal-eyebrow">Workspace</p>
        <h1>Sign in</h1>
        <p>Use the email and password for your UniqEnergy workspace account.</p>
        {error && <div className="portal-status error" role="alert">{error}</div>}
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>
        <button className="button-primary" disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
        <button type="button" className="portal-text-button" onClick={() => switchTo("reset")}>Forgot password?</button>
      </form>
      : <form className="portal-card" onSubmit={reset}>
        <img src="/brand/uniqenergy-mark-180.png" alt="UniqEnergy" width={72} height={72} />
        <p className="portal-eyebrow">Workspace</p>
        <h1>Reset your password</h1>
        <p>Enter your email address and we will send a link to choose a new password.</p>
        {error && <div className="portal-status error" role="alert">{error}</div>}
        {sent && <div className="portal-status success" role="status">{RESET_SENT}</div>}
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
        <button className="button-primary" disabled={busy} type="submit">{busy ? "Sending…" : sent ? "Send again" : "Send reset link"}</button>
        <button type="button" className="portal-text-button" onClick={() => switchTo("signin")}>Back to sign in</button>
      </form>}
  </main>;
}
