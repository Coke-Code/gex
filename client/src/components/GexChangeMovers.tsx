import { StrikeGex } from "../types";
import { fmtBtc, fmtPx, fmtUsd } from "./format";
import { gexChangeRanked, gexChangeRows, totalNetDelta, totalOiDelta } from "./gexChangeRows";
import { oiDelta } from "./oiRows";

export const CHANGE_MOVER_LIMIT = 10;

export default function GexChangeMovers({
  strikes,
  price,
  ageLabel,
  spotThen,
}: {
  strikes: StrikeGex[];
  price: number;
  ageLabel: string;
  spotThen: number | null;
}) {
  const all = gexChangeRows(strikes, price);
  const movers = gexChangeRanked(strikes, price, CHANGE_MOVER_LIMIT);
  const netDelta = totalNetDelta(all);
  const netOi = totalOiDelta(all);
  const maxAbs = movers.reduce((peak, item) => Math.max(peak, item.abs), 1);

  if (movers.length === 0) {
    return <div className="change-movers-empty">±25% 内没有可对比的行权价</div>;
  }

  return (
    <div className="change-movers">
      <div className="change-movers-summary">
        <div className="change-movers-stat">
          <span className="change-movers-k">全样本 Δ 合计</span>
          <span className={`change-movers-v${netDelta >= 0 ? " is-pos" : " is-neg"}`}>
            {netDelta >= 0 ? "+" : "−"}
            {fmtUsd(Math.abs(netDelta))}
          </span>
        </div>
        {spotThen != null && spotThen > 0 && (
          <div className="change-movers-stat">
            <span className="change-movers-k">现货</span>
            <span className="change-movers-v is-meta">
              {fmtPx(spotThen)} → {fmtPx(price)}
            </span>
          </div>
        )}
        <div className="change-movers-stat">
          <span className="change-movers-k">基准</span>
          <span className="change-movers-v is-meta">约 {ageLabel}前</span>
        </div>
        {netOi != null && (
          <div className="change-movers-stat">
            <span className="change-movers-k">ΔOI 合计</span>
            <span className={`change-movers-v${netOi >= 0 ? " is-pos" : " is-neg"}`}>
              {netOi >= 0 ? "+" : "−"}
              {fmtBtc(Math.abs(netOi))}
            </span>
          </div>
        )}
      </div>
      <div className="change-mover-scroll">
        <div className="change-mover-head change-mover-row" aria-hidden>
          <span>#</span>
          <span>行权</span>
          <span>相对幅度</span>
          <span>ΔGEX</span>
          <span>ΔOI</span>
          <span>现在</span>
        </div>
        <ol className="change-mover-list">
        {movers.map(({ row, delta }, rank) => {
          const width = Math.max(6, (Math.abs(delta) / maxAbs) * 100);
          const dOi = oiDelta(row);
          return (
            <li key={row.strike} className="change-mover-item change-mover-row">
              <span className="change-mover-rank">{rank + 1}</span>
              <span className="change-mover-strike">{fmtPx(row.strike)}</span>
              <div className="change-mover-track" aria-hidden>
                <div
                  className={`change-mover-fill${delta >= 0 ? " is-pos" : " is-neg"}`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className={`change-mover-delta${delta >= 0 ? " is-pos" : " is-neg"}`}>
                {delta >= 0 ? "+" : "−"}
                {fmtUsd(Math.abs(delta))}
              </span>
              <span
                className={`change-mover-oi${dOi != null && dOi >= 0 ? " is-pos" : dOi != null ? " is-neg" : ""}`}
                title={dOi == null ? "基准快照无 OI" : undefined}
              >
                {dOi == null ? "—" : `${dOi >= 0 ? "+" : "−"}${fmtBtc(Math.abs(dOi))}`}
              </span>
              <span className="change-mover-now" title="当前净 GEX">
                {row.netGex >= 0 ? "+" : "−"}
                {fmtUsd(Math.abs(row.netGex))}
              </span>
            </li>
          );
        })}
        </ol>
      </div>
    </div>
  );
}
