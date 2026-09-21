/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, ArrowLeft, Send, ImagePlus, Sparkles } from "lucide-react";
import { call, type PartySummary } from "./api";
import EventDocument, {
  exactTime,
  type PageDocument,
  type Asset,
} from "./EventDocument";
import GuestManager from "./GuestManager";
import "./uex.css";

type BuilderParty = PartySummary & {
  draft: PageDocument;
  published: PageDocument | null;
  revision: number;
  history: { role: string; content: string }[];
  interaction?: { id: string; type: string; prompt: string; options: { label: string; value: string }[]; expiresAt: string } | null;
  sources?: { title: string; url: string }[];
  summary?: string;
  assets: Asset[];
  locationConfirmed?: string;
  timeConfirmed?: string;
  processing?: { until: number };
};
export default function UexApp() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [params, setParams] = useSearchParams(),
    id = params.get("party");
  const [parties, setParties] = useState<PartySummary[]>([]),
    [party, setParty] = useState<BuilderParty | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState("chat"),
    [progress, setProgress] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null),
    chatEnd = useRef<HTMLDivElement>(null);
  const load = async () => {
    if (id) {
      const result = (await call<{ party: BuilderParty }>("uexBuilder", { id }))
        .party;
      setParty({
        ...result,
        name: result.draft.title,
        startsAt: result.draft.startsAt,
        endsAt: (result.published || result.draft).endsAt,
        timezone: result.draft.timezone,
      });
    } else
      setParties(
        (await call<{ parties: PartySummary[] }>("uexListParties")).parties,
      );
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    setParty(null);
    void run(load);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [party?.history.length]);
  // Refresh shared conversations while another manager is writing; revision checks protect every mutation.
  useEffect(() => {
    if (!id) return;
    const timer = setInterval(() => {
      if (!busy) void load().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [id, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const action = async (action: string) => {
    await call("uexBuilderAction", {
      id,
      revision: party?.revision,
      action,
    });
    if (action === "publish") {
      const guests = (await call<{ guests: { id: string; delivery: string }[] }>("uexGuests", { id })).guests;
      for (const guest of guests.filter((g) => g.delivery === "not-sent"))
        await call("uexSendEmails", { id, kind: "invitation", guestIds: [guest.id] });
    }
    await load();
  };
  const send = () =>
    run(async () => {
      const text = message.trim();
      if (!text) return;
      setMessage("");
      try {
        await call("uexBuilderMessage", {
          id,
          revision: party?.revision,
          message: text,
          requestId: crypto.randomUUID(),
        });
      } catch (failure) {
        setMessage(text);
        throw failure;
      } finally {
        await load();
      }
    });
  const upload = async (file: File) => {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5242880
    )
      throw new Error("Choose a JPEG, PNG or WebP up to 5 MB.");
    setProgress(5);
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (e) => {
        if (e.lengthComputable)
          setProgress(Math.round((e.loaded / e.total) * 40));
      };
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setProgress(50);
    try {
      await call("uexAsset", {
        id,
        revision: party?.revision,
        action: "upload",
        base64,
        alt: file.name.replace(/\.[^.]+$/, ""),
        caption: "",
      });
      setProgress(100);
      await load();
    } finally {
      setTimeout(() => setProgress(0), 1200);
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const locked =
    busy ||
    !!(party?.processing && party.processing.until > now) ||
    !!party?.archived ||
    party?.status === "cancelled" ||
    !!(party?.published?.endsAt && Date.parse(party.published.endsAt) < now);
  return (
    <main className="uex-app">
      <header className="builder-heading">
        <div>
          <span className="builder-kicker">UNIQ EXCLUSIVE</span>
          <h1>{id ? "Shape the evening." : "Bring people together."}</h1>
          <p>
            {id
              ? "A conversation, a shared draft, and an experience that feels like you."
              : "Create a party. Make it yours. Invite your people."}
          </p>
        </div>
        {!id && (
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await call<{ id: string }>("uexCreateDraft");
                setParams({ party: r.id });
              })
            }
          >
            <Plus size={18} />
            Create a party
          </button>
        )}
      </header>
      {error && (
        <div role="alert" className="portal-error">
          {error}{" "}
          <button disabled={busy} onClick={() => void run(load)}>
            Refresh
          </button>
        </div>
      )}
      {!id ? (
        <div className="builder-party-list">
          {parties.map((p) => (
            <button key={p.id} onClick={() => setParams({ party: p.id })}>
              <span className="builder-kicker">
                {p.archived ? "ARCHIVED" : p.status}
              </span>
              <h2>{p.name || "Untitled party"}</h2>
              <p>
                {p.startsAt
                  ? exactTime(p.startsAt, p.timezone)
                  : "Continue your saved conversation"}
              </p>
              <span>Open party →</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <button className="builder-back" onClick={() => setParams({})}>
            <ArrowLeft size={17} />
            All parties
          </button>
          {!party ? (
            <p role="status">Opening your saved draft…</p>
          ) : (
            <>
              <div className="builder-toolbar">
                <span>
                  Revision {party.revision} · {party.status}
                  {party.archived ? " · archived" : ""}
                </span>
                <div className="builder-actions">
                  <button disabled={busy} onClick={() => void run(load)}>
                    Refresh
                  </button>
                </div>
              </div>
              <div
                className="builder-tabs"
                role="tablist"
                aria-label="Party workspace"
              >
                {["chat", "preview"].map((t) => (
                  <button
                    role="tab"
                    aria-selected={tab === t}
                    key={t}
                    onClick={() => setTab(t)}
                  >
                    {t === "chat" ? "Chat" : "Preview"}
                  </button>
                ))}
              </div>
              <div className={`builder-workspace show-${tab}`}>
                <section className="builder-chat">
                  <div className="builder-chat-heading">
                    <Sparkles size={18} />
                    <b>Your party assistant</b>
                    <span>Shared with UEX managers</span>
                  </div>
                  <div className="builder-messages" aria-live="polite">
                    {party.history.map((m, i) => (
                      <div className={`builder-message ${m.role}`} key={i}>
                        <small>
                          {m.role === "user" ? "Manager" : "UEX assistant"}
                        </small>
                        <p>{m.content}</p>
                      </div>
                    ))}
                    {busy && <p role="status">Working on your party…</p>}
                    <div ref={chatEnd} />
                  </div>
                  {party.interaction && Date.parse(party.interaction.expiresAt) > now && (
                    <div className="builder-interaction" role="group" aria-label="Assistant question">
                      <b>{party.interaction.prompt}</b>
                      <div className="builder-actions">
                        {party.interaction.options.map((option) => (
                          <button key={option.value} disabled={busy} onClick={() => void run(async () => {
                            await call("uexBuilderMessage", { id, revision: party.revision, message: option.value, interactionId: party.interaction?.id, requestId: crypto.randomUUID() });
                            await load();
                          })}>{option.label}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!!party.sources?.length && <div className="builder-sources"><b>Sources</b>{party.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div>}
                  <form
                    className="builder-compose"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    <textarea
                      aria-label="Message the party assistant"
                      maxLength={4000}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell me about the evening you have in mind…"
                      disabled={locked}
                    />
                    <button disabled={locked || !message.trim()}>
                      <Send size={17} />
                      Send
                    </button>
                  </form>
                  <div className="builder-chat-tools">
                    <input aria-label="Upload party image" ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={locked} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void run(() => upload(f)); }} />
                    <button type="button" disabled={locked} onClick={() => fileInput.current?.click()}><ImagePlus size={17} /> Add image</button>
                    {progress > 0 && <progress max={100} value={progress} aria-label="Image upload progress" />}
                    <button type="button" disabled={locked} onClick={() => void run(() => action("undo"))}>Undo last change</button>
                    <button type="button" disabled={locked} onClick={() => void run(() => action("publish"))}>{party.published ? "Update live page" : "Publish party"}</button>
                    <button type="button" disabled={locked} onClick={() => void run(() => action("cancel"))}>Cancel party</button>
                  </div>
                </section>
                <section className="builder-preview">
                  <div className="builder-preview-label">
                    <span>
                      SAVED DRAFT
                    </span>
                    <small>Private until you publish</small>
                  </div>
                  <EventDocument
                    document={party.draft}
                    assets={party.assets}
                    preview
                  />
                </section>
              </div>
              <GuestManager id={id} status={party.status} />
            </>
          )}
        </>
      )}
    </main>
  );
}
