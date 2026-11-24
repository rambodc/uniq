import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Circle, Loader2, MoveUpRight, Pencil, Square, Type, Undo2, X } from "lucide-react";
import { COLORS, isUsable, render, type Mark, type Tool } from "./draw";
import { IGNORE_ATTR, type Shot } from "./capture";
import { fitSize } from "./report";

const TOOLS: { id: Tool; label: string; Icon: typeof Circle }[] = [
  { id: "arrow", label: "Arrow", Icon: MoveUpRight },
  { id: "ellipse", label: "Circle", Icon: Circle },
  { id: "box", label: "Box", Icon: Square },
  { id: "pen", label: "Pen", Icon: Pencil },
  { id: "note", label: "Text note", Icon: Type },
];

/** The marked-up screenshot, no larger than 2000px on its longest side. PNG unless that is over 6 MB. */
async function flatten(source: HTMLCanvasElement): Promise<Blob> {
  const size = fitSize(source.width, source.height);
  const out = document.createElement("canvas");
  out.width = size.width;
  out.height = size.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("This browser could not prepare the image.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, size.width, size.height);
  const encode = (type: string, quality?: number) => new Promise<Blob | null>((resolve) => out.toBlob(resolve, type, quality));
  const png = await encode("image/png");
  if (png && png.size <= 6 * 1024 * 1024) return png;
  const jpeg = await encode("image/jpeg", 0.86);
  if (!jpeg) throw new Error("This browser could not prepare the image.");
  return jpeg;
}

type Draft = { mark: Mark; pointer: number } | null;
type NoteInput = { x: number; y: number; left: number; top: number; text: string } | null;

/** Full-screen markup over the captured page: arrow, circle, box, pen, text note, undo, colours. */
export default function MarkupEditor({ shot, onCancel, onSend }: { shot: Shot; onCancel: () => void; onSend: (image: Blob, description: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const noteBox = useRef<HTMLTextAreaElement>(null);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState<string>(COLORS[0].value);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [description, setDescription] = useState("");
  const [note, setNote] = useState<NoteInput>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const draft = useRef<Draft>(null);
  const frame = useRef(0);
  const { unit } = shot;

  const paint = useCallback((extra?: Mark) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    render(ctx, shot.canvas, extra ? [...marks, extra] : marks, unit);
  }, [marks, shot.canvas, unit]);

  useLayoutEffect(() => {
    if (!canvas.current) return;
    canvas.current.width = shot.canvas.width;
    canvas.current.height = shot.canvas.height;
  }, [shot.canvas]);
  useEffect(() => { paint(); }, [paint]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !note && !sending) onCancel();
      const target = event.target as HTMLElement | null;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && target?.tagName !== "TEXTAREA") { event.preventDefault(); setMarks((current) => current.slice(0, -1)); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [note, onCancel, sending]);

  useEffect(() => { if (note) noteBox.current?.focus(); }, [note]);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = event.currentTarget.width / rect.width;
    return { x: (event.clientX - rect.left) * ratio, y: (event.clientY - rect.top) * ratio, cssX: event.clientX - rect.left, cssY: event.clientY - rect.top };
  }
  function schedule() {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => paint(draft.current?.mark));
  }
  function down(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (sending || draft.current) return;
    if (note) { commitNote(); return; }
    const p = point(event);
    if (tool === "note") {
      const host = stage.current?.getBoundingClientRect();
      const rect = event.currentTarget.getBoundingClientRect();
      const left = rect.left - (host?.left ?? 0) + p.cssX;
      const top = rect.top - (host?.top ?? 0) + p.cssY;
      const width = host?.width ?? window.innerWidth;
      const height = host?.height ?? window.innerHeight;
      setNote({ x: p.x, y: p.y, left: Math.max(8, Math.min(left - 24, width - 268)), top: Math.max(8, Math.min(top + 12, height - 150)), text: "" });
      event.preventDefault();
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const mark: Mark = tool === "pen" ? { kind: "pen", color, points: [p.x, p.y] } : { kind: tool, color, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    draft.current = { mark, pointer: event.pointerId };
  }
  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    const current = draft.current;
    if (!current || current.pointer !== event.pointerId) return;
    const p = point(event);
    if (current.mark.kind === "pen") current.mark = { ...current.mark, points: [...current.mark.points, p.x, p.y] };
    else if (current.mark.kind !== "note") current.mark = { ...current.mark, x2: p.x, y2: p.y };
    schedule();
  }
  function up(event: ReactPointerEvent<HTMLCanvasElement>) {
    const current = draft.current;
    if (!current || current.pointer !== event.pointerId) return;
    draft.current = null;
    cancelAnimationFrame(frame.current);
    if (isUsable(current.mark, unit)) setMarks((list) => [...list, current.mark]);
    else paint();
  }
  function commitNote() {
    if (!note) return;
    const text = note.text.trim();
    if (text) setMarks((list) => [...list, { kind: "note", color, x: note.x, y: note.y, text }]);
    setNote(null);
  }
  async function send() {
    if (sending) return;
    if (note) commitNote();
    setSending(true); setError("");
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (!canvas.current) throw new Error("The screenshot is gone. Try again.");
      const blob = await flatten(canvas.current);
      onSend(blob, description);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The image could not be prepared.");
      setSending(false);
    }
  }

  const route = `${shot.pathname}${shot.search}`;
  return <div className="rp-editor" role="dialog" aria-modal="true" aria-label="Mark up screenshot" {...{ [IGNORE_ATTR]: "" }}>
    <header className="rp-top">
      <div className="rp-title"><b>Mark up screenshot</b><small title={route}>{route} · just now</small></div>
      <div className="rp-tools" role="toolbar" aria-label="Markup tools">
        {TOOLS.map(({ id, label, Icon }) => <button key={id} type="button" className={tool === id ? "is-on" : ""} aria-pressed={tool === id} aria-label={label} title={label} onClick={() => { commitNote(); setTool(id); }}><Icon size={19} aria-hidden="true" /></button>)}
        <span className="rp-sep" aria-hidden="true" />
        <button type="button" aria-label="Undo" title="Undo" disabled={!marks.length} onClick={() => setMarks((list) => list.slice(0, -1))}><Undo2 size={19} aria-hidden="true" /></button>
      </div>
      <div className="rp-colors" role="radiogroup" aria-label="Colour">
        {COLORS.map((item) => <button key={item.id} type="button" role="radio" aria-checked={color === item.value} aria-label={item.label} className={color === item.value ? "is-on" : ""} style={{ background: item.value }} onClick={() => setColor(item.value)} />)}
      </div>
      <button className="rp-close" type="button" aria-label="Close" onClick={onCancel} disabled={sending}><X size={20} aria-hidden="true" /></button>
    </header>
    <div className="rp-stage" ref={stage}>
      <canvas ref={canvas} className={`rp-canvas tool-${tool}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Screenshot. Draw on it to point at what to change." />
      {note && <div className="rp-note-input" style={{ left: note.left, top: note.top }}>
        <span style={{ color: color === "#ffffff" ? "#475569" : color }}>Text note</span>
        <textarea ref={noteBox} rows={2} value={note.text} placeholder="Type a note" aria-label="Text note" onChange={(event) => setNote({ ...note, text: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); commitNote(); } if (event.key === "Escape") { event.stopPropagation(); setNote(null); } }} />
        <div><button type="button" onClick={() => setNote(null)}>Discard</button><button type="button" className="is-primary" onClick={commitNote}>Add</button></div>
      </div>}
      {!marks.length && !note && <p className="rp-hint" aria-hidden="true">{tool === "note" ? "Tap where the note should point" : "Draw on the screenshot to point something out"}</p>}
    </div>
    <footer className="rp-bottom">
      <label className="rp-describe">
        <span>Describe the fix</span>
        <textarea rows={2} value={description} placeholder="Optional. What should change?" onChange={(event) => setDescription(event.target.value)} maxLength={2000} />
      </label>
      {error && <p className="rp-error" role="alert">{error}</p>}
      <div className="rp-actions">
        <button type="button" className="rp-btn" onClick={onCancel} disabled={sending}>Cancel</button>
        <button type="button" className="rp-btn is-primary" onClick={() => void send()} disabled={sending}>{sending ? <><Loader2 className="rp-spin" size={18} aria-hidden="true" /> Preparing…</> : "Send to Builder"}</button>
      </div>
    </footer>
  </div>;
}
