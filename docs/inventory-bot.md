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
| `config.checksStartDate` | `YYYY-MM-DD` | Ignore warehouse tickets, app entries, and stock snapshots dated before this day (America/Edmonton). The live main document stores this beside `config` as `checksStartDate` (`2026-10-30`); either place is read. Blank means no cutoff. |
| `config.ignoreStockNames` | string[] | Names containing one of these phrases (case-insensitive; a trailing plural also matches the singular, so `Pallets` covers `Pallet Recycling` and `PALLETS`) are skipped by negative-stock, warehouse-drift, `qty_mismatch`, and `missing_price`. Default: `Empty Drums`, `Empty Totes`, `MSDS Book`, `Pallets`. |
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
| `type` | string. `DT`, `CT`, `MR`, `ST`, `STx`, `SR`, `AT`, `TT`, `PR`, `FT`, and any later warehouse code. `STx` is distinct from `ST`. Comparisons ignore case, so keep the stored spelling. |
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

Stock effect of a ticket on its `warehouseCode`: `MR`, `PR`, `SR`, and `FT` add `qty`. `DT`, `CT`, `ST`, `STx`, and `TT` subtract `qty`. `AT` uses the signed `qty` as stored. `STx` and `stx` are the same outbound transfer.

### LSD key

`lsdNorm` is the match key. `104/9-26-55-4W4` and `100/09-26-055-04W4/00` both become `9-26-55-4W4`.

The rule is in `lsdNorm` in `functions/inventoryBot/engine.js`:

1. Uppercase and trim.
2. Drop a leading event prefix `1xx/`.
3. Drop a trailing `/` plus a one- or two-digit event.
4. Parse LSD, section, township, range, and meridian. Write them without leading zeros as `{lsd}-{section}-{township}-{range}{W|E}{meridian}`.
5. If that pattern is not present, keep only letters and digits.

Warehouse tickets match app entries by ticket number first. LSD, rig, and the date window are only the fallback.

`ticketNorm` in `functions/inventoryBot/engine.js` uppercases the number and removes whitespace and newlines. `WBFS-DT-000472` with a stray newline is `WBFS-DT-000472`. A missing type segment still matches: `NK-004764` and `NK-DT-004764` are the same digits and prefix. Leading zeros do not matter. Xpress prefixes are not the same strings as the warehouse codes, so these prefixes are aliases: `NK` with `CANNK`, and `BRKS` with `SBBRK`. Only those two alias pairs are fuzzy prefixes. A supplier reference with no hyphen, such as `DW2632`, is not a warehouse ticket number and is never matched by digits alone. A fuzzy number that hits both an Xpress ticket and a MIM ticket is rejected. A supplier reference such as `DW2632` is never line-compared with a warehouse ticket, including by LSD and date. Quantity is compared only when the normalized numbers match.

A number with no letters, such as `191562`, is a third-party supplier delivery. It is stored and is not expected to exist in Xpress or MIM.

A ticket matches a well on `lsdNorm` when the ticket number did not find an app entry. If several wells share that LSD, the rig number (digits only, so `Rig 0245` and `245` match) picks the well. If the LSD matches nothing and exactly one well has that rig, the rig is used.

## Stock

`inventoryBot/main/stock/{date}_{source}_{warehouseCode}`

| Field | Type |
| --- | --- |
| `date` | `YYYY-MM-DD` |
| `source` | `xpress` or `mim` |
| `company` | `uniqenergy` or `alchem` |
| `warehouseCode` | string |
| `warehouseName` | string |
| `items` | `{ code, productId, name, unit, unitWeight, onHand, committed, inTransit, available, variants }[]`. `code` is often blank. Yesterday and today are matched on the first of `code`, `productId`, or `name`, compared after lowercasing and stripping punctuation. `variants` is an optional list of merged pack sizes (`name`, `unit` or `pack` or `size`, and `qty` or `onHand`). |

Optional movement on each item, or a parallel `movement` array of the same shape: `{ code, openBal, mr, st, ct, dt, at, closeBal }`. Checks explain the on-hand change from tickets. They flag negative `onHand` or `available`, and any change the tickets do not explain.

## Wells

`inventoryBot/main/wells/{mirrorWellId}`

| Field | Type |
| --- | --- |
| `name` | string |
| `lsd`, `lsdNorm` | string |
| `rig` | string |
| `contractor`, `operator`, `province` | string |
| `status` | string. `paused`, `inactive`, `released`, `completed`, `completed-reviewed`, `closed`, and `suspended` are inactive. Any status that starts with `completed` is inactive too. |
| `spudDate` | `YYYY-MM-DD` or null |
| `pricelist` | string |
| `lastReportId` | string. `newestReportId` is used when this is blank. |
| `lastReportDate` | `YYYY-MM-DD` or null |
| `newestReportId` | string, optional mirror id of the newest report |
| `openingReportId` | string, optional |
| `openingReportDate` | `YYYY-MM-DD` or null, optional |
| `openingRemaining` | `{ product, qty, price }[]`, optional. Used when `remainingSource` is `opening`, or when `remaining` is absent. |
| `remainingSource` | string, optional. `opening` selects `openingRemaining`. |
| `remaining` | `{ product, qty, price }[]` from the latest mirror report's `remainingInventoryAfterReport` |
| `received`, `returned`, `used` | `{ product, qty, date?, price?, description?, rawTicket? }[]` from that same report. `date` is `YYYY-MM-DD` when the report has one. |
| `costs` | Latest report costs: `dailyProductCost`, `totalProductCost`, `dailyServiceCost`, `totalServiceCost`, `dailyTotalCost`. Numbers. |
| `services`, `otherServices` | Arrays copied from `inventory.services` and `inventory.otherServices` |
| `initials` | string, from `inventory.initials` |
| `updatedAt` | ISO string |

`received` and `returned` on the well are the latest report's product totals. The ticket-numbered lines belong in `appTickets`. A `description` or `rawTicket` on a well line is still parsed, so either place works.

## App tickets

`inventoryBot/main/appTickets/{wellId}_{reportId}_{received|returned}-{n}`

One document per `received.<n>` or `returned.<n>` line on a mud report. The id suffix is `received-0` or `returned-3` (the mirror index). `wellId` and `reportId` are also stored as fields. If `kind` is omitted, the suffix supplies it.

| Field | Type |
| --- | --- |
| `wellId` | string, the well document id |
| `reportId` | string, the mirror report id |
| `kind` | `received`, `returned`, `transferIn`, or `transferOut` |
| `rawTicket` | string, the ticket token only, with whitespace removed |
| `ticketNorm` | string, the cleaned ticket (`NK-DT-004764`, `NK-004764`, `191562`, or the transfer id) |
| `date` | `YYYY-MM-DD`, from `receiveddate` or `returneddate` |
| `lines` | `{ name, unit, price, qty }[]` from `receiveddetail` or `returneddetail`. `qty` is the `received` or `returned` amount. `price` is the detail price. |
| `otherWellUWI` | string, normalized LSD when the line is a rig-to-rig transfer, otherwise `""` |
| `description` | optional original text |

How to read `description`:

| Text | `kind` | `rawTicket` |
| --- | --- | --- |
| `Ticket:WBFS-DT-000488,Delivery from Elk Point Warehouse` | `received` when it is under `received` | `WBFS-DT-000488` |
| `Ticket:NK-004764,...` | `received` | `NK-004764` |
| `Ticket:WBFS-DT-000472` plus a newline before the comma | `received` | `WBFS-DT-000472` |
| `Ticket:BRKS-CT-000174,Products returned to Whse via Smithbrook` | `returned` | `BRKS-CT-000174` |
| `Ticket:191562,Tiger Calcium Delivery of Heavy Brine` | `received` | `191562` |
| `Transfer-To Ticket: <ts>_transferTo_by-<email>,Transferring from FromWell (<name> at <UWI>...` | `transferIn` | the token before the comma. `otherWellUWI` is the UWI in the text. |
| `Transfer-From Ticket: ...,Transferred inventory from the well: <name>,<UWI>, to the ImportedToWell: <name>` | `transferOut` | the token before the comma. `otherWellUWI` is the UWI in the text. |

`received.<n>` is `received` unless the text starts with `Transfer-To Ticket:` (`transferIn`) or the token contains `-CT-` (`returned`). `returned.<n>` is `returned` unless the text starts with `Transfer-From Ticket:` (`transferOut`).

## Products

`inventoryBot/main/products/{key}`

| Field | Type |
| --- | --- |
| `name` | string, canonical. Mirror products use ids `app_<name>`, for example `app_elixir`. The id is only a key; matching still uses codes and names. |
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
| `summary.appProductCost`, `summary.appServiceCost`, `summary.appTotalCost` | numbers, sum of `costs.dailyProductCost`, `dailyServiceCost`, and `dailyTotalCost` on wells whose `lastReportDate` is this date |
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

1. `delivered_not_logged` (high). A `DT` older than `graceDays`, whose report date is on or after the ticket, with no app entry for that ticket number and no matching `received` product. A fuzzy ticket number still counts as logged.
2. `logged_no_ticket` (medium). An app ticket line, or the increase in a product since the previous mud report, has no warehouse ticket. The latest report's received and returned arrays are cumulative since spud, so they are not compared with the short ticket window. When `appTickets` exist for that well, those per-ticket lines are used and the cumulative rows are not lifted again. A supplier reference is not this rule.
3. `qty_mismatch` (medium). Line quantities are compared only after the app ticket number matches a warehouse ticket (exact, missing type segment, or the `NK`/`CANNK` and `BRKS`/`SBBRK` aliases). A supplier number is not compared with nearby tickets. Names in `ignoreStockNames`, including pallets, empty drums, empty totes, and MSDS books, are skipped here and on `missing_price`. Return tickets are `SR` and `CT`.
4. `ticket_typo` (low). The app number matches only after allowing a missing type segment, different zero padding, or a prefix alias (`NK` / `CANNK`, `BRKS` / `SBBRK`). Dollar value is zero.
5. `transfer_mismatch` (medium). Transfer-To quantity differs from Transfer-From, or one side has no pair. Pairs share the timestamp before `_transfer`, or each entry's LSD is the other well, or they are the same product and the same quantity within one day. A transfer that stays on one well is not a pair. A small LSD difference such as `1-14-74-25` and `1-10-74-25` still pairs when the product and quantity agree.
6. `lost_on_rig_move` (high). On the same contractor and rig number, every product still remaining on the old well is compared with the new well. The carried quantity for a product is the larger of what arrived on a Transfer-To or other carried-over entry and what that product shows on the new well's opening inventory or first report. Each product with a shortfall is its own issue, for the quantity difference. A delivery ticket on the new well does not clear it. Rig `245` for two contractors is not a move. `should_be_returned` is suppressed only for a product that this rule already flagged or whose carried quantity covers the old remaining quantity. Other products on that well are still flagged.
7. `should_be_returned` (medium). The well is inactive, or the last report is older than `staleReportDays`, remaining is above zero, and no `SR`, `ST`, `STx`, or `TT` for that product is dated on or after the report.
8. `warehouse_drift` (high when on-hand or available is negative, otherwise medium). The text names `on hand` or `available` according to which field is negative. The on-hand change between the two latest snapshots on or before the date is not the signed ticket quantity between those dates.
9. Money. Every issue carries `dollarValue`. The price is the app line price when the mud report has one, otherwise the pricelist (or cost, when config says so). `missing_price` (low) flags a priced product on a `DT` that has no pricelist price. Lines that are not linked to a product are one `Unpriced items` issue for the day, not one issue per line. `summary.mimTtCharges` sums that day's MIM `TT` charges. `summary.appProductCost`, `summary.appServiceCost`, and `summary.appTotalCost` sum the daily cost fields from reports dated that day.

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

Set `checksRequestedAt` on `inventoryBot/main/runs/{YYYY-MM-DD}` to a new ISO timestamp after the day's documents are written. `inventoryBotRunWritten` watches that document and runs the checks when `checksRequestedAt` is created or changed. The checks write `summary` and `checkedAt` only, so that write does not request another run. No Auth token and no App Check token are required for this path.

`inventoryBotRunChecks` is still available. It does not use App Check, because a script is not the web app. It still requires a signed-in super admin.

1. Write tickets, stock, wells, products, `appTickets`, and `runs/{date}.sources` with the Admin SDK.
2. Upload PDFs.
3. Set `runs/{date}.checksRequestedAt` to a new ISO timestamp. `inventoryBotRunWritten` runs the checks.

The callable remains for a super admin or a script that already has an ID token:

```bash
curl -s -X POST \
  "https://us-central1-uniqenergy-de71c.cloudfunctions.net/inventoryBotRunChecks" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data":{"date":"2026-11-02"}}'
```

Omit `date` to check today in America/Edmonton. The response is `{ date, summary, issueCount }`. Run it again after a correction; resolved and ignored issues are kept.

A super admin can also run the same callable from a signed-in session. The Today screen reads the result. It does not start the collector.
