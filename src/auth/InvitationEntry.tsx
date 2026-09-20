/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "../core/firebase";
import { verifyLoginCode } from "../core/api";
import { call } from "../mini-apps/uex/api";
import { usePortalAuth } from "../portal/AuthContext";
import CodeEntry, { Resend } from "./CodeEntry";
import "./auth.css";
type Entry = {
  step: "code" | "names" | "complete";
  partyId?: string;
  challengeId?: string;
  resendAt?: number;
  maskedEmail?: string;
  switching?: boolean;
  firstName?: string;
  lastName?: string;
};
const inflight = new Map<string, Promise<Entry>>();
export default function InvitationEntry() {
  const { token = "" } = useParams(),
    navigate = useNavigate(),
    { user, loading, refresh } = usePortalAuth();
  const [entry, setEntry] = useState<Entry | null>(null),
    [code, setCode] = useState(""),
    [first, setFirst] = useState(""),
    [last, setLast] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const enter = async (resend = false) => {
    setBusy(true);
    setError("");
    try {
      const key = `uex-entry:${token}`;
      let requestId = sessionStorage.getItem(key);
      if (!requestId || resend) {
        requestId = crypto.randomUUID();
        sessionStorage.setItem(key, requestId);
      }
      const cache = `${token}:${requestId}:${user?.uid || "guest"}`;
      let task = inflight.get(cache);
      if (!task) {
        task = call<Entry>("uexInvitationEntry", { token, requestId });
        inflight.set(cache, task);
      }
      let result: Entry;
      try {
        result = await task;
      } finally {
        inflight.delete(cache);
      }
      setEntry(result);
      setCode("");
      if (result.step === "complete")
        navigate(`/member/parties/${result.partyId}`, { replace: true });
      if (result.step === "names") {
        setFirst(result.firstName || "");
        setLast(result.lastName || "");
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your invitation could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!loading) void enter();
  }, [token, loading, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const verify = async (value: string) => {
    if (busy || !entry?.challengeId) return;
    setBusy(true);
    setError("");
    try {
      const r = await verifyLoginCode(entry.challengeId, value);
      await signInWithCustomToken(auth, r.customToken);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Check your code and try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const names = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await call<{ partyId: string }>("uexConfirmGuestNames", {
        token,
        firstName: first,
        lastName: last,
      });
      await refresh();
      navigate(`/member/parties/${r.partyId}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please check your name.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <Link className="auth-back" to="/">
        ← Home
      </Link>
      <form
        className="auth-card"
        onSubmit={(e) => {
          e.preventDefault();
          void (entry?.step === "names" ? names() : verify(code));
        }}
      >
        <div className="auth-brand">
          <img src="/brand/uniqenergy-mark-64.png" alt="UniqEnergy" />
        </div>
        <span className="auth-eyebrow">YOUR PERSONAL INVITATION</span>
        <h1>
          {entry?.step === "names"
            ? "Make yourself at home."
            : "You’re invited."}
        </h1>
        {error && (
          <p role="alert" className="auth-alert error">
            {error}
          </p>
        )}
        {!entry && (
          <>
            <p>
              {busy
                ? "Opening your invitation…"
                : "Ask the host for a new invitation if this link is no longer available."}
            </p>
            <button type="button" disabled={busy} onClick={() => void enter()}>
              Try again
            </button>
          </>
        )}
        {entry?.step === "code" && (
          <>
            <p>
              Enter the code sent to <strong>{entry.maskedEmail}</strong>.
            </p>
            {entry.switching && (
              <p>
                Verifying this code switches you from your current account to
                the invited account.
              </p>
            )}
            <CodeEntry
              value={code}
              onChange={setCode}
              onComplete={(v) => void verify(v)}
              disabled={busy}
            />
            <button
              className="auth-submit"
              disabled={busy || code.length !== 6}
            >
              {busy ? "Verifying…" : "Verify & continue"}
            </button>
            <div className="auth-links">
              <Resend
                at={entry.resendAt || 0}
                busy={busy}
                onClick={() => void enter(true)}
              />
            </div>
          </>
        )}
        {entry?.step === "names" && (
          <>
            <p>Review your name for the guest list and your ticket.</p>
            <label>
              First name
              <input
                required
                maxLength={80}
                autoComplete="given-name"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
              />
            </label>
            <label>
              Last name
              <input
                required
                maxLength={80}
                autoComplete="family-name"
                value={last}
                onChange={(e) => setLast(e.target.value)}
              />
            </label>
            <button className="auth-submit" disabled={busy}>
              Open my party
            </button>
          </>
        )}
        <small>
          Your invitation stays private. Only a verified invited account can
          open the party.
        </small>
      </form>
    </main>
  );
}
