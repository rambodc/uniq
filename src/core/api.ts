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
export type TicketLine = { code: string; name: string; qty: number; unitWeight?: number | null; weight?: number | null };
export type TicketCharge = { service: string; qty: number; billingMethod: string; price: number; total: number };
export type TicketSummary = { id: string; source: string; company: string; type: string; warehouseCode: string; warehouseName: string; rig: string; lsd: string; lsdNorm: string; customer: string; wellName: string; shippedAt: string | null; postedAt: string | null; total: number | null; hasPdf: boolean };
export type InventoryTicket = TicketSummary & { orderedBy: string; carrier: string; poAfe: string; refTicket: string; relatedTickets: string[]; lines: TicketLine[]; charges: TicketCharge[]; collectedAt: string | null; runId: string };
export type StockItem = { code: string; name: string; unitWeight: number | null; onHand: number | null; committed: number | null; inTransit: number | null; available: number | null; previousOnHand: number | null; delta: number | null };
export type WarehouseStock = { id: string; date: string; source: string; company: string; warehouseCode: string; warehouseName: string; previousDate: string | null; items: StockItem[] };
export type InventoryChatMessage = { id?: string; role: "user" | "assistant"; content: string; createdAt: string | null };
export type TicketFilters = { query?: string; source?: string; company?: string; type?: string; warehouseCode?: string; rig?: string; lsd?: string; from?: string; to?: string };

export const inventoryBotGetToday = (date?: string) => invoke<{ date?: string }, InventoryToday>("inventoryBotGetToday", { date });
export const inventoryBotUpdateIssue = (issueId: string, status: InventoryIssueStatus, note: string) => invoke<{ issueId: string; status: InventoryIssueStatus; note: string }, InventoryIssue>("inventoryBotUpdateIssue", { issueId, status, note });
export const inventoryBotListWells = () => invoke<undefined, { wells: WellSummary[] }>("inventoryBotListWells");
export const inventoryBotGetWell = (wellId: string, date?: string) => invoke<{ wellId: string; date?: string }, { well: InventoryWell; rigInventory: RigInventory | null; tickets: TicketSummary[]; appTickets: AppTicketEntry[] }>("inventoryBotGetWell", { wellId, date });
export const inventoryBotListTickets = (filters: TicketFilters) => invoke<TicketFilters, { tickets: TicketSummary[] }>("inventoryBotListTickets", filters);
export const inventoryBotGetTicket = (ticketId: string) => invoke<{ ticketId: string }, InventoryTicket>("inventoryBotGetTicket", { ticketId });
export const inventoryBotTicketUrl = (ticketId: string) => invoke<{ ticketId: string }, { url: string; expiresAt: string }>("inventoryBotTicketUrl", { ticketId });
export const inventoryBotListWarehouses = () => invoke<undefined, { warehouses: WarehouseStock[] }>("inventoryBotListWarehouses");
export const inventoryBotListChat = () => invoke<undefined, { messages: InventoryChatMessage[] }>("inventoryBotListChat");
export const inventoryBotChat = (message: string) => invoke<{ message: string }, { reply: string }>("inventoryBotChat", { message });

export const setMyPhoto = (photo: { photo: string; thumb: string }) => invoke<typeof photo, { photo: string }>("setMyPhoto", photo);
export const removeMyPhoto = () => invoke("removeMyPhoto");
export const getMyPhoto = () => invoke<undefined, { dataUrl: string | null }>("getMyPhoto");
