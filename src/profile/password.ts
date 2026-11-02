/** Firebase accepts 6 characters; the workspace asks for 8. */
export const PASSWORD_MIN = 8;

/** Checks the three password fields before anything is sent. Returns the problem to show, or "" when they are fine. */
export function checkPasswordChange({ current, next, confirm }: { current: string; next: string; confirm: string }): string {
  if (!current) return "Enter your current password.";
  if (next.length < PASSWORD_MIN) return `The new password must be at least ${PASSWORD_MIN} characters.`;
  if (next === current) return "The new password must be different from your current one.";
  if (next !== confirm) return "The new password and the confirmation do not match.";
  return "";
}

/** A message a person can act on for a Firebase Auth failure. Never includes anything they typed. */
export function passwordErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  switch (code) {
    case "auth/wrong-password": case "auth/invalid-credential": return "Your current password is not right.";
    case "auth/weak-password": return `Choose a stronger password (at least ${PASSWORD_MIN} characters).`;
    case "auth/too-many-requests": return "Too many attempts. Wait a few minutes and try again.";
    case "auth/requires-recent-login": return "For your security, sign out, sign back in and try again.";
    case "auth/network-request-failed": return "No connection. Check your internet and try again.";
    default: return "The password could not be changed. Try again.";
  }
}
