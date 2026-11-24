# User Access (`users`)

Super admins only. Route `/users`. Staff never see the tile, and the callables use `requireSuperAdmin`, not a staff assignment.

## Screens

`src/users/UsersApp.tsx` is one page:

- List of accounts (email order) with photo thumbnail, type, mini apps, disabled state, and invite status.
- Create and edit: first name, last name, email, type (`super_admin` or `staff`), and the assignable mini apps for staff. Super admins store an empty `miniApps` array because they receive every app.
- Disable or enable. You cannot disable yourself. At least one active super admin must remain.
- Send invite again.

A super admin can change their own name here. Another super admin must change their email, type, or mini apps.

## Firestore

`users/{Firebase Auth uid}` is the access record for the whole portal (Profile shares it). The browser cannot read or write it. Fields set from this app:

- `email`, `firstName`, `lastName`
- `type` (`super_admin` or `staff`)
- `miniApps` — staff only, and only ids from `ASSIGNABLE_MINI_APP_IDS` (`contact`, `inventoryBot`, `wells`, `uniqGroupLogo`). `profile` is `everyone` and is not stored. `users` and `builder` are super-admin-only and cannot be assigned.
- `disabled` (boolean)
- `photo` — not edited here (`null` on create; Profile owns it)
- `invite` — `null`, or `{ status, at, by, resendId, error, checkedAt }`. `status` is `sent`, `delivered`, `delayed`, `bounced`, `complained`, or `failed`.
- `createdAt`, `createdBy`, `updatedAt`, `updatedBy`

`userView` also returns Firebase Auth `lastSignInAt`. Passwords are never stored or returned. Create sets a random password and `emailVerified: true`, then emails a one-time Firebase reset link to `https://uniqenergy.com/signin`.

## Storage

None. Thumbnails on the list come from `users/{uid}.photo.thumb`.

## Code

- Frontend: `src/users/UsersApp.tsx`. Callables in `src/core/api.ts`: `listUsers`, `createUser`, `updateUser`, `setUserDisabled`, `sendUserInvite`.
- Functions: `functions/users-functions.js` (those five callables) and `functions/users.js` (validation). Invites: `functions/invite.js`, `functions/mailer.js` (`sendInviteEmail`). `listUsers` and `createUser` and `sendUserInvite` use the Resend secret.

## Connections

`requireMiniApp` in `functions/core.js` loads `users/{uid}` and allows a callable only when the verified email matches, both names are present, the type is known, the record is not disabled, and the mini app is in `miniAppsFor(type, assigned)`. `getAccess` is what the dashboard and route guards use. Profile reads the same record for the photo and the displayed name.
