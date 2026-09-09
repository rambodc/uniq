import { useEffect, useState, type FormEvent } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { Link, useNavigate, useParams } from "react-router-dom";
import { acceptInvite, previewInvite } from "../core/api";
import type { Invitation } from "../core/types";
import { auth } from "../core/firebase";
import { usePortalAuth } from "../portal/AuthContext";
import "./auth.css";

export default function InviteAccept() {
  const token = useParams().token || "", navigate = useNavigate(), { user, loading: authLoading } = usePortalAuth();
  const [invite, setInvite] = useState<Invitation | null>(null), [firstName, setFirstName] = useState(""), [lastName, setLastName] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(true), [working, setWorking] = useState(false);
  useEffect(() => { void previewInvite(token).then(({ invitation }) => { setInvite(invitation); setFirstName(invitation.firstName); setLastName(invitation.lastName); }).catch(() => setError("This invitation is invalid, expired, or no longer available.")).finally(() => setLoading(false)); }, [token]);
  useEffect(() => { if (!authLoading && user) navigate("/portal", { replace: true }); }, [authLoading, navigate, user]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (password.length < 6) { setError("Use a password with at least six characters."); return; } if (password !== confirm) { setError("Passwords do not match."); return; } setWorking(true); setError(""); try { const result = await acceptInvite(token, password, firstName.trim(), lastName.trim()); await signInWithCustomToken(auth, result.customToken); } catch { setError("Your invitation could not be accepted. It may have expired or already been used."); } finally { setWorking(false); } };
  return <main className="auth-page"><form className="auth-card" onSubmit={submit}><div className="auth-brand"><img src="/brand/uniqenergy-mark-64.png" alt="UniqEnergy"/></div><span className="auth-eyebrow">Enterprise invitation</span><h1>Set up your account.</h1>{loading ? <p>Checking your invitation…</p> : error && !invite ? <><div className="auth-alert error">{error}</div><Link to="/signin">Return to sign in</Link></> : invite && <><p>You’ve been invited as <b>{invite.email}</b>.</p>{error && <div className="auth-alert error" role="alert">{error}</div>}<div className="auth-name-row"><label><span>First name</span><div><input required maxLength={80} value={firstName} onChange={(event) => setFirstName(event.target.value)}/></div></label><label><span>Last name</span><div><input required maxLength={80} value={lastName} onChange={(event) => setLastName(event.target.value)}/></div></label></div><label><span>Password</span><div><input type="password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)}/></div></label><label><span>Confirm password</span><div><input type="password" minLength={6} required value={confirm} onChange={(event) => setConfirm(event.target.value)}/></div></label><button className="auth-submit" disabled={working}>{working ? "Creating account…" : "Accept invitation"}</button></>}</form></main>;
}
