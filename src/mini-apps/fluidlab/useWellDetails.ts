import { useEffect, useRef, useState } from "react";
import { prepareWellDetails } from "./api";
import type { Well } from "./model";
let running = 0;
const waiting: (() => void)[] = [];
async function acquire() {
  if (running >= 3) await new Promise<void>((resolve) => waiting.push(resolve));
  else running++;
}
function release() {
  const next = waiting.shift();
  if (next) next();
  else running--;
}
const key = (w: Well) => `${w.id}:${w.revision}:${w.version}`;
export function useWellDetails(wells: Well[], selected?: Well) {
  const [prepared, setPrepared] = useState<Record<string, Partial<Well>>>({});
  const [attempt, setAttempt] = useState(0);
  const cache = useRef(new Map<string, Partial<Well>>());
  const wanted = [
    ...new Map(
      [...wells, ...(selected ? [selected] : [])].map((w) => [w.id, w]),
    ).values(),
  ];
  const signature = wanted.map(key).join("|");
  useEffect(() => {
    let cancelled = false;
    const queue = [...wanted];
    async function worker() {
      while (queue.length && !cancelled) {
        const well = queue.shift()!,
          id = key(well);
        if (cache.current.has(id)) continue;
        if (
          well.detailsVersion === well.version &&
          well.details &&
          well.location?.status !== "unavailable"
        ) {
          cache.current.set(id, well);
          continue;
        }
        await acquire();
        try {
          if (cancelled) return;
          const result = await prepareWellDetails(well.id);
          if (cancelled) return;
          if (
            result.version !== well.version ||
            result.revision !== well.revision
          )
            continue;
          cache.current.set(id, result);
          setPrepared((p) => ({ ...p, [id]: result }));
        } catch {
          if (!cancelled) {
            const result = {
              location: { status: "unavailable", fingerprint: "" },
            };
            cache.current.set(id, result);
            setPrepared((p) => ({ ...p, [id]: result }));
          }
        } finally {
          release();
        }
      }
    }
    void Promise.all([worker(), worker(), worker()]);
    return () => {
      cancelled = true;
    };
    // The signature captures precisely the well revisions requiring preparation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, attempt]);
  const merge = (w: Well) => ({ ...w, ...prepared[key(w)] });
  return {
    wells: wells.map(merge),
    selected: selected ? merge(selected) : undefined,
    retry: () => {
      cache.current.clear();
      setAttempt((a) => a + 1);
    },
  };
}
