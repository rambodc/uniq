# Invoice QB Gmail setup

Invoice QB is a shared, read-only Gmail browser and bill-candidate queue. It does not send email, change Gmail labels/read status, or write transactions to QuickBooks. AI extraction is available only after a user explicitly requests it for an individual queued PDF.

## Google administrator setup

1. Choose a dedicated Google Workspace mailbox that can sign in to Google. An alias or Google Group is not a standalone mailbox. Everyone granted Invoice QB access can browse the connected mailbox; use an invoice-only account.
2. In Google Cloud Console, select an **organization-owned** project in your Workspace organization. Use `uniqenergy-de71c` if it belongs to that organization; otherwise create/use an organization-owned project for OAuth. This can be separate from the Firebase hosting project.
3. Enable **Gmail API** in that OAuth project.
4. In **Google Auth Platform**, configure branding for **Invoice QB**, set the audience to **Internal**, and supply your administrator support/developer contact email. If Internal is unavailable, the project is not in the right organization; do not switch to an external testing app as a production workaround.
5. Add this data-access scope: `https://www.googleapis.com/auth/gmail.readonly`.
6. Create an OAuth client of type **Web application**. Add this exact authorized redirect URI:

   `https://us-central1-uniqenergy-de71c.cloudfunctions.net/invoiceQbOauthCallback`

   This uses the server authorization-code flow. JavaScript origins are not required for this flow.
7. In Workspace Admin Console, **Security → Access and data control → API controls → Manage third-party app access**, allow the OAuth client for the dedicated mailbox if your organization restricts app access. Limit access to the users/organizational units that need it.
8. In the **Firebase project `uniqenergy-de71c`**, open **Security → Secret Manager**. Create a secret named **INVOICE_QB_CONFIG** (or add a new version if it already exists). Paste a JSON object with these fields, using your actual values:

   ```json
   {
     "clientId": "YOUR_CLIENT_ID.apps.googleusercontent.com",
     "clientSecret": "YOUR_CLIENT_SECRET",
     "redirectUri": "https://us-central1-uniqenergy-de71c.cloudfunctions.net/invoiceQbOauthCallback",
     "encryptionKey": "BASE64_ENCODED_32_RANDOM_BYTES",
     "workspaceDomain": "YOUR_WORKSPACE_DOMAIN"
   }
   ```

   Generate a random encryption key using `openssl rand -base64 32` on a trusted machine. Put the result only in the secret. Do not commit or send the secret values in chat. `workspaceDomain` is your mailbox domain, with no `@` or URL prefix. Keep the encryption key unchanged when rotating the OAuth client secret. To change the encryption key, disconnect the mailbox first, update the secret, wait at least 60 seconds, then reconnect.
9. On that secret's **Permissions** tab, grant **Secret Manager Secret Accessor** to `357883281274-compute@developer.gserviceaccount.com`. This is the Cloud Functions runtime identity. The deployment account does not have permission to enable Gmail API; the Google administrator completes these setup steps. The deployment check intentionally permits a disconnected release.
10. Open **Portal → Invoice QB → Connection → Connect Gmail** while signed into the portal as an active admin. Choose the dedicated mailbox and grant read access. The callback returns to the configured `PUBLIC_APP_URL`, defaulting to `https://uniqenergy-de71c.web.app`.
11. Confirm the displayed connected address. Grant **Invoice QB** in **User Access** only to the teammates who should see that mailbox.

Config is checked at runtime and cached for at most 60 seconds. No redeployment is needed after adding a valid secret version. The app remains usable for existing queued documents while Gmail is disconnected or not configured.

## Use and validation

- Emails defaults to all mail except Spam and Trash, with no date restriction. Date boundaries are UTC when dates are supplied; Through includes the selected date. Search supports Gmail search syntax. Refresh and Load more retrieve mail on demand.
- Open an email, select its body and/or attachments, and choose **Add to bill queue**. The default groups selected documents into one candidate. The checkbox creates separate candidates. An individual PDF containing multiple invoices is retained as one document for later bill preparation.
- Each attachment is limited to 20 MB; each candidate is limited to 50 MB. Missing, oversized, or failed downloads abort the entire selection. Duplicates are detected by source mailbox/message/document, including concurrent submissions. This does not detect the same invoice resent in a different email or bills already in QuickBooks.
- The queue saves email text, original message data, and selected attachments. It retains documents after email deletion, Gmail disconnection, or mailbox replacement. Full message data is stored privately. Email HTML is displayed in a sandboxed, restricted preview with a plain-text fallback; scripts, forms, frames, unsafe links, and external resources are blocked. PDFs use a page-based viewer with page navigation and a download fallback; supported raster images can also be previewed. Other formats are downloaded.
- Queue entries are candidates, not bills. For a queued PDF, choose **Extract with AI** to extract a suggested vendor/customer type, party, invoice number/dates, currency, totals, and line items. This sends only that chosen stored PDF to the AI service; mail and attachments are never processed automatically. Extraction output is an editable draft, starts in **Needs review**, and remains linked to the original candidate and PDF. Review and correct its values, choose **Vendor Bill (Payable)** or **Customer Invoice (Receivable)**, save it, and mark it ready only after confirming key fields. Party names remain text and are not matched against QuickBooks lists yet. No bill or invoice is created in QuickBooks in this phase. If extraction cannot read a PDF, its saved original remains downloadable.
- AI extraction requires the project's existing **OPENAI_API_KEY** Secret Manager secret to be bound to the extraction function. The extraction function uses the Responses API PDF input and does not store the request with the provider. Confirm that secret is already configured before expecting extraction to work; Gmail setup and credentials are unchanged.
- Queued, Already entered, and Ignored are team-managed statuses. Notes/status updates detect concurrent edits. Choose Queued to reopen a candidate. Remove deletes the candidate and saved documents; Gmail is unchanged. If deletion fails, retry Remove on the entry marked Removal pending.
- To change accounts, disconnect first. This revokes the stored Google grant and clears local credentials. Then connect the replacement mailbox. Reconnect renews authorization for the same mailbox.
- Final live acceptance: connect the dedicated account, browse a known invoice, add a document, have a second authorized user view it, change its status, disconnect and confirm the saved document is still readable, then reconnect. Check Gmail to confirm read state and labels were not changed.

## Deployment and tests

Commit and push `production` only. Functions and required permission endpoints deploy before Hosting through the existing workflow dependency check. No local Firebase deployments.

Focused tests:

```sh
npm run test:invoice-qb
npx vitest run src/mini-apps/invoice-qb/InvoiceQb.test.tsx src/portal/miniApps.test.ts src/portal/AppLauncher.test.tsx src/App.test.tsx
node --test functions/test/invoice-qb.test.js functions/test/invoice-qb-extraction.test.js
```

Run the integration test with Firestore and Storage emulators and a **demo project**, never production. The test replaces Google calls with fixtures and uses the emulator to verify permissions, single-use OAuth state, concurrent duplicate prevention, failed downloads, retained documents, and deletion. It never connects a real mailbox.

Google references: [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Workspace API controls](https://support.google.com/a/answer/7281227).
