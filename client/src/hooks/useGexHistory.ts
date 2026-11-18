import { useCallback, useEffect, useState } from "react";
import { fetchGexHistory } from "../api/client";
import { HistoryHeatmapPayload } from "../types";

const emptyPayload = (): HistoryHeatmapPayload => ({
  span: 0.25,
  t: [],
  p: [],
  f: [],
  k: [],
  z: [],
});

export function useGexHistory(enabled: boolean) {
  const [payload, setPayload] = useState<HistoryHeatmapPayload>(emptyPayload);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGexHistory();
      if (result.success) setPayload(result.data);
      else setError("没有历史序列");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { payload, loading, error, refresh: load, pointCount: payload.t.length };
}