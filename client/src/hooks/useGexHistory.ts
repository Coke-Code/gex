import { useCallback, useEffect, useState } from "react";
import { fetchGexHistory } from "../api/client";
import { HistorySnap } from "../types";

export function useGexHistory(enabled: boolean) {
  const [points, setPoints] = useState<HistorySnap[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGexHistory();
      if (result.success) setPoints(result.data);
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

  return { points, loading, error, refresh: load };
}
