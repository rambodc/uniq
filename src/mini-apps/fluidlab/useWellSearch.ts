import { useCallback, useEffect, useRef, useState } from "react";
import { listWells } from "./api";
import type { Well } from "./model";
export function useWellSearch() {
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState({ text: "", id: 0 }),
    [cursors, setCursors] = useState<(string | null)[]>([null]),
    [page, setPage] = useState(0),
    [wells, setWells] = useState<Well[]>([]),
    [next, setNext] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const request = useRef(0);
  const change = (text: string) => {
    request.current++;
    setSearch(text);
    setLoading(true);
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery((q) => ({ text: search.trim(), id: q.id + 1 }));
      setCursors([null]);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const cursor = cursors[page] ?? null;
  const refresh = useCallback(async () => {
    const token = ++request.current;
    setLoading(true);
    setError("");
    try {
      const result = await listWells(query.text, cursor);
      if (token !== request.current) return;
      setWells(result.wells);
      setNext(result.cursor);
    } catch {
      if (token === request.current)
        setError("Wells could not be loaded. Please retry.");
    } finally {
      if (token === request.current) setLoading(false);
    }
  }, [query, cursor]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const requests = request;
    return () => {
      clearTimeout(timer);
      requests.current++;
    };
  }, [refresh]);
  return {
    search,
    setSearch: change,
    wells,
    loading,
    error,
    page,
    next,
    refresh,
    previous: () => setPage((p) => Math.max(0, p - 1)),
    more: () => {
      if (next && !loading) {
        setCursors((c) => [...c.slice(0, page + 1), next]);
        setPage((p) => p + 1);
      }
    },
  };
}
