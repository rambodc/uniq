import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { MiniAppId, UserType } from "../auth/miniApps";

const isRead = (name: string) => /^(list|get)[A-Z]/.test(name);
const retryable = (error: unknown) => /deadline-exceeded|unavailable|internal/.test(String((error as { code?: string })?.code ?? ""));
async function invoke<TRequest, TResponse>(name: string, data?: TRequest) {
  const call = () => httpsCallable<TRequest, TResponse>(functions, name, { timeout: isRead(name) ? 20_000 : 30_000 })(data as TRequest);
  try { return (await call()).data; } catch (error) {
    if (!isRead(name) || !retryable(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 800));
    return (await call()).data;
  }
}

export function messageOf(error: unknown, fallback: string) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "";
  if (!message || code.endsWith("internal")) return fallback;
  return message;
}

export type InquiryLegacy = Record<string, unknown>;
export type Inquiry = { id: string; inquiryType: string; productName?: string; name: string; email?: string; company?: string; phone?: string; message: string; createdAt: string | null; archived: boolean; legacy?: InquiryLegacy };
export type InquiryList = { inquiries: Inquiry[]; total: number; nextCursor: null };
export const listContactInquiries = (data: { archived: boolean; query?: string }) => invoke<typeof data, InquiryList>("listContactInquiries", data);
export const archiveContactInquiry = (inquiryId: string) => invoke("archiveContactInquiry", { inquiryId });
export const restoreContactInquiry = (inquiryId: string) => invoke("restoreContactInquiry", { inquiryId });

export type Profile = { firstName: string; lastName: string; email: string; photo: string | null };
export type Access = { type: UserType | null; miniApps: MiniAppId[]; profile: Profile | null };
export const getAccess = () => invoke<undefined, Access>("getAccess");

export type InviteStatus = "sent" | "delivered" | "delayed" | "bounced" | "complained" | "failed";
export type UserInvite = { status: InviteStatus; at: string | null; by: string; error: string | null; checkedAt: string | null };
export type InviteResult = { sent: true; id: string } | { sent: false; reason: string };
export type UserRecord = { uid: string; firstName: string; lastName: string; photo: string | null; email: string; type: UserType; miniApps: MiniAppId[]; disabled: boolean; createdAt: string | null; updatedAt: string | null; createdBy: string; invite: UserInvite | null; lastSignInAt: string | null; you: boolean };
export type UserInput = { firstName: string; lastName: string; email: string; type: UserType; miniApps: MiniAppId[] };
export const listUsers = () => invoke<undefined, { users: UserRecord[] }>("listUsers");
export const createUser = (data: UserInput) => invoke<typeof data, { uid: string; email: string; invite: InviteResult }>("createUser", data);
export const updateUser = (uid: string, data: UserInput) => invoke("updateUser", { uid, ...data });
export const setUserDisabled = (uid: string, disabled: boolean) => invoke("setUserDisabled", { uid, disabled });
export const sendUserInvite = (uid: string) => invoke<{ uid: string }, { invite: InviteResult }>("sendUserInvite", { uid });

export type InventorySeverity = "high" | "medium" | "low";
export type InventoryIssueStatus = "open" | "resolved" | "ignored";
export type InventoryIssue = { id: string; date: string; rule: string; severity: InventorySeverity; title: string; detail: string; wellId: string; rig: string; lsd: string; ticketIds: string[]; products: { name: string; qty: number; value: number }[]; dollarValue: number; status: InventoryIssueStatus; note: string; resolvedBy: string; resolvedAt: string | null };
export type InventorySourceStatus = { ok: boolean; counts?: Record<string, number>; error?: string };
export type InventorySummary = { text: string; issueCounts: { high: number; medium: number; low: number; open: number }; dollarsAtRisk: number; mimTtCharges: number };
export type InventoryRun = { date: string; startedAt: string | null; finishedAt: string | null; checkedAt: string | null; sources: Record<string, InventorySourceStatus>; summary: InventorySummary | null };
export type InventoryConfig = { graceDays: number; valuation: string; receivedWindowDays: number; staleReportDays: number };
export type InventoryToday = { date: string; config: InventoryConfig; run: InventoryRun | null; issues: InventoryIssue[] };
export type WellSummary = { id: string; name: string; lsd: string; rig: string; status: string; operator: string; lastReportDate: string | null; remainingCount: number };
export type WellLine = { product: string; qty: number; date?: string | null; price?: number };
export type AppTicketEntry = { id: string; kind: string; rawTicket: string; ticketNorm: string; date: string | null; otherWellUWI: string; lines: { name?: string; product?: string; qty: number; price?: number | null; unit?: string }[] };
export type InventoryWell = { id: string; name: string; lsd: string; lsdNorm: string; rig: string; contractor: string; operator: string; province: string; status: string; spudDate: string | null; pricelist: string; lastReportId: string; lastReportDate: string | null; remaining: WellLine[]; received: WellLine[]; returned: WellLine[]; used: WellLine[]; costs?: { dailyProductCost?: number; totalProductCost?: number; dailyServiceCost?: number; totalServiceCost?: number; dailyTotalCost?: number } | null; updatedAt: string | null };
export type RigInventory = { id: string; date: string; wellId: string; rig: string; name: string; expected: { product: string; qty: number }[]; appRemaining: { product: string; qty: number }[]; diff: { product: string; qty: number }[]; ticketIds?: string[] };
export type TicketLine = { code: string; name: string; qty: number; unit?: string | null; unitWeight?: number | null; weight?: number | null; description?: string | null; productId?: string | null };
export type TicketCharge = { service: string; qty: number; billingMethod: string; price: number; total: number };
export type TicketSummary = { id: string; source: string; company: string; type: string; warehouseCode: string; warehouseName: string; rig: string; lsd: string; lsdNorm: string; customer: string; wellName: string; shippedAt: string | null; postedAt: string | null; total: number | null; hasPdf: boolean };
export type InventoryTicket = TicketSummary & { orderedBy: string; carrier: string; poAfe: string; refTicket: string; lsdGrid?: string; pdfPath?: string; relatedTickets: string[]; lines: TicketLine[]; charges: TicketCharge[]; collectedAt: string | null; runId: string };
export type StockVariant = { name?: string; unit?: string; pack?: string; size?: string; qty?: number; onHand?: number; quantity?: number };
export type StockItem = { key?: string; code: string; productId?: string; name: string; unit?: string; unitWeight: number | null; onHand: number | null; committed: number | null; inTransit: number | null; available: number | null; previousOnHand: number | null; delta: number | null; variants?: StockVariant[] };
export type WarehouseStock = { id: string; date: string; source: string; company: string; warehouseCode: string; warehouseName: string; previousDate: string | null; items: StockItem[] };
export type InventoryChatMessage = { id?: string; role: "user" | "assistant"; content: string; createdAt: string | null };
export type TicketFilters = { query?: string; source?: string; company?: string; type?: string; warehouseCode?: string; rig?: string; lsd?: string; from?: string; to?: string };

export type TicketCoverageStatus = "logged" | "pending" | "overdue" | "mismatch" | "not_well_bound";
export type TicketCoverage = { id: string; date: string; ticketDate?: string; ticketId: string; number: string; source: string; company: string; type: string; warehouseCode: string; rig: string; lsd: string; ageDays: number; dollarValue: number; wellId: string; wellName: string; reportId: string; appTicketId: string; lagDays: number | null; match: string; escalate: boolean; status: TicketCoverageStatus; reason: string; auto?: boolean; locationNote?: { severity: "low"; text: string } | null; state?: string; staleSince?: string | null };
export type ReviewItem = { id: string; date?: string; kind: string; title: string; detail?: string; reason?: string; wellId?: string; wellName?: string; dollarValue?: number; auto?: boolean; category?: string; series?: string; numbers?: number[]; rawTicket?: string; warehouseCode?: string; state?: string; staleSince?: string | null };
export type FlagNote = { at: string; by: string; text: string };
export type FlagStatus = "new" | "seen" | "watching" | "done";
export type InventoryFlag = { id: string; entityType: string; entityId: string; status: FlagStatus; notes: FlagNote[]; forGrokBot: boolean; grokBotReply: string; updatedAt: string };
export type CoverageWell = { id: string; name: string; lsd: string; lsdNorm: string; rig: string; contractor: string; status: string; operator: string; lastReportDate: string | null; lat: number | null; lon: number | null };
export type InventoryCoverage = { date: string; tickets: TicketCoverage[]; reviews: ReviewItem[]; wells: CoverageWell[]; flags: InventoryFlag[] };
export type XpressTicket = { id: string; number: string; type: string; date: string; customer: string; shipTo: string; rig: string; lsd: string; value: number; return: boolean; lines: { name: string; qty: number; unit: string; price: number }[]; suggestion: { cardId: string; reason: string; confidence: string } | null };
export type WellCandidate = { id: string; name: string; lsd: string; rig: string; operator?: string; status?: string };
export type XpressCard = { id: string; name: string; operator: string; lsd: string; lsdNorm: string; rig: string; ticketCount: number; totalValue: number; tickets: XpressTicket[]; status: { tone: "green" | "amber" | "red" | "grey"; label: string }; link: { state: "linked" | "suggested" | "none"; appWellId: string; reason: string; source: string; name?: string; candidates?: WellCandidate[]; citedWellIds?: string[]; grok?: { appWellId: string; name?: string; reason: string } | null }; match: { matched: number; waiting: number; missing: number; compared: boolean } };
export type AppWellOption = { id: string; name: string; lsd: string; lsdNorm: string; rig: string; operator: string; status: string };
export type XpressBoard = { cards: XpressCard[]; unassigned: XpressTicket[]; warehouseOnly?: number; pulledAt: string; directory: { reads: number; added: number; operators?: number; cardsAsked?: number; error: string; linkError?: string }; appWells: AppWellOption[] };
export type OpenXpressWell = { appWell: AppWellOption | null; appTickets: { reportId: string; reportNumber?: string; index: string; date: string; rawTicket: string; kind: string; products: number; warehouse: boolean; description: string; lines?: { name: string; qty: number; unit: string }[] }[]; tickets: (XpressTicket & { inApp?: string })[]; match: { matched: number; missing: number; waiting: number }; reads: { well: number; reports: number; reportCount: number }; unavailable?: boolean; note?: string };
export const inventoryBotXpressBoard = () => invoke<undefined, XpressBoard>("inventoryBotXpressBoard");
export const inventoryBotMoveTicket = (data: { ticketId: string; cardId?: string; create?: { name: string; operator?: string; lsd?: string; rig?: string } }) => invoke<typeof data, { ok: boolean; cardId: string }>("inventoryBotMoveTicket", data);
export const inventoryBotLinkAppWell = (data: { cardId: string; appWellId: string; appWellName?: string }) => invoke<typeof data, { ok: boolean }>("inventoryBotLinkAppWell", data);
export const inventoryBotOpenXpressWell = (cardId: string) => invoke<{ cardId: string }, OpenXpressWell>("inventoryBotOpenXpressWell", { cardId });
export const inventoryBotGrokSort = () => invoke<undefined, { suggestions: { ticketId: string; cardId: string; confidence: string; reason: string }[]; accepted: number }>("inventoryBotGrokSort");

export const setMyPhoto = (photo: { photo: string; thumb: string }) => invoke<typeof photo, { photo: string }>("setMyPhoto", photo);
export const removeMyPhoto = () => invoke("removeMyPhoto");
export const getMyPhoto = () => invoke<undefined, { dataUrl: string | null }>("getMyPhoto");
