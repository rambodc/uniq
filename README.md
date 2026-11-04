# UniqEnergy

Public marketing site and a private workspace for UniqEnergy staff. The public pages stay as they are. The workspace is email-and-password only, with five mini apps: Profile, Contact Form, Inventory Bot, Wells, and User Access.

## Architecture

React, TypeScript, and Vite on Firebase Hosting. Cloud Functions (Node.js 22) are the way to write Firestore and Storage. Browser rules deny every write. The Wells mini app is the one client read: a signed-in person who can open it may read `wellsApp` and nothing else. Callable functions require App Check outside the emulator.

Mini apps are declared once in `functions/miniApps.js`. The browser imports that same file for dashboard tiles, route guards, and the User Access checkboxes.

| Mini app | Id | Route | Who can open it |
| --- | --- | --- | --- |
| Profile | `profile` | `/profile` | Every signed-in user |
| Contact Form | `contact` | `/contact-inbox` | Staff who are assigned it, and every super admin |
| Inventory Bot | `inventoryBot` | `/inventory-bot` | Staff who are assigned it, and every super admin |
| Wells | `wells` | `/wells` | Staff who are assigned it, and every super admin |
| User Access | `users` | `/users` | Super admins only |

Routes: `/signin`, `/dashboard`, `/contact-inbox`, `/contact-inbox/:id`, `/inventory-bot`, `/wells`, `/users`, `/profile`. The contact inbox is a list of every message; opening one goes to its own page, and Back returns to the list (or, from the list, to the dashboard). There is no public sign-up and no email-code login. A super admin invites someone; the invite email contains a one-time Firebase link where they choose a password. Forgot password on `/signin` uses Firebase `sendPasswordResetEmail` and always shows the same confirmation. Password changes happen in Profile with `reauthenticateWithCredential` and `updatePassword`. Passwords never reach our functions.

Access is checked on the server with `requireMiniApp(request, "<id>")` or `requireSuperAdmin(request)` in `functions/core.js`. A missing user record, a mismatched email, an unverified email, an unknown type, missing names, or `disabled: true` means no access.

**Add a mini app:** (1) add one entry to `MINI_APPS` in `functions/miniApps.js`; (2) guard its callables with `requireMiniApp(request, "<id>")`; (3) wrap its routes in `<RequireMiniApp app="<id>" />` in `src/App.tsx` and add a noindex header in `firebase.json`; (4) add its icon to `ICONS` in `src/auth/miniApps.ts` if it is new. Tests fail when a step is missed.

## Firestore schema

The browser cannot write Firestore. A signed-in person who can open Wells may read `wellsApp` only. `users`, the contact inbox, and `inventoryBot` stay closed to the browser. Inventory Bot's document shapes, including what the external collector must write, are in [docs/inventory-bot.md](docs/inventory-bot.md).

### `users/{uid}`

| Field | Meaning |
| --- | --- |
| `email` | Lowercase. Must match the verified Firebase Auth email. |
| `firstName`, `lastName` | Required, 1–60 characters. A super admin sets them. |
| `type` | `super_admin` or `staff`. |
| `miniApps` | Staff: assignable mini app ids (`contact`, `inventoryBot`, and `wells`). Always `[]` for a super admin, who receives every mini app automatically. |
| `photo` | `null`, or `{ path, thumb }`. `path` is the Storage object under `profile-photos/{uid}/`. `thumb` is a small JPEG data URL. Only that person can change it. |
| `invite` | `null`, or `{ status, at, by, resendId, error, checkedAt }`. Status is `sent`, `delivered`, `delayed`, `bounced`, `complained`, or `failed`. |
| `disabled` | When `true`, the Auth account is disabled and the record grants no access. |
| `createdAt`, `createdBy`, `updatedAt`, `updatedBy` | Audit fields. `createdBy` and `updatedBy` are email addresses. |

### `contactInquiries/{id}`

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1` |
| `inquiryType` | `operations`, `product`, `general`, or `careers` |
| `productName` | Optional product name |
| `name` | Required |
| `email` | Optional, lowercase. An email or a phone number is required. |
| `phone` | Optional |
| `company` | Optional |
| `message` | Required |
| `archived` | Boolean. The inbox archives and restores with this field. |
| `createdAt` | Server timestamp |
| `legacy` | Present only on migrated documents. Keeps the previous extra fields, including `linkedinUrl`, `areaOfInterest`, `status`, and `source`. |

## Email

All application mail goes through Resend. The sender is `UniqEnergy Website <website@uniquem.ca>` (`EMAIL_FROM` in `functions/mailer.js`), the same verified uniquem.ca address Uniquem uses. Invite replies go to `rambodr@uniquem.ca`. Each new contact submission also notifies `rambodr@uniquem.ca`.

`RESEND_API_KEY` is declared with `defineSecret` in `functions/core.js` and is already stored in Secret Manager for `uniqenergy-de71c`. Do not put that key in a dotenv file. The functions deploy binds the existing secret. The notification recipient is the non-secret parameter `CONTACT_NOTIFY_EMAIL`, committed in `functions/.env` as `rambodr@uniquem.ca` (the same value as the `defineString` default) so a non-interactive deploy does not prompt for it.

Forgot-password mail is sent by Firebase Authentication, not Resend.

## Cloud Functions

Deployed functions:

- `submitContactInquiry`, `listContactInquiries`, `archiveContactInquiry`, `restoreContactInquiry`
- `getAccess`
- `setMyPhoto`, `removeMyPhoto`, `getMyPhoto`
- `listUsers`, `createUser`, `updateUser`, `setUserDisabled`, `sendUserInvite`
- `inventoryBotXpressBoard`, `inventoryBotMoveTicket`, `inventoryBotLinkAppWell`, `inventoryBotOpenXpressWell`, `inventoryBotGrokSort`
- `voiceChatToken` — dashboard voice chat. Mints a five-minute xAI ephemeral token. Uses the existing Secret Manager secret `XAI_API_KEY` (the same key Inventory Bot already uses for Grok). The browser never receives that key.

Removed on the next functions deploy (`--force` deletes functions that are no longer exported): `inventoryBotRunChecks`, `inventoryBotRunWritten`, `inventoryBotGetToday`, `inventoryBotGetCoverage`, `inventoryBotGetWell`, `inventoryBotListWells`, `inventoryBotUpdateIssue`, `inventoryBotListFlags`, `inventoryBotSetFlag`, `inventoryBotListTickets`, `inventoryBotGetTicket`, `inventoryBotTicketUrl`, `inventoryBotListWarehouses`, `inventoryBotListChat`, `inventoryBotChat`. Ticket and stock documents stay. The collector keeps writing those. Nothing in this repo rebuilds the old check collections.

Removed with this workspace (deleted on the production functions deploy because it uses `--force`): FluidLab (`listFluidWells`, `createFluidWell`, `renameFluidWell`, `getFluidWell`, `getFluidSources`, `getFluidHistory`, `beginFluidImport`, `completeFluidImport`, `retryFluidImport`, `cancelFluidImport`, `getFluidImport`, `processFluidImport`, `saveFluidWell`, `restoreFluidVersion`, `deleteFluidWell`, `getFluidChat`, `askFluidChat`, `cleanupFluidImports`, `generateFluidGeometry`, `analyzeFluidLosses`, `beginFluidPason`, `completeFluidPason`, `getFluidPason`, `cancelFluidPason`, `removeFluidPason`, `saveFluidPasonAnalysis`, `prepareFluidWellDetails`, `newFluidChatSession`), LSD Finder (`resolveLsdLocation`, `listLsdLocations`, `updateLsdLocation`, `removeLsdLocation`), Invoice QB (`invoiceQbConnection`, `invoiceQbConnect`, `invoiceQbOauthCallback`, `invoiceQbDisconnect`, `invoiceQbLabels`, `invoiceQbMessages`, `invoiceQbMessage`, `invoiceQbDownload`, `invoiceQbAdd`, `invoiceQbQueue`, `invoiceQbQueueBody`, `invoiceQbExtract`, `invoiceQbSaveDraft`, `invoiceQbUpdate`, `invoiceQbRemove`), email-code login (`requestLoginCode`, `verifyLoginCode`, `revokeMySessions`, `getCurrentUser`, `updateCurrentUser`), the old user-access callables (`adminListUsers`, `adminUpdateUserAccess`), and UEX (`uexListParties`, `uexGuests`, `uexAddGuests`, `uexRevokeGuest`, `uexSendEmails`, `uexMyParties`, `uexGetMyParty`, `uexRsvp`, `uexInvitationEntry`, `uexConfirmGuestNames`, `uexCreateDraft`, `uexBuilder`, `uexBuilderMessage`, `uexBuilderAction`, `uexAsset`). `processFluidImport` was a task queue and `cleanupFluidImports` was a schedule; both leave with that deploy.

## One-off scripts

These are manual. They are not part of CI, they default to a dry run, and they refuse to run when a Firebase emulator host is set. They use `firebase-admin` with application default credentials against project `uniqenergy-de71c`.

```bash
node scripts/migrate-contact-inquiries.mjs
node scripts/migrate-contact-inquiries.mjs --execute
node scripts/wipe-portal-data.mjs
node scripts/wipe-portal-data.mjs --execute
```

`wipe-portal-data.mjs --execute` writes a complete recursive Firestore export (every document and subcollection) to `uniqenergy-firestore-export-<timestamp>.json` in the current directory, reads that file back, and checks the document count. Pass `--out <file>` to choose the path. If the export fails, the script stops and does not revoke QuickBooks or delete anything. After a verified export it revokes the QuickBooks refresh token stored on `invoiceQbPrivate/connection` at Intuit's revoke endpoint, using the client id, secret, and encryption key in the `INVOICE_QB_CONFIG` secret. It then deletes every top-level collection except `contactInquiries` and `inventoryBot`, deletes Storage files under `fluidlab/`, deletes every Firebase Auth user, and creates the super admin `rambodr@uniquem.ca` (first name Rambod, last name Admin) and emails the set-password invite. That person can change their own name in User Access.

Keep the export file. It contains personal data. It is gitignored.

## Local checks

```bash
npm ci
npm run lint
npm test
npm run build
npm ci --prefix functions
npm run lint --prefix functions
npm test --prefix functions
npm run test:rules
```

`npm test` for the website expects `dist/` from `npm run build` because the SEO checks read the generated pages. `npm run test:rules` needs Java 21 and the Firestore and Storage emulators.

## Manual setup, then deploy

Do this in order. Do not deploy Hosting, Functions, or rules from a local shell. Pushing `production` is the only deploy.

1. In Firebase Authentication for `uniqenergy-de71c`, enable the Email/Password provider. The previous production workflow had turned it off. Invites and forgot-password both need it. `uniqenergy.com` must stay an authorized domain.
2. `RESEND_API_KEY` is already in Secret Manager for `uniqenergy-de71c`. Leave it there. `defineSecret` binds it during the functions deploy. Set it again only if the secret is missing:

   ```bash
   npx -y firebase-tools@latest functions:secrets:set RESEND_API_KEY --project uniqenergy-de71c
   ```

3. Merge to `production`. GitHub Actions deploys Functions with firebase-tools 15.34.2 (`firebase deploy --only functions --force`, which deletes functions removed from the source), Firestore rules, indexes, and Storage rules, then Hosting. Hosting waits until the functions and rules workflows for that commit succeed. The Hosting build receives `VITE_APPCHECK_SITE_KEY` from the Prod GitHub environment: the secret of that name, or the variable of that name if the secret is empty. It is the public reCAPTCHA Enterprise site key, not a server secret.
4. After that deploy is green, run the contact migration (dry run, then `--execute`).
5. Run the wipe (dry run, then `--execute`). The wipe is what creates the first super admin and disconnects QuickBooks. Until it runs, old account records do not match the new user schema, so the workspace will not sign those accounts in. `contactInquiries` is kept and should already be migrated.

The contact notification recipient is `rambodr@uniquem.ca`, committed in `functions/.env`.
