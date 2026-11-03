import { useEffect, useMemo, useState } from "react";
import { inventoryBotGetCoverage, messageOf, type InventoryCoverage, type InventoryFlag, type ReviewItem } from "../core/api";
import { previewInventory } from "../auth/preview";
import Shell from "../auth/Shell";
import { ChatPanel, FlagChip, FlagNotes } from "./FlagChip";
import Tabs, { useInventoryDate } from "./Tabs";
import { money } from "./format";

export default function Unmatched() {
  const preview = previewInventory();
  const { date } = useInventoryDate();
  const [data, setData] = useState<InventoryCoverage | null>(null);
  const [flags, setFlags] = useState<InventoryFlag[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [loading, setLoading] = useState(() => preview == null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (previewInventory()) return;
    let active = true;
    inventoryBotGetCoverage(date).then((result) => {
      if (!active) return;
      setData(result);
      setFlags(result.flags || []);
      setLoading(false);
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "The review queue could not be loaded."));
      setLoading(false);
    });
    return () => { active = false; };
  }, [date]);

  const reviews = data?.reviews || [];
  const closed = (item: ReviewItem) => Boolean(item.auto) || item.state === "resolved_auto";
  const visible = reviews.filter((item) => showClosed || !closed(item));
  const hidden = reviews.filter(closed).length;
  const counts = useMemo(() => flags.reduce((all, flag) => ({ ...all, [flag.status]: (all[flag.status] || 0) + 1 }), {} as Record<string, number>), [flags]);

  function flagFor(id: string) {
    return flags.find((flag) => flag.entityType === "review" && flag.entityId === id);
  }
  function saveFlag(next: InventoryFlag) {
    setFlags((current) => [...current.filter((flag) => !(flag.entityType === next.entityType && flag.entityId === next.entityId)), next]);
  }

  return <Shell title="Unmatched" eyebrow="Review queue" appId="inventoryBot" back>
    <Tabs date={date} />
    <section className="inv-stats">
      <article><span>New</span><strong>{counts.new || 0}</strong></article>
      <article><span>Watching</span><strong>{counts.watching || 0}</strong></article>
      <article><span>Done</span><strong>{counts.done || 0}</strong></article>
    </section>
    {error && <div className="portal-status error" role="alert">{error}</div>}
    {loading ? <p className="portal-empty">Loading the queue…</p> : <>
      <button type="button" className="inv-auto" aria-expanded={showClosed} onClick={() => setShowClosed((value) => !value)}>{showClosed ? "Hide" : "Show"} {hidden} auto-closed</button>
      {visible.length === 0 ? <p className="portal-empty">Nothing needs a review.</p> : <ul className="inv-queue">
        {visible.map((item) => <ReviewRow key={item.id} item={item} flag={flagFor(item.id)} open={open === item.id} onOpen={() => setOpen(open === item.id ? null : item.id)} onFlag={saveFlag} />)}
      </ul>}
    </>}
  </Shell>;
}

function ReviewRow({ item, flag, open, onOpen, onFlag }: { item: ReviewItem; flag?: InventoryFlag; open: boolean; onOpen: () => void; onFlag: (flag: InventoryFlag) => void }) {
  return <li>
    <button type="button" className="inv-queue-main" onClick={onOpen}>
      <strong>{item.title}</strong>
      <span>{item.reason || item.detail}</span>
      <em>{money(item.dollarValue || 0)}</em>
    </button>
    <FlagChip entityType="review" entityId={item.id} flag={flag} onChange={onFlag} />
    {open && <ChatPanel context={{ reviewId: item.id }} prompt="Explain what is off with this review item and what data is missing." />}
    {open && <FlagNotes entityType="review" entityId={item.id} flag={flag} onChange={onFlag} />}
  </li>;
}
