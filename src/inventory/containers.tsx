export function PailIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 7.2c0-2.2 1.2-3.4 3-3.4s3 1.2 3 3.4" /><path d="M7 8.2h10" /><path d="M8.1 8.2 9 18.6a1.6 1.6 0 0 0 1.6 1.4h2.8a1.6 1.6 0 0 0 1.6-1.4l.9-10.4" /><path d="M10 12.2h4" /></svg>;
}

export function DrumIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 4.5h8" /><path d="M7.2 7.2h9.6" /><path d="M7.2 16.8h9.6" /><ellipse cx="12" cy="4.5" rx="4" ry="1.6" /><path d="M8 4.5v15c0 1.1 1.8 2 4 2s4-.9 4-2v-15" /></svg>;
}

export function ToteIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 7.5h12v11.2a1.3 1.3 0 0 1-1.3 1.3H7.3A1.3 1.3 0 0 1 6 18.7Z" /><path d="M8 7.5V5.8A1.8 1.8 0 0 1 9.8 4h4.4A1.8 1.8 0 0 1 16 5.8v1.7" /><path d="M6 11h12M9.2 7.5v12.5M14.8 7.5v12.5" /></svg>;
}

export function BagIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 8.5c0-2.4 1.6-4 4-4s4 1.6 4 4" /><path d="M7.2 8.5h9.6l.7 10.2a1.6 1.6 0 0 1-1.6 1.8H8.1a1.6 1.6 0 0 1-1.6-1.8Z" /><path d="M9.5 12.5c.8 1 1.8 1.5 2.5 1.5s1.7-.5 2.5-1.5" /></svg>;
}

const ICONS = { pail: PailIcon, drum: DrumIcon, tote: ToteIcon, bag: BagIcon } as const;
const LABELS: Record<string, string> = { pail: "Pail", drum: "Drum", tote: "Tote", bag: "Bag" };

export function ContainerIcon({ type }: { type: string }) {
  const Icon = ICONS[type as keyof typeof ICONS];
  if (!Icon) return null;
  return <span className="pu-icon" title={LABELS[type]} aria-label={LABELS[type]}>{<Icon />}</span>;
}
