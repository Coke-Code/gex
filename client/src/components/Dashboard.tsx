// ============================================================
// Dashboard — BTC/ETH GEX 看板 (Deribit) — GammaFlip 风格
// ============================================================

import { useState, useEffect } from "react";
import { useGexData, Underlying } from "../hooks/useGexData";
import GexChart from "./GexChart";
import InfoCards from "./InfoCards";
import SummaryCards from "./SummaryCards";
import { fetchGammaSurface } from "../api/client";
import { ForwardGammaResult } from "../types";

const REFRESH_INTERVAL = 60;

export default function Dashboard() {
  const { data, loading, error, refresh, history, underlying, setUnderlying } =
    useGexData();
  const [live, setLive] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [forwardGamma, setForwardGamma] = useState<
    ForwardGammaResult | undefined
  >();

  useEffect(() => {
    if (!data) return;
    fetchGammaSurface(underlying)
      .then((r) => {
        if (r.success) setForwardGamma(r.data);
      })
      .catch(() => {});
  }, [data?.timestamp, underlying]);

  useEffect(() => {
    if (!live) return;
    setCountdown(REFRESH_INTERVAL);
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          refresh();
          return REFRESH_INTERVAL;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [live, refresh, data?.timestamp, underlying]);

  const timeStr =
    new Date(data?.timestamp ?? Date.now())
      .toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })
      .replace(/\//g, "-") + " UTC+8";

  return (
    <div className="gex-app">
      {/* Header */}
      <header className="gex-header">
        <div className="gex-header-left">
          <div className="gex-logo">
            <span className="gex-logo-icon">Γ</span>
            <span>GEX Studio</span>
            <span className="gex-logo-divider">|</span>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>
              Deribit
            </span>
          </div>
          <div className="gex-pill-group">
            {(["BTC", "ETH"] as Underlying[]).map((u) => (
              <button
                key={u}
                type="button"
                className={`gex-pill${underlying === u ? " gex-pill--active" : ""}`}
                onClick={() => setUnderlying(u)}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className="gex-header-right">
          {loading && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              加载中…
            </span>
          )}
          {error && <span className="gex-error">⚠ {error}</span>}
          <label className="gex-live-toggle">
            <button
              type="button"
              className={`gex-live-switch${live ? " gex-live-switch--on" : ""}`}
              onClick={() => setLive(!live)}
              aria-label="Live toggle"
            />
            Live
          </label>
          <button
            className="gex-timer gex-timer--btn"
            onClick={refresh}
            disabled={loading}
            title="点击立即刷新"
          >
            <span className="gex-timer-icon">↻</span>
            {countdown}s
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="gex-main">
        <div className="gex-chart-panel">
          <div className="gex-chart-header">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div>
                <h2 className="gex-chart-title">
                  {underlying}: GEX
                  {data?.underlyingPrice != null && (
                    <span className="gex-index-price">
                      {" "}
                      · $
                      {data!.underlyingPrice.toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  )}
                </h2>
                <div className="gex-chart-meta">
                  <span style={{ color: "var(--orange)", fontWeight: 600 }}>
                    Deribit
                  </span>
                  <span>·</span>
                  <span>{timeStr}</span>
                </div>
              </div>
              {data && <SummaryCards data={data} />}
            </div>
          </div>

          <div className="gex-chart-body">
            {data && data.strikes.length > 0 ? (
              <GexChart
                strikes={data.strikes}
                underlyingPrice={data.underlyingPrice}
                flipZone={data.flipZone}
                flipPoint={data.flipPoint}
                forwardGamma={forwardGamma}
              />
            ) : (
              <div className="gex-empty">
                {loading ? "正在加载 Deribit 期权数据…" : "暂无数据"}
              </div>
            )}
          </div>
        </div>

        <aside className="gex-sidebar">
          {data ? (
            <InfoCards data={data} history={history} />
          ) : (
            <div className="gex-card gex-empty" style={{ height: 200 }}>
              加载中…
            </div>
          )}
        </aside>
      </main>

      <footer className="gex-footer">
        数据来源: Deribit · 每 {REFRESH_INTERVAL} 秒自动刷新 ·
        仅供参考，不构成投资建议
      </footer>
    </div>
  );
}
