import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, BrainCircuit, Send } from "lucide-react";
import type { NavigateFunction } from "react-router-dom";
import { sendSessionMessage, type SessionMessage } from "./api";
import "./fluid-programs.css";

export default function FluidPrograms({ navigate }: { navigate: NavigateFunction }) {
  const [messages, setMessages] = useState<SessionMessage[]>([]), [message, setMessage] = useState(""), [remaining, setRemaining] = useState<number | null>(null), [sending, setSending] = useState(false), [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, sending]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || sending || remaining === 0) return;
    const mutationId = crypto.randomUUID(), now = new Date().toISOString();
    setMessage(""); setError(""); setSending(true);
    try {
      const result = await sendSessionMessage(messages, text, mutationId);
      setMessages((current) => [...current, { id: `${mutationId}-user`, role: "user", text, createdAt: now }, { id: `${mutationId}-assistant`, role: "assistant", text: result.answer, createdAt: new Date().toISOString() }]);
      setRemaining(result.remaining);
    } catch (requestError) {
      const code = String((requestError as { code?: string }).code || "");
      setMessage(text);
      setError(code.includes("resource-exhausted") ? "Your daily allowance is full or another request is still running." : code.includes("already-exists") ? "That message was already processed. Refresh to begin a clean session." : "The assistant could not answer. Nothing was saved; try again.");
    } finally { setSending(false); }
  };
  return <main className="programs-shell"><header><div className="programs-navigation"><div className="programs-brand"><img src="/brand/uniqenergy-mark-64.png" alt="UniqEnergy"/><span>UniqEnergy / Fluid Programs</span></div><button onClick={() => navigate("/portal")}><span>Back to mini apps</span><ArrowLeft/></button></div><small>{remaining == null ? "Up to 50 messages daily" : `${remaining} of 50 messages remaining today`}</small></header><section className="programs-workspace session-only"><aside><BrainCircuit/><h1>Fluid Programs</h1><p>Ask about drilling-fluid systems, properties, testing, and troubleshooting.</p><div className="programs-notice"><strong>Private session</strong><span>This conversation is not stored and disappears when you refresh or leave.</span></div><div className="programs-notice"><strong>Educational assistant</strong><span>Field decisions and treatment programs require review by a qualified drilling-fluids engineer using current well data.</span></div></aside><section className="chat-panel"><div className="chat-messages" aria-live="polite">{messages.length === 0 && <div className="chat-empty"><BrainCircuit/><h2>Start a drilling-fluid conversation</h2><p>Your messages stay only in this browser session.</p></div>}{messages.map((item) => <article key={item.id} className={item.role}><span>{item.role === "user" ? "You" : "Fluid Programs"}</span><p>{item.text}</p><time>{new Date(item.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></article>)}{sending && <article className="assistant typing"><span>Fluid Programs</span><p><i/><i/><i/></p></article>}<div ref={bottom}/></div>{error && <div className="chat-error" role="alert">{error}</div>}<form className="chat-composer" onSubmit={submit}><textarea value={message} maxLength={4000} rows={2} placeholder="Ask about drilling fluids…" onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/><button aria-label="Send message" disabled={!message.trim() || sending || remaining === 0}><Send/></button></form></section></section></main>;
}
