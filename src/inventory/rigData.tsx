import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { inventoryBotUndoCorrection, inventoryBotXpressBoard, messageOf, type RigBoard, type RigCard, type RigTicket, type RigWell } from "../core/api";
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

export function allRigs(board: RigBoard) {
  return [...board.rigs, ...board.quietRigs];
}

export function findRig(board: RigBoard, key: string) {
  return allRigs(board).find((rig) => rig.key === key) ?? null;
}

export function findWell(board: RigBoard, wellId: string): { rig: RigCard; well: RigWell } | null {
  for (const rig of allRigs(board)) {
    const well = rig.wells.find((row) => row.id === wellId);
    if (well) return { rig, well };
  }
  return null;
}

export function findTicket(board: RigBoard, ticketId: string): { rig: RigCard | null; ticket: RigTicket } | null {
  for (const rig of board.rigs) {
    const ticket = rig.tickets.find((row) => row.id === ticketId);
    if (ticket) return { rig, ticket };
  }
  const loose = [...board.unassigned, ...board.warehouse].find((row) => row.id === ticketId);
  return loose ? { rig: null, ticket: loose } : null;
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
    <button className="xb-more" type="button" aria-label={label} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)}>⋯</button>
    {open && <div className="xb-menu-pop" role="menu">
      {items.map((item) => item.to
        ? <Link key={item.label} role="menuitem" to={item.to} onClick={() => setOpen(false)}>{item.label}</Link>
        : <button key={item.label} type="button" role="menuitem" onClick={() => { setOpen(false); item.onClick?.(); }}>{item.label}</button>)}
    </div>}
  </div>;
}

export async function undoCorrection(ids: string[], preview: boolean) {
  if (preview || !ids.length) return;
  await inventoryBotUndoCorrection(ids.length === 1 ? { id: ids[0] } : { ids });
}
