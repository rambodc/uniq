import { useEffect, useState, type FormEvent } from "react";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { ArrowLeft, LockKeyhole, Mail, UserRound } from "lucide-react";
import { auth, authReady } from "../firebaseClient";
import { getAccount, registerAccount } from "../fluidlab/projects";
import "./auth.css";

export type AuthPath = "/signin" | "/signup" | "/forgot-password";

function authMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "The email or password is incorrect.";
  if (code.includes("email-already-in-use")) return "An account already exists for this email. Sign in instead.";
  if (code.includes("weak-password")) return "Use a password with at least eight characters.";
  if (code.includes("user-disabled") || code.includes("permission-denied")) return "This UniqEnergy account is disabled. Contact UniqEnergy for access.";
  if (code.includes("too-many-requests") || code.includes("resource-exhausted")) return "Too many attempts. Please wait and try again.";
  if (code.includes("network-request-failed") || code.includes("unavailable")) return "The service could not be reached. Check your connection and try again.";
  if (code.includes("operation-not-allowed")) return "Email sign-in is not enabled for this Firebase project.";
  if (code.includes("failed-precondition") || code.includes("not-found")) return "Finish your account profile to continue.";
  return "We could not complete that request. Please try again.";
}

export default function AuthPage({ path, navigate }: { path: AuthPath; navigate: (path: string) => void }) {
  const query = new URLSearchParams(location.search);
  const returnTo = query.get("returnTo") || "/account";
  const completing = path === "/signup" && Boolean(auth.currentUser) && query.get("complete") === "1";
  const [profileOnly, setProfileOnly] = useState(completing);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(auth.currentUser?.email ?? query.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(path !== "/signin");

  useEffect(() => {
    if (path !== "/signin") return;
    let active = true;
    void authReady.then(async () => {
      if (!active) return;
      if (!auth.currentUser) {
        setSessionChecked(true);
        return;
      }
      try {
        await getAccount();
        if (active) navigate(returnTo);
      } catch (profileError) {
        if (!active) return;
        const code = typeof profileError === "object" && profileError && "code" in profileError ? String(profileError.code) : "";
        if (code.includes("failed-precondition") || code.includes("not-found")) {
          navigate(`/signup?complete=1&email=${encodeURIComponent(auth.currentUser.email || "")}`);
        } else {
          setSessionChecked(true);
        }
      }
    });
    return () => { active = false; };
  }, [navigate, path, returnTo]);

  useEffect(() => {
    document.title = path === "/signin" ? "Sign in | UniqEnergy Account" : path === "/signup" ? "Create account | UniqEnergy Account" : "Reset password | UniqEnergy Account";
  }, [path]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(""); setStatus(""); setWorking(true);
    try {
      if (path === "/forgot-password") {
        await sendPasswordResetEmail(auth, email.trim());
        setStatus("Password reset instructions have been sent if an account exists for that email.");
        return;
      }
      if (path === "/signin") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        try {
          await getAccount();
          navigate(query.get("returnTo") || "/account");
        } catch (profileError) {
          const profileCode = typeof profileError === "object" && profileError && "code" in profileError ? String(profileError.code) : "";
          if (profileCode.includes("failed-precondition") || profileCode.includes("not-found")) {
            navigate(`/signup?complete=1&email=${encodeURIComponent(email.trim())}`);
          } else {
            throw profileError;
          }
        }
        return;
      }
      if (!firstName.trim() || !lastName.trim()) throw Object.assign(new Error(), { code: "profile/name-required" });
      if (!profileOnly) {
        if (password.length < 8) throw Object.assign(new Error(), { code: "auth/weak-password" });
        if (password !== confirm) throw Object.assign(new Error(), { code: "profile/password-mismatch" });
        await createUserWithEmailAndPassword(auth, email.trim(), password);
        setProfileOnly(true);
      }
      await registerAccount(firstName.trim(), lastName.trim());
      navigate(query.get("returnTo") || "/account");
    } catch (requestError) {
      const code = typeof requestError === "object" && requestError && "code" in requestError ? String(requestError.code) : "";
      if (code.includes("password-mismatch")) setError("Passwords do not match.");
      else if (code.includes("name-required")) setError("Enter your first and last name.");
      else setError(authMessage(requestError));
    } finally { setWorking(false); }
  };

  if (!sessionChecked) return <main className="route-loading"><span>Opening your UniqEnergy Account…</span></main>;

  return <main className="auth-page">
    <div className="auth-grid" aria-hidden="true"/><div className="auth-orbit" aria-hidden="true"/>
    <button className="auth-back" onClick={() => navigate("/")}><ArrowLeft/> Home</button>
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-brand"><i/>Uniq<strong>Energy</strong><span>/ Account</span></div>
      <span className="auth-eyebrow">Your UniqEnergy workspace</span>
      <h1>{path === "/signin" ? "Welcome back." : path === "/signup" ? (profileOnly ? "Complete your profile." : "Create your account.") : "Reset your password."}</h1>
      <p>{path === "/signin" ? "Sign in to access your projects and UniqEnergy applications." : path === "/signup" ? "Create one account for FluidLab and future UniqEnergy applications." : "We’ll send a secure reset link to your account email."}</p>
      {error && <div className="auth-alert error" role="alert">{error}</div>}
      {status && <div className="auth-alert success" role="status">{status}</div>}
      {path === "/signup" && <div className="auth-name-row"><label><span>First name</span><div><UserRound/><input autoComplete="given-name" required value={firstName} onChange={(event) => setFirstName(event.target.value)}/></div></label><label><span>Last name</span><div><UserRound/><input autoComplete="family-name" required value={lastName} onChange={(event) => setLastName(event.target.value)}/></div></label></div>}
      {!profileOnly && <label><span>Email address</span><div><Mail/><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)}/></div></label>}
      {path !== "/forgot-password" && !profileOnly && <label><span>Password</span><div><LockKeyhole/><input type="password" minLength={8} autoComplete={path === "/signin" ? "current-password" : "new-password"} required value={password} onChange={(event) => setPassword(event.target.value)}/></div></label>}
      {path === "/signup" && !profileOnly && <label><span>Confirm password</span><div><LockKeyhole/><input type="password" minLength={8} autoComplete="new-password" required value={confirm} onChange={(event) => setConfirm(event.target.value)}/></div></label>}
      <button className="auth-submit" disabled={working}>{working ? "Please wait…" : path === "/signin" ? "Sign in to UniqEnergy" : path === "/signup" ? "Create account" : "Send reset link"}</button>
      <div className="auth-links">
        {path === "/signin" && <><button type="button" onClick={() => navigate("/forgot-password")}>Forgot password?</button><span>New to UniqEnergy? <button type="button" onClick={() => navigate("/signup")}>Create an account</button></span></>}
        {path === "/signup" && <span>Already registered? <button type="button" onClick={() => navigate("/signin")}>Sign in</button></span>}
        {path === "/forgot-password" && <button type="button" onClick={() => navigate("/signin")}>Return to sign in</button>}
      </div>
      {profileOnly && <button className="auth-signout" type="button" onClick={async () => { await signOut(auth); navigate("/signin"); }}>Use a different account</button>}
      <small>Your UniqEnergy Account securely organizes your applications and projects.</small>
    </form>
  </main>;
}
