import type { FluidRecord } from "../../../src/mini-apps/fluidlab/pason/drilling-fluids";
export function filterFluidRecords(
  records: FluidRecord[],
  args?: {
    category?: string | null;
    fromDate?: string | null;
    toDate?: string | null;
    name?: string | null;
  },
): FluidRecord[];
export function recordedVolumeChanges(
  records: FluidRecord[],
): (FluidRecord & { change: number | null; changeNote: string })[];
export function chemicalTotals(
  records: FluidRecord[],
): { name: string; unit: string; amount: number; count: number }[];
