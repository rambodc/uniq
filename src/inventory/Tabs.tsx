import { Link, useLocation, useSearchParams } from "react-router-dom";
import { todayKey } from "./format";

const TABS = [
  { to: "/inventory-bot", label: "Home", end: true },
  { to: "/inventory-bot/wells", label: "Wells" },
  { to: "/inventory-bot/unmatched", label: "Unmatched" },
  { to: "/inventory-bot/ask", label: "Ask" },
];

export function useInventoryDate() {
  const [params, setParams] = useSearchParams();
  const date = params.get("date") || todayKey();
  function setDate(next: string) {
    const updated = new URLSearchParams(params);
    updated.set("date", next);
    setParams(updated);
  }
  return { date, setDate };
}

export function tabTo(path: string, date: string) {
  return `${path}?date=${encodeURIComponent(date)}`;
}

export default function Tabs({ date }: { date: string }) {
  const { pathname } = useLocation();
  return <nav className="inv-tabs" aria-label="Inventory Bot">
    {TABS.map((tab) => {
      const active = tab.end ? pathname === tab.to : pathname.startsWith(tab.to);
      return <Link key={tab.to} to={tabTo(tab.to, date)} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>{tab.label}</Link>;
    })}
  </nav>;
}
