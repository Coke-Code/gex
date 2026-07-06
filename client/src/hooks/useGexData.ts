import { useState, useEffect, useCallback, useRef } from "react";
import { GexAnalysis } from "../types";
import { fetchGexData } from "../api/client";

export interface HistorySnap {
  timestamp: number;
  flipPoint: number | null;
  totalNetGex: number;
  totalAbsGex: number;
  underlyingPrice: number;
}

interface UseGexDataReturn {
  data: GexAnalysis | null;
  history: HistorySnap[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useGexData(): UseGexDataReturn {
  const [data, setData] = useState<GexAnalysis | null>(null);
  const [history, setHistory] = useState<HistorySnap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [gexResult] = await Promise.all([fetchGexData("BTC")]);
      // 先等 GEX 数据存入历史，再拉历史
      const histResult = await fetch("/api/gex/BTC/history").then((r) =>
        r.json(),
      );
      if (gexResult.success) {
        setData(gexResult.data);
        if (gexResult.errors?.some((e) => e.exchange === "deribit")) {
          setError("Deribit 暂时不可用");
        }
      } else {
        setError("获取数据失败");
      }
      if (histResult.success) setHistory(histResult.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    intervalRef.current = setInterval(loadData, 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadData]);

  return { data, history, loading, error, refresh: loadData };
}
