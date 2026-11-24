# User Access (`users`)

Super admins only. Route `/users`. Staff never see the tile, and the callables use `requireSuperAdmin`, not a staff assignment.

## Screens

Routes live under `/users/*` (nested `Routes` in `src/users/UsersApp.tsx`, which loads the list once and shares it):

- `/users` — the list (`src/users/UserList.tsx`). Search (name, email, type, mini app names), filter chips with counts (All, Super admins, Staff, Disabled, Invite issues), and an "Invite user" button. Compact cards: the round photo sits top-left beside the name and email; the next line is the type ("Staff" with up to two mini app chips and "+N more", "Super admin" with "All mini apps", or "Profile only"); then badges for You, Disabled, invite status, and last sign-in. Card actions: Edit, Send/Resend invite (not on disabled accounts), Disable/Enable (not on yourself). A banner appears when invites bounced, were marked spam, or failed. Loading skeletons, empty and no-match states, and a retry on load errors.
- `/users/new` and `/users/:uid/edit` — the form (`src/users/UserForm.tsx`) on its own page with a Back link to the list. Sections: Name (first, last), Sign-in (email), Access (Staff or Super admin as large choices; staff pick mini apps as tiles with Select all / Clear). Fields are checked in the browser with the server's rules and errors show beside the field. On phones Save and Cancel stay in a sticky bar at the bottom. Cancel with unsaved changes asks to discard. An edit link opened directly waits for the list, and an unknown uid shows "not found". Unknown sub-paths go back to `/users`.
- Send invite and Disable open an in-app confirmation (`src/users/ConfirmDialog.tsx`, a `<dialog>`; Escape cancels, a bottom sheet on phones). Disable uses the danger style. Enable runs straight away. The page never uses `window.confirm` or `alert`.
- Results show as toasts (`src/users/Toasts.tsx`): success, or the failure reason (for example an invite that was not sent).
- Super admins store an empty `miniApps` array because they receive every app. You cannot disable yourself. At least one active super admin must remain.

Pure helpers (search, filters, chips, invite badge, validation) are in `src/users/userHelpers.ts`, tested in `src/users/users.test.tsx`. Styles are in `src/users/users.css` and use the portal theme tokens.

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

- Frontend: `src/users/UsersApp.tsx` (routes, shared list, toasts), `UserList.tsx`, `UserForm.tsx`, `ConfirmDialog.tsx`, `Toasts.tsx`, `userHelpers.ts`, `users.css`. Callables in `src/core/api.ts`: `listUsers`, `createUser`, `updateUser`, `setUserDisabled`, `sendUserInvite`.
- Functions: `functions/users-functions.js` (those five callables) and `functions/users.js` (validation). Invites: `functions/invite.js`, `functions/mailer.js` (`sendInviteEmail`). `listUsers` and `createUser` and `sendUserInvite` use the Resend secret.

## Connections

`requireMiniApp` in `functions/core.js` loads `users/{uid}` and allows a callable only when the verified email matches, both names are present, the type is known, the record is not disabled, and the mini app is in `miniAppsFor(type, assigned)`. `getAccess` is what the dashboard and route guards use. Profile reads the same record for the photo and the displayed name.
