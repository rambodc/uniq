import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../../core/firebase";

export interface Connection { configured: boolean; connected: boolean; email: string | null }
export interface Document { id: string; name: string; mime: string; size: number }
export interface EmailSummary { id: string; subject: string; sender: string; date: string; attachmentCount: number; queued: boolean }
export interface Email extends EmailSummary { body: string; attachments: Document[] }
export interface Candidate { id: string; mailbox: string; messageId: string; subject: string; sender: string; date: string; documents: Document[]; createdAt: string; addedByName: string; notes: string; status: "queued" | "already-entered" | "ignored"; revision: number; deleting?: boolean }
export interface Filters { query: string; from: string; to: string; label: string }
export const invoke = async <T>(name: string, data: unknown = {}) => (await httpsCallable<unknown, T>(functions, name, { timeout: 300000 })(data)).data;
export const connection = () => invoke<Connection>("invoiceQbConnection");
export const connect = () => invoke<{ url: string }>("invoiceQbConnect");
export const disconnect = () => invoke("invoiceQbDisconnect");
export const labels = () => invoke<{ labels: { id: string; name: string }[] }>("invoiceQbLabels");
export const messages = (filters: Filters, cursor: string | null) => invoke<{ messages: EmailSummary[]; cursor: string | null }>("invoiceQbMessages", { ...filters, cursor });
export const message = (id: string) => invoke<Email>("invoiceQbMessage", { id });
export const add = (messageId: string, parts: string[], separate: boolean) => invoke<{ ids: string[] }>("invoiceQbAdd", { messageId, parts, separate });
export const queue = (cursor: string | null = null) => invoke<{ entries: Candidate[]; cursor: string | null }>("invoiceQbQueue", { cursor });
export const queueBody = (id: string) => invoke<{ body: string }>("invoiceQbQueueBody", { id });
export const update = (entry: Candidate, status: Candidate["status"], notes: string) => invoke("invoiceQbUpdate", { id: entry.id, revision: entry.revision, status, notes });
export const remove = (id: string) => invoke("invoiceQbRemove", { id });
export async function documentBlob(part: string, source: { message: string } | { entry: string }) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in again to open documents.");
  const project = auth.app.options.projectId;
  const response = await fetch(`https://us-central1-${project}.cloudfunctions.net/invoiceQbDownload?${new URLSearchParams({ part, ...source })}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Document unavailable. Refresh, check access, or reconnect Gmail.");
  return response.blob();
}
