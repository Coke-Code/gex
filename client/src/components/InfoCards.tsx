// ============================================================
// 右侧信息卡片 — Flip Point / Hedging Pressure / Absolute GEX / 交易建议
// ============================================================

import { GexAnalysis } from "../types";
import { HistorySnap } from "../hooks/useGexData";

interface InfoCardsProps {
  data: GexAnalysis;
  history: HistorySnap[];
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

const DOT = "\u00B7";

function TradingSuggestion({ data }: { data: GexAnalysis }) {
  const {
    flipPoint,
    flipZone,
    underlyingPrice,
    hedgingPressure,
    totalNetGex,
    totalAbsGex,
    gexPer1PctMove,
    strikes,
  } = data;

  // ── 辅助计算 ──
  const aboveFlip = flipPoint != null && underlyingPrice > flipPoint;
  const belowFlip = flipPoint != null && underlyingPrice < flipPoint;
  const flipPct =
    flipPoint != null
      ? (Math.abs(underlyingPrice - flipPoint) / flipPoint) * 100
      : null;
  const flipDist =
    flipPoint != null ? Math.abs(underlyingPrice - flipPoint) : null;

  // Call / Put GEX 总量
  const totalCallGex = strikes.reduce((s, x) => s + Math.abs(x.callGex), 0);

  const totalPutGex = strikes.reduce((s, x) => s + Math.abs(x.putGex), 0);

  const cpRatio = totalPutGex > 0 ? totalCallGex / totalPutGex : 1;
  const netRatio = totalAbsGex > 0 ? totalNetGex / totalAbsGex : 0;

  // 找到最大 GEX 集中行权价
  const maxGexStrike = [...strikes].sort((a, b) => b.absGex - a.absGex)[0];
  const maxCallStrike = [...strikes].sort(
    (a, b) => Math.abs(b.callGex) - Math.abs(a.callGex),
  )[0];
  const maxPutStrike = [...strikes].sort(
    (a, b) => Math.abs(b.putGex) - Math.abs(a.putGex),
  )[0];
  // Gamma 集中度：前5个行权价占总量的比例
  const top5Strikes = [...strikes]
    .sort((a, b) => b.absGex - a.absGex)
    .slice(0, 5);
  const top5Sum = top5Strikes.reduce((s, x) => s + x.absGex, 0);
  const concentration = totalAbsGex > 0 ? top5Sum / totalAbsGex : 0;

  // ── 自适应评分（连续映射，无硬阈值）──
  let score = 0;

  // 1. Flip 位置 ±30（渐变）
  if (aboveFlip) {
    score +=
      flipPct != null && flipPct > 3
        ? 30
        : flipPct != null && flipPct > 1
          ? 20
          : 10;
  } else if (belowFlip) {
    score -=
      flipPct != null && flipPct > 3
        ? 30
        : flipPct != null && flipPct > 1
          ? 20
          : 10;
  }

  // 2. 对冲压力 ±25
  if (hedgingPressure === "positive") score += 25;
  else if (hedgingPressure === "negative") score -= 25;

  // 3. 净 GEX ±25（连续：netRatio * 80 映射）
  score += Math.max(-25, Math.min(25, Math.round(netRatio * 80)));

  // 4. Call/Put ±20（对数连续：log2(cpRatio) * 12 映射）
  if (cpRatio > 0 && cpRatio < 999)
    score += Math.max(-20, Math.min(20, Math.round(Math.log2(cpRatio) * 12)));

  // ── 信号与置信度 ──
  const absScore = Math.abs(score);
  let overallSignal: "bullish" | "bearish" | "neutral";
  let confidence: "high" | "medium" | "low";

  if (score >= 35) {
    overallSignal = "bullish";
    confidence = score >= 65 ? "high" : score >= 50 ? "medium" : "low";
  } else if (score <= -35) {
    overallSignal = "bearish";
    confidence = absScore >= 65 ? "high" : absScore >= 50 ? "medium" : "low";
  } else if (score >= 10) {
    overallSignal = "bullish";
    confidence = "low";
  } else if (score <= -10) {
    overallSignal = "bearish";
    confidence = "low";
  } else {
    overallSignal = "neutral";
    confidence = absScore <= 8 ? "high" : "medium";
  }

  const signalConfig: Record<
    string,
    { bg: string; color: string; label: string; icon: string }
  > = {
    bullish: {
      bg: "var(--green-bg)",
      color: "var(--green)",
      label: "偏多",
      icon: "▲",
    },
    bearish: {
      bg: "var(--red-bg)",
      color: "var(--red)",
      label: "偏空",
      icon: "▼",
    },
    neutral: {
      bg: "rgba(107,114,128,0.08)",
      color: "var(--text-secondary)",
      label: "中性",
      icon: "◆",
    },
  };
  const sc = signalConfig[overallSignal];

  // ── 自适应建议（始终展示所有维度）──
  interface Suggestion {
    signal: "bullish" | "bearish" | "neutral";
    text: string;
    detail: string;
  }
  const suggestions: Suggestion[] = [];

  // 1. Flip — 始终展示
  if (flipPoint != null) {
    const dp = (((underlyingPrice - flipPoint) / flipPoint) * 100).toFixed(2);
    if (aboveFlip) {
      const close = flipDist != null && flipDist < underlyingPrice * 0.008;
      suggestions.push({
        signal: "bullish",
        text: `Flip 支撑 @ $${formatPrice(flipPoint)}`,
        detail: close
          ? `仅 ${dp}% 高于 flip，紧贴临界点！跌破即触负 gamma 挤压。`
          : `高于 flip ${flipPct?.toFixed(1)}%，正 gamma 安全区。回调有做市商买盘托底。`,
      });
    } else if (belowFlip) {
      const close = flipDist != null && flipDist < underlyingPrice * 0.008;
      suggestions.push({
        signal: "bearish",
        text: `Flip 阻力 @ $${formatPrice(flipPoint)}`,
        detail: close
          ? `仅 ${dp}% 低于 flip，紧贴临界点！突破即触正 gamma 反弹。`
          : `低于 flip ${flipPct?.toFixed(1)}%，负 gamma 危险区。反弹有做市商卖盘压制。`,
      });
    } else {
      suggestions.push({
        signal: "neutral",
        text: `恰在 Flip @ $${formatPrice(flipPoint)}`,
        detail: "精准处于 gamma flip，方向极度敏感，任何突破触发 gamma 挤压。",
      });
    }
  }

  // 2. 对冲压力 — 始终展示
  if (hedgingPressure === "positive") {
    suggestions.push({
      signal: "bullish",
      text: `做市商抑制波动 (净 ${formatGexCompact(totalNetGex)})`,
      detail:
        "正 Gamma 主导，高抛低吸提供流动性，IV 压缩。适合区间交易 / 卖波动率。",
    });
  } else if (hedgingPressure === "negative") {
    suggestions.push({
      signal: "bearish",
      text: `做市商放大波动 (净 ${formatGexCompact(totalNetGex)})`,
      detail: "负 Gamma 主导，追涨杀跌加剧波动，可能 gamma squeeze。严格风控！",
    });
  } else {
    const desc =
      Math.abs(netRatio) < 0.05
        ? "Gamma 敞口接近完美平衡，做市商无方向性对冲压力。价格自由波动，关注盘口突破。"
        : `净 GEX ${formatGexCompact(totalNetGex)} (${(netRatio * 100).toFixed(1)}%)，方向性偏弱。`;
    suggestions.push({ signal: "neutral", text: "对冲压力中性", detail: desc });
  }

  // 3. GEX 移动影响 — 始终展示
  const impactRatio =
    totalAbsGex > 0 ? Math.abs(gexPer1PctMove) / totalAbsGex : 0;
  if (impactRatio > 0.02) {
    suggestions.push({
      signal: gexPer1PctMove > 0 ? "bullish" : "bearish",
      text: `Gamma 加速 (${formatGexCompact(gexPer1PctMove)} / 1%)`,
      detail: `每波动 1%，做市商需${gexPer1PctMove > 0 ? "买入" : "卖出"} ${formatGexCompact(Math.abs(gexPer1PctMove))}，${gexPer1PctMove > 0 ? "加速上涨" : "加速下跌"}。`,
    });
  } else {
    suggestions.push({
      signal: "neutral",
      text: `Gamma 移动微弱 (${formatGexCompact(gexPer1PctMove)} / 1%)`,
      detail: "对冲量极小，做市商行为不显著影响方向，趋势由现货驱动。",
    });
  }

  // 4. Call/Put 分布 — 始终展示
  if (cpRatio > 1.3) {
    suggestions.push({
      signal: "bullish",
      text: `Call 主导 (C/P=${cpRatio.toFixed(2)})`,
      detail: `Call ${formatGexCompact(totalCallGex)} vs Put ${formatGexCompact(totalPutGex)}，上方 gamma 密集，看涨情绪。`,
    });
  } else if (cpRatio < 0.77) {
    suggestions.push({
      signal: "bearish",
      text: `Put 主导 (C/P=${cpRatio.toFixed(2)})`,
      detail: `Put ${formatGexCompact(totalPutGex)} vs Call ${formatGexCompact(totalCallGex)}，下方 gamma 密集，避险情绪。`,
    });
  } else {
    suggestions.push({
      signal: "neutral",
      text: `Call/Put 均衡 (C/P=${cpRatio.toFixed(2)})`,
      detail: `Call ${formatGexCompact(totalCallGex)} / Put ${formatGexCompact(totalPutGex)}，多空平衡，等待方向选择。`,
    });
  }

  // 5. 关键水平 — 始终展示（支撑/阻力）
  const keyLevels: { strike: number; type: string }[] = [];
  if (maxGexStrike)
    keyLevels.push({ strike: maxGexStrike.strike, type: "最大GEX" });
  if (maxCallStrike && maxCallStrike.strike !== maxGexStrike?.strike)
    keyLevels.push({ strike: maxCallStrike.strike, type: "Call墙" });
  if (
    maxPutStrike &&
    maxPutStrike.strike !== maxGexStrike?.strike &&
    maxPutStrike.strike !== maxCallStrike?.strike
  )
    keyLevels.push({ strike: maxPutStrike.strike, type: "Put墙" });
  keyLevels.sort((a, b) => a.strike - b.strike);

  const below = keyLevels.filter((l) => l.strike < underlyingPrice);
  const above = keyLevels.filter((l) => l.strike > underlyingPrice);
  const supStr = below.map((l) => `$${formatPrice(l.strike)}`).join("/") || "—";
  const resStr = above.map((l) => `$${formatPrice(l.strike)}`).join("/") || "—";
  const levelList =
    keyLevels.map((l) => `$${formatPrice(l.strike)}(${l.type})`).join(" · ") ||
    "暂无";

  suggestions.push({
    signal: "neutral",
    text: `关键水平: ${levelList}`,
    detail: `支撑 ${supStr} ｜ 阻力 ${resStr}。Gamma 密集区有磁吸效应，价格倾向回归这些水平。`,
  });

  // 6. 风险 — 条件展示
  if (concentration > 0.5)
    suggestions.push({
      signal: "neutral",
      text: "⚠ Gamma 高度集中",
      detail: `前5行权价占 ${(concentration * 100).toFixed(0)}%，突破关键位引发剧烈挤压，设止损。`,
    });
  if (
    flipPoint != null &&
    flipDist != null &&
    flipDist < underlyingPrice * 0.008
  )
    suggestions.push({
      signal: "neutral",
      text: "⚠ 接近 Flip 临界点",
      detail: `距 flip 仅 ${flipDist.toFixed(0)} 点 (${flipPct?.toFixed(2)}%)，方向随时反转，控制仓位。`,
    });

  // ── 自适应策略 ──
  const confLabel =
    confidence === "high"
      ? "高置信"
      : confidence === "medium"
        ? "中等置信"
        : "低置信";
  const confColor =
    confidence === "high"
      ? "var(--green)"
      : confidence === "medium"
        ? "var(--orange)"
        : "var(--text-muted)";

  let strategy = "";
  if (overallSignal === "bullish") {
    if (flipPoint != null)
      strategy =
        `回调至 flip ($${formatPrice(flipPoint)}) 附近做多，止损 flip 下方` +
        (above.length > 0 ? `，目标 $${formatPrice(above[0].strike)}。` : "。");
    else strategy = "偏多格局，回调做多，严格止损。";
  } else if (overallSignal === "bearish") {
    if (flipPoint != null)
      strategy =
        `反弹至 flip ($${formatPrice(flipPoint)}) 附近做空，止损 flip 上方` +
        (below.length > 0
          ? `，目标 $${formatPrice(below[below.length - 1].strike)}。`
          : "。");
    else strategy = "偏空格局，反弹做空，严格止损。";
  } else {
    if (flipPoint != null)
      strategy = `区间交易：$${formatPrice(flipPoint)} 上下博弈，等待突破 flip 方向确认后再顺势入场。`;
    else strategy = "方向不明，减仓观望，等待明确信号。";
  }

  return (
    <div className="gex-card gex-card--accent-blue">
      <div className="gex-card-head">
        <span className="gex-card-title">
          <span className="gex-card-dot" style={{ background: sc.color }} />
          交易建议
        </span>
        <span
          className="gex-card-delta"
          style={{ color: sc.color, fontSize: 13 }}
        >
          {sc.icon} {sc.label}
        </span>
      </div>

      {/* 分数条 */}
      <div style={{ marginTop: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            color: "var(--text-muted)",
            marginBottom: 3,
          }}
        >
          <span>偏空 ←</span>
          <span style={{ color: confColor, fontWeight: 600 }}>
            {score > 0 ? "+" : ""}
            {score} · {confLabel}
          </span>
          <span>→ 偏多</span>
        </div>
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: "var(--border)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              width: 1,
              height: "100%",
              background: "var(--text-muted)",
              opacity: 0.3,
            }}
          />
          <div
            style={{
              height: "100%",
              width: `${Math.min(absScore, 50)}%`,
              marginLeft:
                score >= 0 ? "50%" : `${50 - Math.min(absScore, 50)}%`,
              background: score >= 0 ? "var(--green)" : "var(--red)",
              borderRadius: 3,
              transition: "all 0.4s ease",
            }}
          />
        </div>
      </div>

      {/* 建议列表 */}
      <div
        style={{
          background: sc.bg,
          border: `1px solid ${sc.color}22`,
          borderRadius: 6,
          padding: "10px 12px",
          marginTop: 10,
          fontSize: 11,
          lineHeight: 1.65,
          overflowY: "auto",
        }}
      >
        {suggestions.map((s, i) => (
          <div
            key={i}
            style={{ marginBottom: i < suggestions.length - 1 ? 8 : 0 }}
          >
            <span
              style={{
                color:
                  s.signal === "bullish"
                    ? "var(--green)"
                    : s.signal === "bearish"
                      ? "var(--red)"
                      : "var(--text-secondary)",
                fontWeight: 600,
              }}
            >
              {s.signal === "bullish"
                ? "●"
                : s.signal === "bearish"
                  ? "●"
                  : "○"}{" "}
              {s.text}
            </span>
            <div style={{ color: "var(--text-muted)", marginTop: 2 }}>
              {s.detail}
            </div>
          </div>
        ))}
      </div>

      {/* 策略 */}
      <div
        style={{
          marginTop: 10,
          padding: "8px 12px",
          borderRadius: 6,
          background: "var(--bg-muted)",
          border: `1px solid ${sc.color}33`,
          fontSize: 11,
          lineHeight: 1.6,
          color: "var(--text-primary)",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 3, color: sc.color }}>
          📋 {confidence === "high" ? "强" : ""}信号策略
        </div>
        {strategy}
      </div>

      <div className="gex-card-footer" style={{ marginTop: 8 }}>
        <span className="gex-card-hint">{`GEX 实时分析 ${DOT} 仅供参考 ${DOT} 不构成投资建议`}</span>
      </div>
    </div>
  );
}

export default function InfoCards({ data, history }: InfoCardsProps) {
  return <TradingSuggestion data={data} />;
}
