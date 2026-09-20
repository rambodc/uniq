import type { PageDocument, Asset } from "./EventDocument";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../core/firebase";
export interface Guest {
  id: string;
  email: string;
  name: string;
  rsvp: "pending" | "accepted" | "declined";
  revoked: boolean;
  delivery: string;
  ticket?: string;
  ticketValid?: boolean;
  readOnly?: boolean;
}
export interface Party {
  id: string;
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location: string;
  status: "draft" | "published" | "cancelled";
  archived: boolean;
  coverUrl?: string;
  document?: PageDocument;
  assets?: Asset[];
  guest?: Guest;
}
export async function call<T>(name: string, data: unknown = {}): Promise<T> {
  return (await httpsCallable<unknown, T>(functions, name)(data)).data;
}
export const myParties = () => call<{ parties: Party[] }>("uexMyParties");
export const myParty = (id: string) =>
  call<{ party: Party }>("uexGetMyParty", { id });
export const when = (p: Party) =>
  new Intl.DateTimeFormat("en-CA", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: p.timezone,
  }).format(new Date(p.startsAt));
