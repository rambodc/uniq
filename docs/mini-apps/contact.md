# Contact Form (`contact`)

Assigned staff and super admins. Routes `/contact-inbox` and `/contact-inbox/:inquiryId`.

## Screens

- Inbox (`src/contact/ContactInbox.tsx`): Active and Archived, search (`?archived=1`, `?q=`), newest first. Each row shows a mail icon and links to the message.
- Message (`src/contact/ContactDetail.tsx`): type, optional product name, name, email, company, phone, message, and any stored `legacy` fields. Archive and restore.

The public form is not this mini app. It is `/contact-us` in `src/public/PublicSite.tsx` and calls `submitContactInquiry` with no sign-in.

## Firestore

One collection, `contactInquiries/{id}`. The browser cannot read or write it.

Written by `validateInquiry` in `functions/contact.js`:

- `schemaVersion` (1), `inquiryType` (`operations`, `product`, `general`, `careers`)
- `name`, `message`, `archived` (false on create), `createdAt`
- `email` and/or `phone` (at least one), optional `productName`, `company`

`publicInquiry` also returns a `legacy` object when one is already stored. Archive and restore update only `archived`. The inbox callable loads the latest 500 by `createdAt` and filters in memory.

## Storage

None.

## Code

- Frontend: `src/contact/ContactInbox.tsx`, `src/contact/ContactDetail.tsx`, `src/contact/inbox.ts`.
- Functions: `submitContactInquiry`, `listContactInquiries`, `archiveContactInquiry`, `restoreContactInquiry` in `functions/index.js`. Validation and the inbox view are `functions/contact.js`. The public submit sends mail through `functions/mailer.js` (`sendInquiryNotification`). List, archive, and restore call `requireMiniApp(request, "contact")`.

## Connections

A successful public submit emails `CONTACT_NOTIFY_EMAIL` (default `rambodr@uniquem.ca,hrad@uniquem.ca`) from `UniqEnergy Website <website@uniquem.ca>`. The inquiry is stored even when that mail fails. User Access is what grants `contact` to a staff user.
