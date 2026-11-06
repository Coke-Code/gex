import { GexAnalysis, VenueFilter } from "../types";
import { fmtAge, fmtBtc, fmtPx, fmtTenor, fmtUsd, gexAtSpotOnCurve } from "./format";
import { gexChangeRanked, gexChangeRows, totalNetDelta } from "./gexChangeRows";

export interface SummaryModule {
  title: string;
  lead: string;
  facts: string[];
  ideas: string[];
}

export interface GexSummary {
  modules: [SummaryModule, SummaryModule, SummaryModule];
  disclaimer: string;
}

function markerPrice(data: GexAnalysis, id: string): number | null {
  return data.markers.find((marker) => marker.id === id)?.price ?? null;
}

function pctFromSpot(price: number, level: number): string {
  const pct = ((level - price) / price) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function regimeModule(data: GexAnalysis): SummaryModule {
  const price = data.underlyingPrice;
  const flip = data.flipPoint;
  const spotGex = gexAtSpotOnCurve(data.gammaCurve, price);
  const aboveFlip = flip != null && price > flip;
  const pressure =
    data.hedgingPressure === "positive"
      ? "正 Gamma 主导（Sticky）"
      : data.hedgingPressure === "negative"
        ? "负 Gamma 主导（Jumpy）"
        : "Gamma 接近中性";

  const facts: string[] = [
    pressure,
    `全链 1% 波动对冲约 ${fmtUsd(Math.abs(data.totalNetGex))}（涨卖跌买方向与净 GEX 符号一致）`,
  ];
  if (flip != null) {
    facts.push(
      `翻转 ${fmtPx(flip)}（现货 ${aboveFlip ? "在其上" : "在其下"} ${pctFromSpot(price, flip)}）`,
    );
  } else {
    facts.push("±30% 窗口内未找到明确 Gamma 翻转");
  }
  if (spotGex != null) {
    facts.push(`预测曲线在现价插值净 GEX ${spotGex >= 0 ? "+" : "−"}${fmtUsd(Math.abs(spotGex))}`);
  }
  if (data.move?.oneDay) {
    facts.push(
      `近端 ${fmtTenor(data.move.days)} ATM IV ${(data.move.iv * 100).toFixed(0)}% · 1σ 一日约 ±${fmtPx(data.move.oneDay)}`,
    );
  }

  const ideas: string[] = [];
  if (data.hedgingPressure === "positive") {
    ideas.push("波动易被做市对冲压制，大幅单边后倾向均值回归；卖波动需防突破正 Gamma 带。");
    ideas.push("短线更宜区间思路，追涨杀跌时留意 Flip 上方是否仍为正 Gamma。");
  } else if (data.hedgingPressure === "negative") {
    ideas.push("负 Gamma 下趋势段易自我强化，突破后波动放大；顺势需紧止损，不宜盲目摸顶底。");
    ideas.push("事件/趋势日优先尊重方向，反转需等波动峰值或回到 Flip 另一侧再评估。");
  } else {
    ideas.push("Gamma 中性时价格更多由现货流与 IV 驱动，GEX 作辅助过滤而非主信号。");
  }
  if (flip != null && Math.abs(price - flip) / price < 0.02) {
    ideas.push("现价贴近 Flip，Regime 易切换，缩小仓位或放宽波动预期。");
  }

  return {
    title: "波动环境",
    lead: "当前净 Gamma 如何塑造波动与对冲流向。",
    facts,
    ideas,
  };
}

function levelsModule(data: GexAnalysis): SummaryModule {
  const price = data.underlyingPrice;
  const support = data.levels.support;
  const resistance = data.levels.resistance;
  const p1 = markerPrice(data, "P1");
  const n1 = markerPrice(data, "N1");

  const facts: string[] = [];
  if (resistance) {
    facts.push(
      `阻力 ${fmtPx(resistance.strike)}（${pctFromSpot(price, resistance.strike)} · 正 Gamma 峰）`,
    );
  }
  if (support) {
    facts.push(
      `支撑 ${fmtPx(support.strike)}（${pctFromSpot(price, support.strike)} · 负 Gamma 峰）`,
    );
  }
  if (p1 != null) facts.push(`正峰 P1 ${fmtPx(p1)}（${pctFromSpot(price, p1)}）`);
  if (n1 != null) facts.push(`负峰 N1 ${fmtPx(n1)}（${pctFromSpot(price, n1)}）`);

  const realExpiries = data.termStructure.filter((row) => row.expiry !== "TOTAL");
  const near = realExpiries[0];
  if (near?.flipPoint != null) {
    facts.push(
      `最近到期 ${near.expiry} Flip ${fmtPx(near.flipPoint)}（${pctFromSpot(price, near.flipPoint)}）`,
    );
  }
  if (near?.maxPain != null) {
    facts.push(`最近到期 Max Pain ${fmtPx(near.maxPain)}（${pctFromSpot(price, near.maxPain)}）`);
  }
  if (facts.length === 0) facts.push("关键标记不足，请查看 Gex Level 空间图。");

  const ideas: string[] = [];
  if (resistance && price < resistance.strike) {
    ideas.push(`上方 ${fmtPx(resistance.strike)} 一带正 Gamma 厚，急涨接近时波动可能收敛，不宜无脑追价。`);
  }
  if (support && price > support.strike) {
    ideas.push(`下方 ${fmtPx(support.strike)} 负 Gamma 重，急跌时对冲卖盘可能放大波动，抄底需控制杠杆。`);
  }
  if (near?.maxPain != null && Math.abs(price - near.maxPain) / price > 0.05) {
    ideas.push("近端 Max Pain 与现货有距离，到期周留意向 Max Pain 的 Gamma/收租效应，非硬目标。");
  }
  if (ideas.length === 0) {
    ideas.push("结合空间图 P/N 带与 Term 期限 Flip，确认价位是否多到期叠合（★）。");
  }

  return {
    title: "关键价位",
    lead: "支撑/阻力、峰位与近端期限结构。",
    facts,
    ideas,
  };
}

function flowModule(data: GexAnalysis, venue: VenueFilter): SummaryModule {
  const price = data.underlyingPrice;
  const facts: string[] = [];

  if (data.skew) {
    const rr = data.skew.rr * 100;
    facts.push(
      `${fmtTenor(data.skew.days)} 25Δ RR ${rr >= 0 ? "+" : ""}${rr.toFixed(1)}（${rr >= 0 ? "防跌更贵" : "追涨更贵"}）`,
    );
  }

  const nearExp = data.expiries[0];
  if (nearExp) {
    facts.push(
      `最近到期 ${nearExp.expiry.slice(5)} 净 GEX ${nearExp.netGex >= 0 ? "+" : "−"}${fmtUsd(Math.abs(nearExp.netGex))} · OI ${fmtBtc(nearExp.oi)}`,
    );
  }

  const onlineFlips = data.venues.filter((v) => v.online && v.flipPoint != null);
  if (onlineFlips.length >= 2) {
    const spread =
      Math.max(...onlineFlips.map((v) => v.flipPoint as number)) -
      Math.min(...onlineFlips.map((v) => v.flipPoint as number));
    if (spread / price > 0.005) {
      facts.push(`分所 Flip Spread 约 ${fmtPx(spread)}，持仓结构所所不一`);
    }
  }

  if (venue === "all" && data.change) {
    const rows = gexChangeRows(data.strikes, price);
    const net = totalNetDelta(rows);
    const top = gexChangeRanked(data.strikes, price, 1)[0];
    facts.push(`较 ${fmtAge(data.change.ageHours)}前 全样本 Δ 合计 ${net >= 0 ? "+" : "−"}${fmtUsd(Math.abs(net))}`);
    if (top) {
      facts.push(
        `变动最大行权 ${fmtPx(top.row.strike)}（Δ ${top.delta >= 0 ? "+" : "−"}${fmtUsd(Math.abs(top.delta))}）`,
      );
    }
  } else if (venue !== "all") {
    facts.push("GEX 变化对比需切到「全部」聚合。");
  } else {
    facts.push("暂无本地历史快照，变化模块待积累数据。");
  }

  const ideas: string[] = [];
  if (data.skew && data.skew.rr > 0.02) {
    ideas.push("RR 偏正：市场为尾部下跌付溢价，突发利空时 IV 易涨；做多波动偏 Put 或 Calender 需计成本。");
  } else if (data.skew && data.skew.rr < -0.02) {
    ideas.push("RR 偏负：追涨期权相对更贵，急涨后 Call 溢价回落风险；顺势 Call 注意 IV 回吐。");
  }
  if (venue === "all" && data.change) {
    const top = gexChangeRanked(data.strikes, price, 1)[0];
    if (top && top.abs > Math.abs(data.totalNetGex) * 0.15) {
      ideas.push(
        `${fmtPx(top.row.strike)} 一带持仓结构变化最快，突破/回踩该档时波动与对冲流可能加剧。`,
      );
    }
    ideas.push("结构变化快于价格时，优先看 Gex Change 是否与方向一致，避免逆势硬扛。");
  }
  if (ideas.length === 0) {
    ideas.push("偏斜与近端 OI 稳定时，以 Regime + 关键价位为主规划仓位。");
  }

  return {
    title: "流向与变化",
    lead: "偏斜、近端持仓与相对历史的 GEX 漂移。",
    facts,
    ideas,
  };
}

export function buildGexSummary(data: GexAnalysis | null, venue: VenueFilter): GexSummary | null {
  if (!data || !(data.underlyingPrice > 0) || data.quality.contractsUsed === 0) return null;
  return {
    modules: [regimeModule(data), levelsModule(data), flowModule(data, venue)],
    disclaimer: "以上由当前 GEX 快照规则生成，仅供结构研究，不构成投资建议。OI 有延迟。",
  };
}
