import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { inventoryBotXpressBoard, messageOf, type RigBoard, type RigCard, type XrefRow } from "../core/api";
import { previewInventory } from "../auth/preview";

let cached: RigBoard | null = null;

export function useRigBoard() {
  const fixture = previewInventory()?.rigs ?? null;
  const [board, setBoard] = useState<RigBoard | null>(fixture ?? cached);
  const [error, setError] = useState("");

  async function reload() {
    if (fixture) return;
    try {
      const next = await inventoryBotXpressBoard();
      cached = next;
      setBoard(next);
      setError("");
    } catch (cause) {
      setError(messageOf(cause, "Rigs could not be loaded."));
    }
  }

  useEffect(() => {
    if (fixture) return;
    let active = true;
    inventoryBotXpressBoard().then((next) => {
      if (!active) return;
      cached = next;
      setBoard(next);
      setError("");
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "Rigs could not be loaded."));
    });
    return () => { active = false; };
  }, [fixture]);

  return { board, error, reload, preview: Boolean(fixture) };
}

export function findRig(board: RigBoard, key: string) {
  return board.rigs.find((rig) => rig.key === key) ?? null;
}

export function rowsOf(rig: RigCard) {
  return [...rig.needs, ...rig.pending, ...rig.transfers, ...rig.pairs];
}

export function findRow(board: RigBoard, rowId: string): { rig: RigCard | null; row: XrefRow } | null {
  for (const rig of board.rigs) {
    const row = rowsOf(rig).find((item) => item.id === rowId);
    if (row) return { rig, row };
  }
  const loose = board.loose.find((item) => item.id === rowId);
  return loose ? { rig: null, row: loose } : null;
}

export function MoreMenu({ label, items }: { label: string; items: { label: string; to?: string; onClick?: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!items.length) return null;
  return <div className="xb-menu" ref={ref}>
    <button className="xb-more" type="button" aria-label={label} aria-expanded={open} aria-haspopup="menu" onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}>⋯</button>
    {open && <div className="xb-menu-pop" role="menu">
      {items.map((item) => item.to
        ? <Link key={item.label} role="menuitem" to={item.to} onClick={(event) => { event.stopPropagation(); setOpen(false); }}>{item.label}</Link>
        : <button key={item.label} type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); setOpen(false); item.onClick?.(); }}>{item.label}</button>)}
    </div>}
  </div>;
}
