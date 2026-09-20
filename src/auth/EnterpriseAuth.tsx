import { useState, type FormEvent } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { auth } from "../core/firebase";
import {
  requestLoginCode,
  verifyLoginCode,
  updateCurrentUser,
} from "../core/api";
import { usePortalAuth } from "../portal/AuthContext";
import "./auth.css";
import CodeEntry, { Resend } from "./CodeEntry";
export default function EnterpriseAuth() {
  const { user, loading, refresh } = usePortalAuth(),
    [params] = useSearchParams();
  const [email, setEmail] = useState(""),
    [challenge, setChallenge] = useState(""),
    [resendAt, setResendAt] = useState(0),
    [code, setCode] = useState(""),
    [first, setFirst] = useState(""),
    [last, setLast] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const target = params.get("next"),
    next =
      target && /^\/member\/parties\/[a-zA-Z0-9_-]+$/.test(target)
        ? target
        : user?.role === "member"
          ? "/member"
          : "/portal";
  const needsName = user && (!user.firstName || !user.lastName);
  if (!loading && user && !needsName) return <Navigate to={next} replace />;
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await requestLoginCode(email.trim());
      setChallenge(result.challengeId);
      setResendAt(Date.now() + 60000);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send code.");
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!challenge && !needsName) return void send();
    setBusy(true);
    setError("");
    try {
      if (needsName) {
        await updateCurrentUser(first.trim(), last.trim());
        await refresh();
      } else {
        const result = await verifyLoginCode(challenge, code);
        await signInWithCustomToken(auth, result.customToken);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <div className="auth-grid" aria-hidden="true" />
      <Link className="auth-back" to="/">
        ← Home
      </Link>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <img src="/brand/uniqenergy-mark-64.png" alt="UniqEnergy" />
        </div>
        <span className="auth-eyebrow">UniqAccount</span>
        <h1>
          {needsName
            ? "Make it yours."
            : challenge
              ? "Check your email."
              : "Your energy. Your access."}
        </h1>
        <p>
          {needsName
            ? "Tell us your name to finish setting up your account."
            : challenge
              ? `Enter the six-digit code sent to ${email}.`
              : "Sign in or join with your email. No password needed."}
        </p>
        {error && (
          <div className="auth-alert error" role="alert">
            {error}
          </div>
        )}
        {needsName ? (
          <>
            <label>
              <span>First name</span>
              <div>
                <input
                  required
                  maxLength={80}
                  autoComplete="given-name"
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                />
              </div>
            </label>
            <label>
              <span>Last name</span>
              <div>
                <input
                  required
                  maxLength={80}
                  autoComplete="family-name"
                  value={last}
                  onChange={(e) => setLast(e.target.value)}
                />
              </div>
            </label>
          </>
        ) : challenge ? (
          <CodeEntry
            value={code}
            onChange={setCode}
            disabled={busy}
            onComplete={() => {
              document
                .querySelector<HTMLFormElement>(".auth-card")
                ?.requestSubmit();
            }}
          />
        ) : (
          <label>
            <span>Email address</span>
            <div>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </label>
        )}
        <button className="auth-submit" disabled={busy || loading}>
          {busy
            ? "Please wait…"
            : needsName
              ? "Continue"
              : challenge
                ? "Verify & continue"
                : "Send my code"}
        </button>
        {challenge && !needsName && (
          <div className="auth-links">
            <Resend at={resendAt} busy={busy} onClick={() => void send()} />
            <button
              type="button"
              disabled={busy}
              onClick={() => setChallenge("")}
            >
              Use a different email
            </button>
          </div>
        )}
        <small>
          Your browser can keep you signed in for one year. Sign out when using
          a shared device.
        </small>
      </form>
    </main>
  );
}
