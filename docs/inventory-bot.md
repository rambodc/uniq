# Inventory Bot

Inventory Bot is a private mini app (`inventoryBot`, route `/inventory-bot`). Super admins always have it. Staff have it only when `users/{uid}.miniApps` includes `inventoryBot`.

The screen is the Xpress tab: well cards grouped from stored Xpress tickets by normalized LSD and rig. Tickets with neither, and placeholder rig labels with no LSD, go to Unassigned. Warehouse receipts (`MR`) and stock transfers (`ST`) are not field deliveries and are left off the board. A manual move is stored on `placements/{ticketId}` and wins over that grouping. `xpressCards/{id}` stores a created card and the app-well link. `appWells/{wellId}` is a slim directory (name, LSD, rig, contractor, operator, status) for mirror wells whose ids start in the last three months. The mirror is `https://uniqenergymirror.firebaseio.com`. The daily top-up is a shallow key listing of `data/wells` starting after the last stored id, then one read of each small field (`name`, LSD, rig, contractor, `operator_name`, status) for each new id. A day with no new well is that key listing only, a few hundred bytes. A day with a couple of new wells stays under about 5 KB. Opening a linked card reads those same scalar fields, then a shallow list of report ids and, for the latest 30, only `date`, `reportNumber`, `inventory/received`, and `inventory/returned`. It does not download the rest of the report or the well's child trees, and it does not copy the reports into Firestore. An unlinked card says why: more than one app well shares the LSD, the location is close but not the same (including a W4 versus W0 meridian typo, with a rig match ranked first), or no app well was found. At most three candidates are listed, and a shared operator is used only when nothing is close. A card with two or three candidates reads each candidate's slim reports once and stores the result. A well whose reports cite one of the card's warehouse tickets is ranked first, and the card links to it when it is the only one that does. Ties stay alphabetical. A Di-Corp `CC-Rig` label is not the drilling rig. Candidates are listed on the card before Grok is asked. Opening the board asks Grok once per still-unlinked card that has not been asked before. Let Grok check leftovers does that same once-only pass, and it also places unassigned tickets that have no saved suggestion. MIM is shown as coming next. The check trigger, the old list and chat callables, and the copied wells, app tickets, issues, rig inventory, ticket status, review items, flags, and chats are retired. Collectors still write Xpress and MIM tickets and warehouse stock. `functions/scripts/remove-old-inventory-data.mjs` deletes the retired collections.

Browsers cannot read Firestore or Storage. Every screen goes through a callable, and every callable enforces App Check. Rules stay deny-all.

The morning collector runs outside this repo, with the Admin SDK and owner credentials. It writes tickets and stock. It does not start a check run.

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
| `config.ignoreStockNames` | string[] | The resolved product name, or the line name as whole words, matches one of these (a trailing plural matches the singular, so `Pallets` covers `Pallet Recycling` and `PALLETS`, and `Stretch Wrap` covers `STRETCHWRAPS`). A pack note such as `40/PALLET` does not match. Skipped by negative-stock, warehouse-drift, `qty_mismatch`, `missing_price`, `lost_on_rig_move`, `should_be_returned`, and the ticket-status quantity comparison. Default: `Empty Drums`, `Empty Totes`, `MSDS Book`, `Pallets`, `Shrink Wrap`, `Stretch Wrap`. |
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

Stock effect of a ticket on its `warehouseCode`: `MR`, `PR`, `SR`, `FT`, and `CT` add `qty`. `DT` subtracts `qty`. `ST` and `STx` subtract `qty` unless `direction` is inbound. `TT` moves stock only when `direction` is inbound or outbound; otherwise it is a charge and does not change on hand. `AT` uses the signed `qty` as stored. `STx` and `stx` are the same transfer.

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
| `xpressCodes`, `mimCodes`, `appNames`, `xpressNames`, `mimNames`, `aliases` | string[] |
| `unit` | string |
| `price` | number, pricelist dollars per unit |
| `cost` | number |
| `confirmed` | boolean |

Matching uses a warehouse code first, then a normalized name (`Elixir 100` and `elixir-100` match). A line named `Bleach` whose unit is about 1000 L matches the product `Bleach (Tote)` when that product exists. Unknown names still compare by that normalized text.

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
| `summary.coverage` | `{ counts, dollarsAtRisk, reviewCount }` from the coverage pass. `counts` is the ticket-status tally. `reviewCount` is the number of `reviewItems` documents written for that run, taken from that written set. A mismatch stays on `ticketStatus` and is not a review item. |

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

`issues/{id}`. The id is `{date}_{rule}_{first 12 hex of sha1(entity ids)}_{product slug}`. Well ids and ticket ids are the hashed entity ids. The product slug is not cut off. If that id is already used by a different issue, a `_2`, `_3`, … suffix is appended.

| Field | Type |
| --- | --- |
| `date` | `YYYY-MM-DD` |
| `rule` | `delivered_not_logged`, `logged_no_ticket`, `qty_mismatch`, `lost_on_rig_move`, `should_be_returned`, `warehouse_drift`, or `missing_price` |
| `severity` | `high`, `medium`, or `low` |
| `title`, `detail` | string |
| `wellId`, `rig`, `lsd` | string, empty when the rule is not about a well |
| `ticketIds` | string[] |
| `products` | `{ name, qty, value }[]` |
| `dollarValue` | number. Lines are grouped by product and pack size. Sizes within about 15% in the same family share one canonical bucket (`19L` with `20L`, `22.68kg` with `22.7kg`), and that bucket is the pack in the issue id. A 1000 L tote stays separate from a 19 L pail, and each pack keeps its own price. The app line's own `price` (or `unitCost`) is used first. The pricelist, or `cost` when config says so, is used only when that price is missing and the product unit is within about 15%. A 1000 L price is not used on a 19 L line. |
| `status` | `open`, `resolved`, or `ignored` |
| `note` | string |
| `resolvedBy` | email, or empty |
| `resolvedAt` | ISO string or null |

Rules:

1. `delivered_not_logged` (high). A `DT` older than `graceDays`, whose report date is on or after the ticket, with no app entry for that ticket number and no matching `received` product. A fuzzy ticket number still counts as logged.
2. `logged_no_ticket` (medium). An app ticket line, or the increase in a product since the previous mud report, has no warehouse ticket. The latest report's received and returned arrays are cumulative since spud, so they are not compared with the short ticket window. When `appTickets` exist for that well, those per-ticket lines are used and the cumulative rows are not lifted again. A supplier reference is not this rule.
3. `qty_mismatch` (medium). Line quantities are compared only after the app ticket number matches a warehouse ticket (exact, missing type segment, or the `NK`/`CANNK` and `BRKS`/`SBBRK` aliases). Pack sizes in the same family within about 15% are one pack (`22.68 kg` and `22.7 kg`, `19 L` and `20 L`, `19 L` and `18.93 L`, `6.8 kg` and `7.3 kg`). A 1000 L tote stays separate from a 19 L pail. A supplier number is not compared with nearby tickets. Names in `ignoreStockNames`, including pallets, empty drums, empty totes, and MSDS books, are skipped here and on `missing_price`. Return tickets are `SR` and `CT`.
4. `ticket_typo` (low). The app number matches only after allowing a missing type segment, different zero padding, or a prefix alias (`NK` / `CANNK`, `BRKS` / `SBBRK`). Dollar value is zero.
5. `transfer_mismatch` (medium). One issue per transfer, from the sending well to the receiving well on that date, listing every product line and the summed dollars. Transfer-To quantity differs from Transfer-From, or one side has no pair. Pairs share the timestamp before `_transfer`, or each entry's LSD is the other well, or they are the same product and the same quantity within one day. A transfer that stays on one well is not a pair. A small LSD difference such as `1-14-74-25` and `1-10-74-25` still pairs when the product and quantity agree. When the sending well is not in `wells` (for example LSD `13-20-63-3W4`), the issue is low severity, titled `Transfer sender not loaded`, and its dollars are not added to `dollarsAtRisk`.
6. `lost_on_rig_move` (high). On the same contractor and rig number, every product and pack size still remaining on the old well is compared with the new well. A 1000L tote and a 19L pail of the same chemical are separate lines. The comparison is skipped when the new well has no mud report yet, or when the old well's last report is within `graceDays` of the check date. The carried quantity for a product is the larger of what arrived on a Transfer-To or other carried-over entry and what that product shows on the new well's opening inventory or first report. Each product with a shortfall is its own issue, for the quantity difference. A delivery ticket on the new well does not clear it. Names in `ignoreStockNames` are skipped. Rig `245` for two contractors is not a move. `should_be_returned` is suppressed only for a product that this rule already flagged or whose carried quantity covers the old remaining quantity. Other products on that well are still flagged.
7. `should_be_returned` (medium). The well is inactive, or the last report is older than `staleReportDays`, remaining is above zero, and no `SR`, `ST`, `STx`, or `TT` for that product is dated on or after the report. Names in `ignoreStockNames` are skipped.
8. `warehouse_drift` (high when on-hand or available is negative, otherwise medium). The text names `on hand` or `available` according to which field is negative. The on-hand change between the two latest snapshots on or before the date is not the signed ticket quantity between those dates.
9. Money. Every issue carries `dollarValue`. The same product in two pack sizes stays two lines, each at its own price. The price is the app line's own `price` or `unitCost` when the mud report has one, on every rule. Otherwise the pricelist (or cost, when config says so) is used, and only when the product's unit is within about 15% of the logged pack (`19L` vs `20L`, `22.68kg` vs `25kg`). A tote list price is not applied to a pail line. `missing_price` (low) flags a product on a `DT` that has no pricelist price. Lines that are not linked to a product are one `Unpriced items` issue for the day, not one issue per line. `summary.mimTtCharges` sums that day's MIM `TT` charges. `summary.appProductCost`, `summary.appServiceCost`, and `summary.appTotalCost` sum the daily cost fields from reports dated that day.

## Ticket status, review items, and flags

Checks recompute these every run. Warehouse tickets are the source of truth. A mud report should log the same ticket number within `config.graceDays` (default 3).

`ticketStatus/{ticketId}` is one row per warehouse ticket:

| Field | Type |
| --- | --- |
| `status` | `logged`, `pending`, `overdue`, `mismatch`, or `not_well_bound` |
| `match` | `exact`, `typo`, `alchem`, or `none` |
| `wellId`, `wellName`, `reportId`, `appTicketId` | links when the ticket is logged or has a candidate well |
| `lagDays` | Report date of the first report that logs the ticket, minus the ticket date. The ticket date is the shipped or delivery date when that is present, otherwise `postedAt`. A typed received date is not the lag, and a typed year that is about a year off is ignored. |
| `ageDays` | check date minus ticket date |
| `escalate` | true when an overdue ticket is 7 or more days old |
| `reason` | short explanation. Not-well-bound reasons are receipt, adjustment or blend, warehouse transfer, handling charge, or warehouse sale. |
| `dollarValue` | list price times quantity, using the line price when the line has one |
| `auto` | true when the reason is automatic, such as a receipt or a well-to-well transfer |

Matching order: exact number, then a typo (`NK4806` = `NK-DT-004806`, `BRKS-000537` = `BRKS-DT-000537`), then an Alchem bare number (`11649` = `DTAWEY011649`) when the LSD matches, the sections are adjacent in the same township, range, and meridian, or the contractor and rig agree. Every app line that cites that linked number is matched, including the other product lines for 11649. Those lines are not also queued as `no_ticket_number`. When the number matches and the rig agrees, a different LSD stays `logged` and the row carries `locationNote` (`{ severity: "low", text }`) for a possible typo such as W0 versus W4, a pad versus the well, or a pickup by the customer. Location becomes `mismatch` only when the rig also disagrees. Ship-to, destination, the LSD, and the Xpress grid-location field (`lsdGrid` or `gridLocation`) are read, so `Warehouse Sale` on NK-004804 is not well-bound. Quantity uses the same product resolver as the issue checks (`resolveLine`): codes, names, `xpressNames`, `mimNames`, `aliases`, and the Bleach tote alias (`Bleach` at about 1000 L is `Bleach (Tote)`). Pack size is compared only when both sides have a unit, using the same 15% bucket as the other checks. A line with no unit, which is normal for MIM, is compared by product only. Ignored names are matched on the resolved product, or as whole words, so `CAL CHLORIDE HT POWDER (40kg) 40/PALLET` stays in the comparison. `Pallet Recycling`, `PALLETS`, `Shrink Wrap`, and `Stretch Wrap` / `STRETCHWRAPS` are skipped. Service and charge lines are skipped too: callout, after-hours, handling, delivery charge, fuel surcharge, and TT charges. Mismatch dollars are the differing quantity, not the whole ticket. A mismatch is a ticket status, not a review item.

`reviewItems/{id}` holds the queue: app tickets with no warehouse ticket (`transfer`, `missing_from_pull`, `no_ticket_number`, `unknown_prefix`, `outside_window`), holes in a prefix-and-type series such as `NK-DT` 4805, and stock exceptions (negative on hand, committed above on hand, in transit, and a day-over-day change the tickets do not explain). `BRKS-DT` is not the same series as `BRKS-MR`. For each source and series, a cited number below the lowest loaded ticket number is `outside_window`. `NK4788` is outside the window when the lowest loaded `NK-DT` number is 4804. A cited number in a series that was pulled, but that is not on the warehouse list (`TBAR-DT-001238` when `TBAR-DT` `001237` and `001241` are loaded, or `BRKS-DT-000540` when Xpress stored `BRKS-000540`), is not `missing_from_pull`. The reason is `App cites a ticket the warehouse doesn't have (likely typo or not yet posted)`. `BRKS-000540` and `BRKS-DT-000540` are the same number. `missing_from_pull` is only for a series this run did not check, and only when that source's pull included the same ticket type. A series with no loaded tickets, such as `TBAR-CT` when only other types were pulled, follows the unloaded-series rule: a date before the collection start is `outside_window` (`TBAR-CT-000338` on 29 Oct). Unknown prefixes and lines with no ticket number use that same collection start, the later of `checksStartDate` and the earliest collected ticket date. `auto` is true for expected transfers and for lines outside the collection window. Review ids are a stable hash of source, well, report, date, ticket text, and line content. Each run reconciles every review item that is not in the newly written set, including items left open by an earlier run, and any pre-#31 `app_` slug ids including `_2` and `_3` suffixes. An id that is no longer written is deleted when it has no flag or note, or marked `state: "resolved_auto"` with `staleSince` when it does. The same rule applies to `ticketStatus` documents that are no longer produced. The queue hides auto-closed and stale rows until the show toggle is on. `summary.coverage.reviewCount` is the size of the live set written. Mismatch tickets are not part of that count. A flag on an older review id is copied to the new id when the id changes.

`flags/{entityType}__{entityId}` is one status for a well, ticket, issue, or review item: `new`, `seen`, `watching`, `done`. `notes` is `{ at, by, text }[]` and is only appended. `forGrokBot` marks a note for the next daily check. `grokBotReply` is the assistant's answer. Checks never delete a flag.

### Stock rows the collector should write

`stock/{date}_{source}_{warehouseCode}.items` should omit a line whose on-hand, available, committed, and in-transit quantities are all zero. Keep one zero line only when that item was non-zero on the previous snapshot, so the run-out is visible. `functions/scripts/compact-zero-stock.mjs` does that pass once across every stock document.

Optional well fields for the map: `lat` and `lon` (or `latitude` and `longitude`), decimal degrees. When they are missing the home screen skips the map.

## Chat

`inventoryBot/main/chats/{uid}/messages/{id}`

| Field | Type |
| --- | --- |
| `role` | `user` or `assistant` |
| `content` | string |
| `createdAt` | ISO string |

Grok is `grok-4.3` through `https://api.x.ai/v1/chat/completions`. The key is Secret Manager secret `XAI_API_KEY`, declared with `defineSecret("XAI_API_KEY")` on `inventoryBotXpressBoard` and `inventoryBotGrokSort`. Do not put the key in a dotenv file. The in-app chat and its tools are retired. Grok only places leftover tickets onto a card whose LSD matches exactly, and it suggests one of the candidate app wells for an unlinked card. Each card is sent once.

## PDFs

Upload the file to `inventoryBot/tickets/{source}/{file}.pdf` and store that path on the ticket as `pdfPath`. The board does not mint a signed URL.

## After ingest

1. Write Xpress and MIM tickets, warehouse stock, and products with the Admin SDK.
2. Upload ticket PDFs under `inventoryBot/tickets/{source}/{file}.pdf`.

Do not write `wells`, `appTickets`, `issues`, `rigInventory`, `ticketStatus`, `reviewItems`, `flags`, or `chats`, and do not set `checksRequestedAt`. Those checks are retired. The Xpress board reads tickets from Firestore and reads the app well live from the mirror when a card is opened. The app-well directory refreshes itself, at most once a day, the next time someone opens the board.
