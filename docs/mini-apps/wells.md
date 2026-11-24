# Wells (`wells`)

Assigned staff and super admins. Routes under `/wells`, guarded by `RequireMiniApp app="wells"`.

## Screens

`src/wells/WellsApp.tsx`:

| Path | Screen |
| --- | --- |
| `/wells` | Older-wells list (`OlderList.tsx`) |
| `/wells/older/:wellId` | Redirects to `properties` |
| `/wells/older/:wellId/:tab` | Well (`WellView.tsx`) |
| `/wells/older/:wellId/reports/:reportId` | One daily report (`ReportPage.tsx`) |

Tabs, in order: Properties, Reports, Products, Inventory, Costs, Safety, Notes, Volume tracking, Documents. The list links each well to `properties`.

Properties reads the well document (name, location, license, AFE, field, formation, province, depth, operator, contractor, rig, dates, status, and the other fields that screen renders). The other tabs read one subcollection each. Documents are rows with `pdfUrl` (ticket, report, and auto-report PDFs); the link opens in a new tab. Volume tracking reads the `tracking` subcollection, document `volumeTracking`.

A dev preview fixture (`src/wells/sample.json`) is used only when preview mode is on. Production reads Firestore from the browser.

## Firestore

One top-level collection, `wellsApp`. Client read is allowed for a Wells user (and a super admin) by `firestore.rules` (`canReadWells`). Client write is denied. There is no Wells callable.

- `wellsApp/main/meta/olderWells` — `wells` (index rows: id, name, location, rig, operator, contractor, status, field, province, dates, `reportCount`, `totalCost`) and `copiedAt`
- `wellsApp/main/olderWells/{wellId}` — the well document
- `wellsApp/main/olderWells/{wellId}/{group}` — `reports`, `products`, `inventory`, `costs`, `safety`, `notes`, `tracking`, `documents`
- `wellsApp/main/olderWells/{wellId}/reports/{reportId}` and `.../inventory` — one report and its inventory map

The copy is written outside this app (the mud man copy). This mini app only reads it.

## Storage

None in this repo. Document links are `pdfUrl` values already on the copied rows.

## Code

- Frontend: `src/wells/WellsApp.tsx`, `OlderList.tsx`, `WellView.tsx`, `ReportPage.tsx`, `chrome.tsx`, `data.ts` (`loadOlderIndex`, `loadWell`, `loadGroup`, `loadReport`), `wells.css`.
- Functions: none. `functions/scripts/product-usage.mjs` (Inventory Bot) reads `wellsApp` older-well history so it does not fetch those reports from the mirror again.

## Connections

Inventory Bot keeps its own slim copy at `inventoryBot/main/appWells` for the rig board and Inventory Xpress. That copy is not this collection. Product Usage is the only in-repo reader of `wellsApp` besides the Wells screens.
