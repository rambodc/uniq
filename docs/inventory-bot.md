# Inventory Bot

Inventory Bot is a private mini app (`inventoryBot`, route `/inventory-bot`). Super admins always have it. Staff have it only when `users/{uid}.miniApps` includes `inventoryBot`.

Browsers cannot read Firestore or Storage. Every screen goes through a callable, and every callable except `inventoryBotRunChecks` enforces App Check. Rules stay deny-all.

The morning collector runs outside this repo, with the Admin SDK and owner credentials. It writes the documents below, uploads ticket PDFs, then calls `inventoryBotRunChecks`.

## Paths

One top-level collection. Everything else is a subcollection of `inventoryBot/main`.

| Path | Doc id |
| --- | --- |
| `inventoryBot/main` | `main` |
| `inventoryBot/main/tickets/{id}` | `{source}_{ticketId}` |
| `inventoryBot/main/stock/{id}` | `{date}_{source}_{warehouseCode}` |
| `inventoryBot/main/wells/{id}` | mirror well id |
| `inventoryBot/main/products/{id}` | stable product key |
| `inventoryBot/main/runs/{id}` | `YYYY-MM-DD` |
| `inventoryBot/main/rigInventory/{id}` | `{date}_{wellSlug}` written by checks |
| `inventoryBot/main/issues/{id}` | `{date}_{rule}_{slug}` written by checks |
| `inventoryBot/main/chats/{uid}/messages/{id}` | auto id, written by the chat callable |

Doc ids use letters, numbers, `_` and `-` only. Do not put `/` in an id. Dates are `YYYY-MM-DD`. Timestamps are UTC ISO-8601 strings (`2026-11-02T15:04:00.000Z`), not Firestore Timestamp values. Quantities and money are numbers.

`postedAt` may be a date or a timestamp. Ticket lists order and filter on `postedAt`, so set it even when the warehouse only has a ship date (copy `shippedAt` into `postedAt`).

## `inventoryBot/main`

```json
{ "config": { "graceDays": 3, "valuation": "pricelist", "receivedWindowDays": 5, "staleReportDays": 7 } }
```

| Field | Type | Meaning |
| --- | --- | --- |
| `config.graceDays` | number | A delivery is "not logged" only after this many days. Default 3. |
| `config.valuation` | `"pricelist"` or `"cost"` | Dollar values use `products.price` or `products.cost`. Default `pricelist`. |
| `config.receivedWindowDays` | number | App receipts match tickets within this many days. Default 5. |
| `config.staleReportDays` | number | No report for longer than this, with product still on the well, raises `should_be_returned`. Default 7. |

Missing config uses those defaults. Checks do not overwrite `config`.

## Tickets

`inventoryBot/main/tickets/{source}_{ticketId}`

`source` is `xpress` or `mim`. `company` is `uniqenergy` or `alchem`.

| Field | Type |
| --- | --- |
| `source` | string |
| `company` | string |
| `warehouseCode` | string |
| `warehouseName` | string |
| `type` | string. `DT`, `CT`, `MR`, `ST`, `STx`, `SR`, `AT`, `TT`, `PR`, `FT`, and any later warehouse code. Stored uppercase. |
| `rig` | string |
| `lsd` | string, raw LSD or UWI |
| `lsdNorm` | string. See below. Checks fill it when it is blank or stale. |
| `customer` | string |
| `wellName` | string |
| `shippedAt` | string or null |
| `postedAt` | string or null |
| `orderedBy` | string |
| `carrier` | string |
| `poAfe` | string |
| `refTicket` | string |
| `relatedTickets` | string[] |
| `lines` | `{ code, name, qty, unitWeight, weight }[]`. `qty`, `unitWeight`, and `weight` are numbers. |
| `charges` | `{ service, qty, billingMethod, price, total }[]`. Used for MIM `TT`. Numbers. |
| `total` | number |
| `pdfPath` | Storage path `inventoryBot/tickets/{source}/{file}.pdf` |
| `collectedAt` | ISO string |
| `runId` | string, usually the run date |

Stock effect of a ticket on its `warehouseCode`: `MR`, `PR`, `SR`, and `FT` add `qty`. `DT`, `CT`, `ST`, `STx`, and `TT` subtract `qty`. `AT` uses the signed `qty` as stored.

### LSD key

`lsdNorm` is the match key. `104/9-26-55-4W4` and `100/09-26-055-04W4/00` both become `9-26-55-4W4`.

The rule is in `lsdNorm` in `functions/inventoryBot/engine.js`:

1. Uppercase and trim.
2. Drop a leading event prefix `1xx/`.
3. Drop a trailing `/` plus a one- or two-digit event.
4. Parse LSD, section, township, range, and meridian. Write them without leading zeros as `{lsd}-{section}-{township}-{range}{W|E}{meridian}`.
5. If that pattern is not present, keep only letters and digits.

A ticket matches a well on `lsdNorm`. If several wells share that LSD, the rig number (digits only, so `Rig 0245` and `245` match) picks the well. If the LSD matches nothing and exactly one well has that rig, the rig is used.

## Stock

`inventoryBot/main/stock/{date}_{source}_{warehouseCode}`

| Field | Type |
| --- | --- |
| `date` | `YYYY-MM-DD` |
| `source` | `xpress` or `mim` |
| `company` | `uniqenergy` or `alchem` |
| `warehouseCode` | string |
| `warehouseName` | string |
| `items` | `{ code, name, unitWeight, onHand, committed, inTransit, available }[]` |

Optional movement on each item, or a parallel `movement` array of the same shape: `{ code, openBal, mr, st, ct, dt, at, closeBal }`. Checks explain the on-hand change from tickets. They flag negative `onHand` or `available`, and any change the tickets do not explain.

## Wells

`inventoryBot/main/wells/{mirrorWellId}`

| Field | Type |
| --- | --- |
| `name` | string |
| `lsd`, `lsdNorm` | string |
| `rig` | string |
| `contractor`, `operator`, `province` | string |
| `status` | string. `paused`, `inactive`, `released`, `completed`, `closed`, and `suspended` are inactive. |
| `spudDate` | `YYYY-MM-DD` or null |
| `pricelist` | string |
| `lastReportId` | string |
| `lastReportDate` | `YYYY-MM-DD` or null |
| `remaining` | `{ product, qty, price }[]` from the latest mirror report |
| `received`, `returned`, `used` | `{ product, qty, date? }[]` from that same report. `date` is `YYYY-MM-DD` when the report has one. |
| `updatedAt` | ISO string |

`received` and `returned` are the latest report's lines, not lifetime totals. A delivery is "not logged" only when the latest report date is on or after the ticket and the product is absent from `received`.

## Products

`inventoryBot/main/products/{key}`

| Field | Type |
| --- | --- |
| `name` | string, canonical |
| `xpressCodes`, `mimCodes`, `appNames` | string[] |
| `unit` | string |
| `price` | number, pricelist dollars per unit |
| `cost` | number |
| `confirmed` | boolean |

Matching uses a warehouse code first, then a normalized name (`Elixir 100` and `elixir-100` match). Unknown names still compare by that normalized text.

## Runs

`inventoryBot/main/runs/{YYYY-MM-DD}`

The collector writes the run envelope. Checks only merge `summary` and `checkedAt`.

| Field | Type |
| --- | --- |
| `startedAt`, `finishedAt` | ISO strings |
| `sources.xpress`, `sources.mim`, `sources.mirror` | `{ ok: boolean, counts: object, error: string }` |
| `summary.text` | short plain-English paragraph written by checks |
| `summary.issueCounts` | `{ high, medium, low, open }` |
| `summary.dollarsAtRisk` | number, sum of open issue `dollarValue` |
| `summary.mimTtCharges` | number, sum of MIM `TT` `charges[].total` for that date |
| `checkedAt` | ISO string written by checks |

## Rig inventory and issues

Checks rewrite these for the date. Resolved and ignored issues keep their status, note, `resolvedBy`, and `resolvedAt`. Open issues that the rules no longer produce are deleted.

`rigInventory/{date}_{wellSlug}`

| Field | Type |
| --- | --- |
| `date`, `wellId`, `rig`, `name` | string |
| `expected` | `{ product, qty }[]`. App remaining plus `DT` minus `SR` posted after `lastReportDate` and on or before the check date. |
| `appRemaining` | `{ product, qty }[]` |
| `diff` | `{ product, qty }[]`, expected minus app |
| `ticketIds` | string[] of the tickets included in `expected` |

`issues/{id}`

| Field | Type |
| --- | --- |
| `date` | `YYYY-MM-DD` |
| `rule` | `delivered_not_logged`, `logged_no_ticket`, `qty_mismatch`, `lost_on_rig_move`, `should_be_returned`, `warehouse_drift`, or `missing_price` |
| `severity` | `high`, `medium`, or `low` |
| `title`, `detail` | string |
| `wellId`, `rig`, `lsd` | string, empty when the rule is not about a well |
| `ticketIds` | string[] |
| `products` | `{ name, qty, value }[]` |
| `dollarValue` | number from the pricelist (or cost, when config says so). A remaining line's own `price` is used when the product has none. |
| `status` | `open`, `resolved`, or `ignored` |
| `note` | string |
| `resolvedBy` | email, or empty |
| `resolvedAt` | ISO string or null |

Rules:

1. `delivered_not_logged` (high). A `DT` matched to a well, older than `graceDays`, whose report date is on or after the ticket, with no matching `received` product.
2. `logged_no_ticket` (medium). Latest-report `received` with no `DT` for that product within `receivedWindowDays`.
3. `qty_mismatch` (medium). Received or returned quantity differs from the `DT` or `SR` quantity in that window.
4. `lost_on_rig_move` (high). On the same rig, the newer well's carried-in (received with no `DT` for that product) is below the previous well's remaining.
5. `should_be_returned` (medium). The well is inactive, or the last report is older than `staleReportDays`, remaining is above zero, and no `SR`, `ST`, `STx`, or `TT` for that product is dated on or after the report.
6. `warehouse_drift` (high when on-hand or available is negative, otherwise medium). The on-hand change between the two latest snapshots on or before the date is not the signed ticket quantity between those dates.
7. Money. Every issue above carries `dollarValue`. `missing_price` (low) flags a `DT` on the check date whose product has no price. `summary.mimTtCharges` sums that day's MIM `TT` charges.

## Chat

`inventoryBot/main/chats/{uid}/messages/{id}`

| Field | Type |
| --- | --- |
| `role` | `user` or `assistant` |
| `content` | string |
| `createdAt` | ISO string |

The assistant is `grok-4.3` through `https://api.x.ai/v1/chat/completions`. The key is Secret Manager secret `XAI_API_KEY`, declared with `defineSecret("XAI_API_KEY")` on `inventoryBotChat` only. Do not put the key in a dotenv file.

Tools, each capped so a whole collection is never sent to the model: `search_tickets`, `get_ticket`, `get_well_inventory`, `list_issues`, `get_warehouse_stock`, `find_product`.

## PDFs

Upload the file to `inventoryBot/tickets/{source}/{file}.pdf` and store that path on the ticket as `pdfPath`. `inventoryBotTicketUrl` returns a ten-minute signed read URL. The functions service account needs permission to sign blob URLs (Token Creator on itself) or the button fails at runtime.

## After ingest

`inventoryBotRunChecks` does not use App Check, because the collector is not the web app. It still requires a signed-in super admin.

1. Write tickets, stock, wells, products, and `runs/{date}.sources` with the Admin SDK.
2. Upload PDFs.
3. Create a custom token for the super admin uid, exchange it for an ID token, and POST:

```bash
curl -s -X POST \
  "https://us-central1-uniqenergy-de71c.cloudfunctions.net/inventoryBotRunChecks" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data":{"date":"2026-11-02"}}'
```

Omit `date` to check today in America/Edmonton. The response is `{ date, summary, issueCount }`. Run it again after a correction; resolved and ignored issues are kept.

A super admin can also run the same callable from a signed-in session. The Today screen reads the result. It does not start the collector.
