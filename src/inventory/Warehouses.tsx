import { useEffect, useState } from "react";
import { inventoryBotListWarehouses, messageOf, type WarehouseStock } from "../core/api";
import { previewInventory } from "../auth/preview";
import Shell from "../auth/Shell";
import Tabs, { useInventoryDate } from "./Tabs";
import { shortDate } from "./format";

export default function Warehouses() {
  const preview = previewInventory();
  const { date } = useInventoryDate();
  const [warehouses, setWarehouses] = useState<WarehouseStock[]>(() => preview?.warehouses ?? []);
  const [loading, setLoading] = useState(() => preview == null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (previewInventory()) return;
    let active = true;
    inventoryBotListWarehouses().then((result) => {
      if (!active) return;
      setWarehouses(result.warehouses);
      setLoading(false);
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "Warehouses could not be loaded."));
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return <Shell title="Warehouses" eyebrow="Inventory Bot" appId="inventoryBot" back>
    <Tabs date={date} />
    {error && <div className="portal-status error" role="alert">{error}</div>}
    {loading ? <p className="portal-empty">Loading warehouses…</p> : warehouses.length === 0 ? <div className="portal-panel"><h2>No stock snapshots yet</h2><p>Each morning the collector stores on-hand, committed, in-transit, and available quantities for Xpress Vendor and MIM Central. The change against the previous snapshot shows up beside each product.</p></div> : warehouses.map((warehouse) => <section key={warehouse.id} className="portal-panel">
      <div className="mail-detail-top"><h2>{warehouse.warehouseName}</h2><span className="mail-meta">{warehouse.source} · {shortDate(warehouse.date)}{warehouse.previousDate ? ` vs ${shortDate(warehouse.previousDate)}` : ""}</span></div>
      <ul className="inv-lines inv-lines-head">
        <li><span>Product</span><span>On hand</span><span>Change</span></li>
        {warehouse.items.map((item) => <li key={item.code}><span>{item.name}</span><span>{item.onHand ?? "—"}</span><span>{item.delta == null ? "—" : item.delta > 0 ? `+${item.delta}` : item.delta}</span></li>)}
      </ul>
    </section>)}
  </Shell>;
}
