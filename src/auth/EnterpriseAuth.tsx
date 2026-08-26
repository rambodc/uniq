import { useEffect, useState, type FormEvent } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { auth } from "../core/firebase";
import { requestPasswordReset } from "../core/api";
import { usePortalAuth } from "../portal/AuthContext";
import "./auth.css";

export default function EnterpriseAuth({ mode }: { mode: "signin" | "forgot" }) {
  const { user, loading, refresh } = usePortalAuth(), navigate = useNavigate(), location = useLocation();
  const params = new URLSearchParams(location.search), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [working, setWorking] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  useEffect(() => { document.title = mode === "signin" ? "Sign in | UniqEnergy" : "Reset password | UniqEnergy"; }, [mode]);
  if (!loading && user) return <Navigate to="/portal" replace/>;
  const submit = async (event: FormEvent) => { event.preventDefault(); setWorking(true); setError(""); setMessage(""); try { if (mode === "forgot") { await requestPasswordReset(email.trim()); setMessage("If this address belongs to an active account, reset instructions have been sent."); } else { await signInWithEmailAndPassword(auth, email.trim(), password); await refresh(); navigate(params.get("returnTo") || "/portal"); } } catch { setError(mode === "signin" ? "The email or password is incorrect, or this account is unavailable." : "The reset request could not be completed. Please try again."); } finally { setWorking(false); } };
  return <main className="auth-page"><div className="auth-grid" aria-hidden="true"/><div className="auth-orbit" aria-hidden="true"/><Link className="auth-back" to="/">← Home</Link><form className="auth-card" onSubmit={submit}><div className="auth-brand"><img src="/brand/uniqenergy-mark-64.png" alt="UniqEnergy"/></div><span className="auth-eyebrow">UniqEnergy enterprise</span><h1>{mode === "signin" ? "Welcome back." : "Reset your password."}</h1><p>{mode === "signin" ? "Sign in with the account created through your UniqEnergy invitation." : "We’ll send password reset instructions to your account email."}</p>{error && <div className="auth-alert error" role="alert">{error}</div>}{message && <div className="auth-alert success" role="status">{message}</div>}<label><span>Email address</span><div><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)}/></div></label>{mode === "signin" && <label><span>Password</span><div><input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)}/></div></label>}<button className="auth-submit" disabled={working}>{working ? "Please wait…" : mode === "signin" ? "Sign in" : "Send reset link"}</button><div className="auth-links">{mode === "signin" ? <Link to="/forgot-password">Forgot password?</Link> : <Link to="/signin">Return to sign in</Link>}</div><small>Access is available by administrator invitation only.</small></form></main>;
}
