/** Markup shapes, in image pixels. One renderer draws both the live editor and the flattened PNG. */
export type Tool = "arrow" | "ellipse" | "box" | "pen" | "note";
export type Mark =
  | { kind: "arrow" | "ellipse" | "box"; color: string; x1: number; y1: number; x2: number; y2: number }
  | { kind: "pen"; color: string; points: number[] }
  | { kind: "note"; color: string; x: number; y: number; text: string };

export const COLORS = [
  { id: "red", label: "Red", value: "#ef4444" },
  { id: "amber", label: "Amber", value: "#f59e0b" },
  { id: "teal", label: "Teal", value: "#1ce7be" },
  { id: "white", label: "White", value: "#ffffff" },
] as const;

/** A drag shorter than this (in CSS pixels times `unit`) is a tap, not a shape. */
export const MIN_DRAG = 6;

export function isUsable(mark: Mark, unit: number) {
  if (mark.kind === "note") return mark.text.trim().length > 0;
  if (mark.kind === "pen") return mark.points.length >= 4;
  return Math.hypot(mark.x2 - mark.x1, mark.y2 - mark.y1) >= MIN_DRAG * unit;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= max || !line) line = next;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines.slice(0, 12);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A text callout: white card, coloured border, "TEXT NOTE" label, and a tail pointing at (x, y). */
function drawNote(ctx: CanvasRenderingContext2D, mark: Extract<Mark, { kind: "note" }>, unit: number) {
  const pad = 10 * unit;
  const font = 14 * unit;
  const label = 10.5 * unit;
  ctx.font = `600 ${font}px Inter, system-ui, -apple-system, sans-serif`;
  const lines = wrap(ctx, mark.text, 230 * unit);
  const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), 70 * unit);
  const w = textWidth + pad * 2;
  const lineHeight = font * 1.3;
  const h = pad * 2 + label * 1.6 + lines.length * lineHeight;
  const tail = 9 * unit;
  const { width: W } = ctx.canvas;
  const above = mark.y - tail - h >= 0;
  const x = Math.min(Math.max(mark.x - 28 * unit, 4 * unit), Math.max(4 * unit, W - w - 4 * unit));
  const y = above ? mark.y - tail - h : mark.y + tail;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.35)";
  ctx.shadowBlur = 14 * unit;
  ctx.shadowOffsetY = 4 * unit;
  roundRect(ctx, x, y, w, h, 10 * unit);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  const tipX = Math.min(Math.max(mark.x, x + 14 * unit), x + w - 14 * unit);
  const lw = 2 * unit;
  const edge = above ? y + h - lw : y + lw;
  ctx.strokeStyle = mark.color === "#ffffff" ? "#94a3b8" : mark.color;
  ctx.lineWidth = lw;
  roundRect(ctx, x, y, w, h, 10 * unit);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tipX - tail, edge);
  ctx.lineTo(mark.x, mark.y);
  ctx.lineTo(tipX + tail, edge);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tipX - tail, edge);
  ctx.lineTo(mark.x, mark.y);
  ctx.lineTo(tipX + tail, edge);
  ctx.stroke();
  ctx.textBaseline = "top";
  ctx.font = `800 ${label}px Inter, system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = mark.color === "#ffffff" ? "#475569" : mark.color;
  ctx.fillText("TEXT NOTE", x + pad, y + pad);
  ctx.font = `600 ${font}px Inter, system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = "#0f172a";
  lines.forEach((line, index) => ctx.fillText(line, x + pad, y + pad + label * 1.6 + index * lineHeight));
}

export function drawMark(ctx: CanvasRenderingContext2D, mark: Mark, unit: number) {
  if (mark.kind === "note") { drawNote(ctx, mark, unit); return; }
  ctx.save();
  ctx.strokeStyle = mark.color;
  ctx.fillStyle = mark.color;
  ctx.lineWidth = 3.5 * unit;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,.35)";
  ctx.shadowBlur = 4 * unit;
  if (mark.kind === "pen") {
    ctx.beginPath();
    ctx.moveTo(mark.points[0], mark.points[1]);
    for (let i = 2; i < mark.points.length; i += 2) ctx.lineTo(mark.points[i], mark.points[i + 1]);
    ctx.stroke();
  } else if (mark.kind === "box") {
    const x = Math.min(mark.x1, mark.x2), y = Math.min(mark.y1, mark.y2);
    roundRect(ctx, x, y, Math.abs(mark.x2 - mark.x1), Math.abs(mark.y2 - mark.y1), 6 * unit);
    ctx.stroke();
  } else if (mark.kind === "ellipse") {
    ctx.beginPath();
    ctx.ellipse((mark.x1 + mark.x2) / 2, (mark.y1 + mark.y2) / 2, Math.max(1, Math.abs(mark.x2 - mark.x1) / 2), Math.max(1, Math.abs(mark.y2 - mark.y1) / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const angle = Math.atan2(mark.y2 - mark.y1, mark.x2 - mark.x1);
    const head = 16 * unit;
    ctx.beginPath();
    ctx.moveTo(mark.x1, mark.y1);
    ctx.lineTo(mark.x2 - Math.cos(angle) * head * 0.6, mark.y2 - Math.sin(angle) * head * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mark.x2, mark.y2);
    ctx.lineTo(mark.x2 - head * Math.cos(angle - Math.PI / 7), mark.y2 - head * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(mark.x2 - head * Math.cos(angle + Math.PI / 7), mark.y2 - head * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Base screenshot plus every mark, onto `ctx` at the base image's size. */
export function render(ctx: CanvasRenderingContext2D, base: CanvasImageSource, marks: Mark[], unit: number) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(base, 0, 0, width, height);
  for (const mark of marks) drawMark(ctx, mark, unit);
}
