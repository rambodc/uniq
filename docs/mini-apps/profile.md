# Profile (`profile`)

Everyone who is signed in has Profile. Route `/profile`, guarded by `RequireMiniApp app="profile"`. Logout exists only here.

## Screens

One page, `src/profile/ProfileApp.tsx`, inside `PageShell`.

- Photo: upload JPEG, PNG, or WebP up to 5 MB. The browser crops a 256px JPEG and a 96px thumbnail (`src/profile/avatar.ts`) and calls `setMyPhoto`. Remove calls `removeMyPhoto`. The full photo is loaded with `getMyPhoto`.
- Details: first name, last name, and email. Read-only. A super admin changes them in User Access.
- Change password: current, new, and confirm. The browser uses Firebase Auth `reauthenticateWithCredential` and `updatePassword` (`src/profile/password.ts`). Passwords never reach Cloud Functions.
- Log out.

## Firestore

No collection of its own. The photo thumbnail and path live on the shared user record `users/{uid}`:

- `photo.thumb` — data URL of the 96px JPEG, or the field is cleared
- `photo.path` — Storage path of the full JPEG

`getAccess` returns `profile` (`firstName`, `lastName`, `email`, `photo` thumbnail) for the header and this page. Names and email are written only by User Access.

## Storage

`profile-photos/{uid}/avatar-{timestamp}.jpg`. Only Cloud Functions read or write it. `storage.rules` leave this path closed. `setMyPhoto` saves the new file, stores the path and thumbnail, and deletes the previous file. `removeMyPhoto` sets `photo` to null and deletes the prefix.

## Code

- Frontend: `src/profile/ProfileApp.tsx`, `src/profile/avatar.ts`, `src/profile/password.ts`. Callables from `src/core/api.ts`: `setMyPhoto`, `removeMyPhoto`, `getMyPhoto`.
- Functions: `functions/profile-functions.js` (`setMyPhoto`, `removeMyPhoto`, `getMyPhoto`, each `requireMiniApp(request, "profile")`), rules in `functions/profile.js` (name length, JPEG checks, `photoPrefix`).

## Connections

User Access creates the `users/{uid}` record and is the only place that changes name or email. The account bar on every private page shows `profile.firstName` and the theme switch. The dashboard tile order comes from `functions/miniApps.js`.
