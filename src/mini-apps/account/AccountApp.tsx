import { useState, type FormEvent } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, signOut, updatePassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { LogOut, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { updateCurrentUser } from "../../core/api";
import { auth } from "../../core/firebase";
import { usePortalAuth } from "../../portal/AuthContext";

function passwordError(error: unknown) {
  const code = String((error as { code?: string }).code || "");
  if (code.includes("invalid-credential") || code.includes("wrong-password")) return "The current password is incorrect.";
  if (code.includes("weak-password")) return "Choose a stronger password with at least eight characters.";
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a few minutes and try again.";
  if (code.includes("requires-recent-login")) return "Please sign out, sign in again, and retry the password change.";
  return "Your password could not be changed.";
}

export default function AccountApp() {
  const { user, refresh } = usePortalAuth(), navigate = useNavigate();
  const [firstName, setFirstName] = useState(user?.firstName || ""), [lastName, setLastName] = useState(user?.lastName || ""), [profileStatus, setProfileStatus] = useState(""), [profileError, setProfileError] = useState("");
  const [currentPassword, setCurrentPassword] = useState(""), [newPassword, setNewPassword] = useState(""), [confirmPassword, setConfirmPassword] = useState(""), [securityStatus, setSecurityStatus] = useState(""), [securityError, setSecurityError] = useState(""), [changingPassword, setChangingPassword] = useState(false);
  if (!user) return null;
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault(); setProfileError(""); setProfileStatus("");
    try { await updateCurrentUser(firstName.trim(), lastName.trim()); await refresh(); setProfileStatus("Profile saved."); }
    catch { setProfileError("Your profile could not be saved."); }
  };
  const changePassword = async (event: FormEvent) => {
    event.preventDefault(); setSecurityError(""); setSecurityStatus("");
    if (newPassword.length < 8) { setSecurityError("Use a new password with at least eight characters."); return; }
    if (newPassword !== confirmPassword) { setSecurityError("New passwords do not match."); return; }
    const firebaseUser = auth.currentUser;
    if (!firebaseUser?.email) { setSecurityError("Your signed-in account is unavailable. Sign in again."); return; }
    setChangingPassword(true);
    try {
      await reauthenticateWithCredential(firebaseUser, EmailAuthProvider.credential(firebaseUser.email, currentPassword));
      await updatePassword(firebaseUser, newPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setSecurityStatus("Password changed. You remain signed in.");
    } catch (error) { setSecurityError(passwordError(error)); }
    finally { setChangingPassword(false); }
  };
  return <main className="miniapp-page account-page"><div className="miniapp-heading"><div><span className="miniapp-eyebrow">Account</span><h1>Your account</h1><p>Manage your profile, password, and session.</p></div></div><section className="account-card"><header><UserRound/><div><h2>Profile</h2><p>Your name is visible inside the UniqEnergy portal.</p></div></header><form className="portal-form account-profile-form" onSubmit={saveProfile}><div className="form-pair"><label>First name<input required maxLength={80} value={firstName} onChange={(event) => setFirstName(event.target.value)}/></label><label>Last name<input required maxLength={80} value={lastName} onChange={(event) => setLastName(event.target.value)}/></label></div><div className="account-facts"><div><Mail/><span>Email</span><strong>{user.email}</strong><small>Managed by your administrator</small></div><div><ShieldCheck/><span>Role</span><strong>{user.role === "admin" ? "Administrator" : "User"}</strong><small>Controls portal permissions</small></div></div>{profileError && <p className="portal-error">{profileError}</p>}{profileStatus && <p className="portal-success">{profileStatus}</p>}<div><button className="portal-button">Save profile</button></div></form></section><details className="account-card account-security"><summary><LockKeyhole/><div><h2>Sign-in security</h2><p>Change your password without leaving the application.</p></div><span aria-hidden="true">⌄</span></summary><form className="portal-form" onSubmit={changePassword}><label>Current password<input type="password" required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)}/></label><div className="form-pair"><label>New password<input type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)}/></label><label>Confirm new password<input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}/></label></div>{securityError && <p className="portal-error">{securityError}</p>}{securityStatus && <p className="portal-success">{securityStatus}</p>}<div className="account-actions"><button className="portal-button" disabled={changingPassword}>{changingPassword ? "Changing…" : "Change password"}</button></div></form></details><section className="account-card account-session"><header><LogOut/><div><h2>Session</h2><p>Sign out of UniqEnergy on this browser.</p></div></header><button className="portal-button danger" onClick={() => void signOut(auth).then(() => navigate("/signin"))}>Sign out</button></section></main>;
}
