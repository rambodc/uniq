import type { ReactNode } from "react";
import { PageShell } from "../auth/Shell";
import { copiedLabel } from "./data";

export function WellsPage({ title, backTo = "/dashboard", copiedAt, children }: { title: string; backTo?: string; copiedAt?: string; children: ReactNode }) {
  return <PageShell title={title} eyebrow="Wells" appId="wells" back backTo={backTo}>
    <div className="wl">
      {copiedAt ? <p className="wl-copy">Copied from the mud man app · {copiedLabel(copiedAt)}</p> : null}
      {children}
    </div>
  </PageShell>;
}
