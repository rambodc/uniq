# Inventory Bot (`inventoryBot`)

Assigned staff and super admins. Routes under `/inventory-bot`. Do not change stored Inventory Bot documents from a pull request. Collectors and the count scripts write them. Field-level shapes for the published counts and the collector inputs are in [docs/inventory-bot.md](../inventory-bot.md).

## Screens

`src/inventory/InventoryApp.tsx`. The tab bar (`InventoryTabs` in `InvXpressPage.tsx`) is Inventory Xpress, Xpress Tickets, and Product Usage.

| Path | Screen |
| --- | --- |
| `/inventory-bot` | Inventory Xpress count (`InvXpressPage.tsx`) |
| `/inventory-bot/wells` | Same page, wells view |
| `/inventory-bot/usage` and `/inventory-bot/usage/:productKey` | Product Usage (`ProductUsagePage.tsx`) |
| `/inventory-bot/tickets` | Xpress Tickets rig board (`RigBoard.tsx`) |
| `/inventory-bot/rig/:rigKey` | One rig (`RigPage.tsx`) |
| `/inventory-bot/rig/:rigKey/merge` | Merge a rig (`RigPickPage.tsx`, mode `merge`) |
| `/inventory-bot/rig/:rigKey/pair/:rowId` | Pair a row (mode `pair`) |
| `/inventory-bot/move-ticket/:ticketId` | Move an Xpress ticket onto a rig (mode `move`) |
| `/inventory-bot/mim` | Older MIM card board (`XpressBoard.tsx`). Not in the tab bar |
| `/inventory-bot/mim/well/:cardId` | One MIM card (`WellPage.tsx`) |
| `/inventory-bot/mim/move/:ticketId` | Move a MIM ticket (`MovePage.tsx`) |

Inventory Xpress and Product Usage read the published Firestore documents in the browser. Every other screen goes through a callable. Ticket PDFs open from Storage (`src/inventory/ticketPdf.ts`).

## Firestore

One top-level collection, `inventoryBot`, document `main`, then subcollections. Browsers cannot write any of it. Client read is allowed only for the two published counts (`firestore.rules`, `canReadInventoryBot`):

- `inventoryBot/main/meta/invXpress` and `.../invXpress/parts/{n}` — Inventory Xpress result. Header keeps `summary`. When the JSON would pass 700 KB, `chunks` is the part count and `products`, `wells`, and `groups` move to `parts`.
- `inventoryBot/main/meta/productUsage` and `.../productUsage/parts/{n}` — Product Usage result, same split.

Other paths the functions and scripts use (closed to the browser):

- `tickets` — `source` `xpress` or `mim`. Key fields read by `xpressTicket`: `type`, `rig`, `lsd`, `customer`, `wellName`, dates (`shippedAt`, `deliveredAt`, `date`, `postedAt`), `total`, `hasPdf`, `pdfPath`, `lines` (`name`/`product`, `qty`, `unit`, `price`), `charges`. The xref publish also writes `rigKey`, `xrefState`, `xrefReason` onto the ticket.
- `stock` — read by `functions/scripts/inv-xpress.mjs` (source `xpress` only).
- `products` — catalog. `meta/invXpressLinks` is an optional name map.
- `appWells/{wellId}` and `appWells/{wellId}/reports/{reportId}` — slim mud-man copy (received and returned). Not the Wells collection.
- `xrefCorrections/{id}` — staff corrections that survive the daily sync: `pair`, `unpair`, `rig`, `alias`, plus `undone`, `undoneBy`, `undoneAt`, `by`, `at`, `note`.
- `rigBoard/{rigKey}` — matched / only-app / only-Xpress counts and `suggestions`.
- `meta/xref` — last xref run (`runAt`, `xpressFrom`, `appFrom`, `totals`, `prefixes`).
- `meta/appReportSync` — copy status (`ok`, `stale`, or `error`), copied onto the Xpress result.
- `xpressCards/{id}` and `mimCards/{id}` — card name, LSD, rig, and the app-well link (`appWellId`, `linkState`, `linkSource`, `linkLocked`, `linkReason`).
- `placements/{ticketId}` — a manual (or Grok) move: `ticketId`, `cardId`, `manual`, `at`, `by`.
- `refreshRequests/{wellId}` — `{ wellId, requestedAt, requestedBy, status: "pending" }` for the box job that recopies one well.

`functions/scripts/inv-xpress.mjs` and `functions/scripts/product-usage.mjs` replace the published counts. They are not Cloud Functions and they are not scheduled in this repo. Product Usage reads the mirror `https://uniqenergymirror.firebaseio.com` and `wellsApp` history; price fields are dropped as soon as a used node is read.

## Storage

`inventoryBot/tickets/xpress/{file}.pdf` and `inventoryBot/tickets/mim/{file}.pdf`. `storage.rules` allow read for an Inventory Bot user (and a super admin) and deny write. The client only opens a path matching `inventoryBot/tickets/(xpress|mim)/{file}.pdf`.

## Code

- Frontend: `src/inventory/` (`InventoryApp.tsx`, `InvXpressPage.tsx`, `ProductUsagePage.tsx`, `RigBoard.tsx`, `RigPage.tsx`, `RigPickPage.tsx`, `XpressBoard.tsx`, `WellPage.tsx`, `MovePage.tsx`, `invXpress.ts`, `productUsage.ts`, `ticketPdf.ts`, `rigData.tsx`, `boardState.tsx`).
- Callables in `functions/inventory-functions.js`, each `requireMiniApp(request, "inventoryBot")`: `inventoryBotXpressBoard`, `inventoryBotRecomputeXref`, `inventoryBotMimBoard`, `inventoryBotMoveTicket`, `inventoryBotLinkAppWell`, `inventoryBotOpenXpressWell`, `inventoryBotOpenMimWell`, `inventoryBotRequestWellRefresh`, `inventoryBotSaveCorrection`, `inventoryBotUndoCorrection`, `inventoryBotOpenAppWell`, `inventoryBotGrokSort`.
- Pure matchers: `functions/inventoryBot/` (`invXpress.js`, `productUsage.js`, `xrefMatch.js`, `rigMatch.js`, `xpressBoard.js`, `uniquem.js`, `mirrorUsage.js`). `inventoryBotMimBoard` and `inventoryBotGrokSort` use the `XAI_API_KEY` secret.

## Connections

Wells (`wellsApp`) is the completed-well copy the Product Usage script reads. The rig board uses `appWells`, not `wellsApp`. User Access grants `inventoryBot`. Grok sorting and the dashboard voice button share the xAI secret; voice is not part of this mini app.
