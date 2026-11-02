import { useEffect, useRef, useState, type FormEvent } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { auth } from "../core/firebase";
import { getMyPhoto, messageOf, removeMyPhoto, setMyPhoto } from "../core/api";
import { useAuth } from "../auth/AuthContext";
import { previewActive } from "../auth/preview";
import Shell from "../auth/Shell";
import Avatar from "../auth/Avatar";
import { prepareAvatar } from "./avatar";
import { checkPasswordChange, passwordErrorMessage } from "./password";

export default function ProfileApp() {
  const { profile, refreshAccess, logout } = useAuth();
  const [full, setFull] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (previewActive()) return;
    let active = true;
    if (profile?.photo) getMyPhoto().then((result) => { if (active) setFull(result.dataUrl); }, () => undefined);
    return () => { active = false; };
  }, [profile?.photo]);

  if (!profile) return null;
  async function choose(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    setBusy(true);
    setPhotoError("");
    setPhotoNotice("");
    try {
      const prepared = await prepareAvatar(file);
      await setMyPhoto(prepared);
      setFull(`data:image/jpeg;base64,${prepared.photo}`);
      await refreshAccess();
      setPhotoNotice("Your photo was updated.");
    } catch (cause) { setPhotoError(messageOf(cause, "The photo could not be saved.")); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    setPhotoError("");
    setPhotoNotice("");
    try { await removeMyPhoto(); setFull(null); await refreshAccess(); setPhotoNotice("Your photo was removed."); }
    catch (cause) { setPhotoError(messageOf(cause, "The photo could not be removed.")); }
    finally { setBusy(false); }
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault();
    const problem = checkPasswordChange({ current, next, confirm });
    setPasswordNotice("");
    if (problem) { setPasswordError(problem); return; }
    const account = auth.currentUser;
    if (!account?.email) { setPasswordError("Sign in again to change your password."); return; }
    setBusy(true);
    setPasswordError("");
    try {
      await reauthenticateWithCredential(account, EmailAuthProvider.credential(account.email, current));
      await updatePassword(account, next);
      setCurrent(""); setNext(""); setConfirm("");
      setPasswordNotice("Your password was changed.");
    } catch (cause) { setPasswordError(passwordErrorMessage(cause)); } finally { setBusy(false); }
  }

  return <Shell title="Profile" eyebrow="Your account" appId="profile" back>
    <div className="portal-profile">
    <div className="portal-profile-grid">
    <section className="portal-panel">
      <h2>Photo</h2>
      <div className="portal-photo">
        <Avatar src={full ?? profile.photo} firstName={profile.firstName} lastName={profile.lastName} size={96} />
        <div className="portal-photo-copy">
          <p>JPEG, PNG or WebP, up to 5 MB. It is cropped to a square. Only you can change it.</p>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void choose(event.target.files?.[0])} />
          <div className="portal-row">
            <button type="button" disabled={busy} onClick={() => input.current?.click()}>{profile.photo ? "Replace photo" : "Upload photo"}</button>
            {profile.photo && <button type="button" disabled={busy} onClick={() => void remove()}>Remove</button>}
          </div>
          {photoNotice && <div className="portal-status success" role="status">{photoNotice}</div>}
          {photoError && <div className="portal-status error" role="alert">{photoError}</div>}
        </div>
      </div>
    </section>
    <section className="portal-panel">
      <h2>Your details</h2>
      <p>A super admin sets your name and email.</p>
      <dl className="portal-facts">
        <div><dt>First name</dt><dd>{profile.firstName}</dd></div>
        <div><dt>Last name</dt><dd>{profile.lastName}</dd></div>
        <div><dt>Email</dt><dd>{profile.email}</dd></div>
      </dl>
    </section>
    </div>
    <details className="portal-panel portal-disclosure">
      <summary>Change password</summary>
      <form onSubmit={changePassword}>
        <label>Current password<input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" /></label>
        <label>New password<input type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" /></label>
        <label>Confirm new password<input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" /></label>
        {passwordNotice && <div className="portal-status success" role="status">{passwordNotice}</div>}
        {passwordError && <div className="portal-status error" role="alert">{passwordError}</div>}
        <button className="button-primary" type="submit" disabled={busy}>Change password</button>
      </form>
    </details>
    <button type="button" className="portal-logout" onClick={() => void logout()}>Log out</button>
    </div>
  </Shell>;
}
