import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGexData } from "../api/client";
import { GexAnalysis, VenueFilter } from "../types";

export function useGexData() {
  const [venue, setVenue] = useState<VenueFilter>("all");
  const [data, setData] = useState<GexAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>();
  const request = useRef(0);

  const loadData = useCallback(async (background?: unknown) => {
    const id = ++request.current;
    const silent = background === true;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await fetchGexData(venue);
      if (id !== request.current) return;
      if (result.success && result.data) setData(result.data);
      else setError(result.error || "没有拿到期权数据");
    } catch (err: unknown) {
      if (id !== request.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [venue]);

  useEffect(() => {
    setData(null);
    loadData();
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => loadData(true), 60_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [loadData]);

  return { data, loading, error, refresh: loadData, venue, setVenue };
}
