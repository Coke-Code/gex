// ============================================================
// 图表标题栏摘要卡片 — Flip / Hedging / Absolute GEX
// ============================================================

import { GexAnalysis } from "../types";

interface SummaryCardsProps {
  data: GexAnalysis;
}

function formatPrice(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatGexCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value >= 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(value / 1e3).toFixed(0)}K`;
  return `${sign}${value.toFixed(0)}`;
}

export default function SummaryCards({ data }: SummaryCardsProps) {
  const aboveFlip =
    data.flipPoint != null && data.underlyingPrice > data.flipPoint;
  const belowFlip =
    data.flipPoint != null && data.underlyingPrice < data.flipPoint;

  const pressureColor =
    data.hedgingPressure === "positive"
      ? "var(--green)"
      : data.hedgingPressure === "negative"
        ? "var(--red)"
        : "var(--text-secondary)";

  const pressureLabel =
    data.hedgingPressure === "positive"
      ? "做市商抑制波动"
      : data.hedgingPressure === "negative"
        ? "做市商放大波动"
        : "对冲中性";

  const flipLabel = aboveFlip ? "正伽马" : belowFlip ? "负伽马" : "中性";

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        marginLeft: "auto",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {/* Flip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "2px 0",
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 2,
            background: "var(--orange)",
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Flip</span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--orange)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {data.flipPoint ? formatPrice(data.flipPoint) : "N/A"}
        </span>
        <span
          style={{
            fontSize: 9,
            color: "var(--text-muted)",
            background: "var(--bg-muted)",
            padding: "1px 5px",
            borderRadius: 3,
          }}
        >
          {flipLabel}
        </span>
      </div>

      {/* Hedging */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "2px 0",
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 2,
            background: pressureColor,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          对冲压力
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: pressureColor,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatGexCompact(data.totalNetGex)}
        </span>
        <span
          style={{
            fontSize: 9,
            color: pressureColor,
            background: "var(--bg-muted)",
            padding: "1px 5px",
            borderRadius: 3,
          }}
        >
          {pressureLabel}
        </span>
      </div>

      {/* Absolute GEX */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "2px 0",
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 2,
            background: "var(--purple)",
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          绝对GEX
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--purple)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatGexCompact(data.totalAbsGex)}
        </span>
        <span
          style={{
            fontSize: 9,
            color: "var(--text-muted)",
            background: "var(--bg-muted)",
            padding: "1px 5px",
            borderRadius: 3,
          }}
        >
          总规模
        </span>
      </div>
    </div>
  );
}
