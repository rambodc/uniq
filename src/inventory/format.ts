export function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function money(value: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(value || 0);
}

export function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  return value.slice(0, 10);
}

export function titleCase(value: string) {
  return value ? value.slice(0, 1).toUpperCase() + value.slice(1) : "";
}
