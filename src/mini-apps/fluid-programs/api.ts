import { httpsCallable } from "firebase/functions";
import { functions } from "../../core/firebase";

export interface SessionMessage { id: string; role: "user" | "assistant"; text: string; createdAt: string }

export async function sendSessionMessage(messages: SessionMessage[], text: string, mutationId: string) {
  const callable = httpsCallable<{ messages: Pick<SessionMessage, "role" | "text">[]; text: string; mutationId: string }, { answer: string; remaining: number }>(functions, "sendFluidProgramsMessage");
  return (await callable({ messages: messages.map(({ role, text: content }) => ({ role, text: content })), text, mutationId })).data;
}
