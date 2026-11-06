import { useEffect, useState } from "react";
import { useGexData } from "../hooks/useGexData";
import {
  GexAnalysis,
  StrikeExpiry,
  StrikeGex,
  VENUE_LABEL,
  VenueFilter,
  VenueStatus,
} from "../types";
import { fmtAge, fmtBtc, fmtPx, fmtTenor, fmtUsd, gexAtSpotOnCurve } from "./format";
import { HelpTip } from "./HelpTip";
import SpaceChart from "./SpaceChart";
import SpeedChart from "./SpeedChart";
import TimeChart from "./TimeChart";

const HELP = {
  flip: "净 Gamma 从正变负（或反过来）的价位。多在翻转上方波动偏小、下方偏大。数字距现货越远，短期越难「贴」着走。",
  support:
    "现价下方净 Gamma 最负的一档：波动容易被放大，适合当风险参考，不要当传统支撑位。",
  resistance:
    "现价上方净 Gamma 最正的一档：正 Gamma 倾向压制波动，价格容易被「吸」向这一带。",
  hedge:
    "把全市场净 Gamma 换成美元：现货涨、跌各 1% 时，做市商大概要买还是卖多少才能对冲。涨、跌方向相反，金额相同。",
  skew: "近端 25Δ 风险逆转（RR）。为正表示防跌期权更贵，为负表示追涨期权更贵。",
  venueFlip: "各交易所用自己的持仓单独算的翻转价，和顶栏聚合翻转可能不一致。",
  space:
    "上：各行权价的净 Gamma 对冲（±1% 波动），柱色深浅表示强度；下：绝对 Gamma 曲线。虚线=现价；「±1日」文字=一日预期波动距离（无底色）。绿/橘红/蓝竖带分别是 P1–P2、N1–N2、A1–A2 双峰区间。图例为算法关键点及当前价位；点柱看到期拆分。",
  time: "最近 8 个到期日：柱=该日净 Gamma 对冲，色柱规则与空间图相同；黑线=平值 IV。悬停可看涨跌各需买/卖多少。",
  speed:
    "不是成交速度。横轴=若现货在这里；纵轴=该价位下的净 Gamma 对冲（±1% 美元量）。曲线越陡，对冲需求随价位变化越快。虚线=现价，紫线=翻转。副标题「至 ±1% 档」=移到 ±1% 情景后的对冲量，括号 Δ 为与现在的差。",
} as const;

const REFRESH_SECONDS = 60;
const PILLS: VenueFilter[] = ["all", "deribit", "binance", "okx"];

export default function Dashboard() {
  const { data, loading, error, refresh, venue, setVenue } = useGexData();
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    setCountdown(REFRESH_SECONDS);
    const timer = setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          refresh();
          return REFRESH_SECONDS;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [refresh, data?.timestamp]);

  const price = data?.underlyingPrice ?? 0;
  const flip = data?.flipPoint ?? null;
  const support = data?.levels.support?.strike ?? null;
  const resistance = data?.levels.resistance?.strike ?? null;
  const revision = data ? `${data.venue}:${data.timestamp}` : "empty";
  const offline = data?.venues.filter((item) => !item.online) ?? [];
  const shown = data?.venues.filter((item) => item.included && item.online) ?? [];
  const flips = (data?.venues ?? []).filter(
    (item) => item.online && item.flipPoint != null && item.flipPoint > 0,
  );
  const pickedRow = data?.strikes.find((row) => row.strike === picked) ?? null;
  const oneDay = data?.move?.oneDay ?? null;
  const changeLabel = data?.change ? fmtAge(data.change.ageHours) : null;

  return (
    <div className="board">
      <header className="board-head">
        <div className="board-id">
          <span className="board-mark">BTC</span>
          <span className="board-px">{price > 0 ? fmtPx(price) : "—"}</span>
          {data && data.quality.contractsUsed > 0 && (
            <Regime pressure={data.hedgingPressure} />
          )}
        </div>
        <div className="board-pills">
          {PILLS.map((item) => (
            <button
              key={item}
              type="button"
              className={pillClass(item, venue, data?.venues)}
              onClick={() => setVenue(item)}
            >
              {VENUE_LABEL[item]}
            </button>
          ))}
        </div>
        <button type="button" className="board-refresh" onClick={refresh} disabled={loading}>
          {loading ? "读取" : `${countdown}s`}
        </button>
      </header>

      {data && price > 0 && data.quality.contractsUsed > 0 && (
        <section className="board-stats">
          <Stat
            k="翻转"
            help={HELP.flip}
            v={flip ? fmtPx(flip) : "附近没有"}
            s={flip ? flipNote(price, flip, data.change) : "±30% 内未穿过 0"}
          />
          <Stat
            k="支撑"
            help={HELP.support}
            v={support ? fmtPx(support) : "—"}
            s={support ? levelNote(support, price, oneDay, "下方最重的负 Gamma") : "下方最重的负 Gamma"}
          />
          <Stat
            k="阻力"
            help={HELP.resistance}
            v={resistance ? fmtPx(resistance) : "—"}
            s={
              resistance
                ? levelNote(resistance, price, oneDay, "上方最重的正 Gamma")
                : "上方最重的正 Gamma"
            }
          />
          <Stat
            k="1% 波动对冲"
            help={HELP.hedge}
            v={fmtUsd(Math.abs(data.totalNetGex))}
            s={hedgeBothWays(data.totalNetGex)}
            tone={data.totalNetGex >= 0 ? "green" : "red"}
          />
          <Stat
            k="偏斜"
            help={HELP.skew}
            v={data.skew ? `${data.skew.rr >= 0 ? "+" : ""}${(data.skew.rr * 100).toFixed(1)}` : "—"}
            s={
              data.skew
                ? `${fmtTenor(data.skew.days)} · ${data.skew.rr >= 0 ? "下跌保险更贵" : "上涨保险更贵"}`
                : "近端没有 25Δ"
            }
          />
          {flips.length >= 2 && (
            <div className="stat venue-flips">
              <span className="stat-k">
                分所翻转
                <HelpTip>{HELP.venueFlip}</HelpTip>
              </span>
              <span className="stat-v venue-flip-v">
                {flips
                  .map((item) => `${VENUE_LABEL[item.venue]} ${fmtPx(item.flipPoint ?? 0)}`)
                  .join(" · ")}
              </span>
              <span className="stat-s">各所自己的持仓，不是聚合价</span>
            </div>
          )}
        </section>
      )}

      {(error || offline.length > 0) && (
        <p className="board-note">
          {error}
          {error && offline.length > 0 ? " · " : ""}
          {offline.length > 0 &&
            `${offline.map((item) => VENUE_LABEL[item.venue]).join("、")} 没连上`}
          {shown.length > 0 && offline.length > 0
            ? `，图上是 ${shown.map((item) => VENUE_LABEL[item.venue]).join("、")}`
            : ""}
        </p>
      )}

      <main className="board-grid">
        <section className="panel space-panel">
          <PanelTitle
            k="空间"
            help={HELP.space}
            s={
              pickedRow
                ? "点选的这一档"
                : oneDay
                  ? `一日 ±${fmtPx(oneDay)} · 点一根柱看到期`
                  : "点一根柱看到期 · 标记含义见下图例"
            }
          />
          {pickedRow && <StrikeSplit row={pickedRow} changeLabel={changeLabel} />}
          {data && price > 0 && data.strikes.length > 0 ? (
            <SpaceChart
              strikes={data.strikes}
              price={price}
              support={support}
              resistance={resistance}
              oneDay={oneDay}
              markers={data.markers ?? []}
              changeLabel={changeLabel}
              revision={revision}
              onPick={setPicked}
            />
          ) : (
            <Empty loading={loading} />
          )}
        </section>
        <section className="panel">
          <PanelTitle k="时间" help={HELP.time} s="Gamma 和隐波落在哪一天" />
          {data && data.expiries.length > 0 ? (
            <TimeChart expiries={data.expiries} revision={revision} />
          ) : (
            <Empty loading={loading} />
          )}
        </section>
        <section className="panel">
          <PanelTitle k="速度" help={HELP.speed} s={speedNote(data)} />
          {data && price > 0 && data.gammaCurve.length > 0 ? (
            <SpeedChart
              curve={data.gammaCurve}
              price={price}
              flip={flip}
              revision={revision}
            />
          ) : (
            <Empty loading={loading} />
          )}
        </section>
      </main>

      <footer className="board-foot">
        {data
          ? `计入 ${data.quality.contractsUsed} 张 · 剔除 ${data.quality.contractsDropped} 张 · `
          : ""}
        数字是「每 1% 波动」要对冲的美元量：涨、跌方向相反，幅度一样。绿柱正 Gamma 时涨卖跌买。未平仓有数小时延迟，只供看结构。
      </footer>
    </div>
  );
}

function Regime({ pressure }: { pressure: "positive" | "negative" | "neutral" }) {
  const text =
    pressure === "positive" ? "抑制波动" : pressure === "negative" ? "放大波动" : "多空平衡";
  return <span className={`board-regime is-${pressure}`}>{text}</span>;
}

function Stat({
  k,
  v,
  s,
  tone,
  help,
}: {
  k: string;
  v: string;
  s: string;
  tone?: "green" | "red";
  help?: string;
}) {
  return (
    <div className="stat">
      <span className="stat-k">
        {k}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </span>
      <span className={`stat-v${tone ? ` is-${tone}` : ""}`}>{v}</span>
      <span className="stat-s">{s}</span>
    </div>
  );
}

function PanelTitle({ k, s, help }: { k: string; s: string; help?: string }) {
  return (
    <div className="panel-h">
      <div className="panel-h-row">
        <strong className="panel-h-k">{k}</strong>
        {help ? <HelpTip>{help}</HelpTip> : null}
      </div>
      <span className="panel-h-sub">{s}</span>
    </div>
  );
}

function Empty({ loading }: { loading: boolean }) {
  return <div className="panel-empty">{loading ? "正在读取 BTC 期权…" : "这个来源没有可用持仓"}</div>;
}

function pillClass(
  item: VenueFilter,
  selected: VenueFilter,
  venues: VenueStatus[] | undefined,
) {
  const online =
    item === "all"
      ? venues?.some((venue) => venue.online)
      : venues?.find((venue) => venue.venue === item)?.online;
  return [
    "board-pill",
    item === selected ? "is-on" : "",
    venues && online === false ? "is-off" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function hedgeBothWays(net: number): string {
  const amt = fmtUsd(Math.abs(net));
  if (net >= 0) return `涨 1% 卖 ${amt} · 跌 1% 买 ${amt} · 压制波动`;
  return `涨 1% 买 ${amt} · 跌 1% 卖 ${amt} · 放大波动`;
}

function fmtSpeedDelta(d: number): string {
  return `Δ${d >= 0 ? "+" : "−"}${fmtUsd(Math.abs(d))}`;
}

function speedNote(data: GexAnalysis | null | undefined): string {
  if (!data || !(data.underlyingPrice > 0)) return "±1% 对冲，涨跌方向相反";
  const net = data.totalNetGex;
  const amt = fmtUsd(Math.abs(net));
  const up = net >= 0 ? `卖 ${amt}` : `买 ${amt}`;
  const down = net >= 0 ? `买 ${amt}` : `卖 ${amt}`;
  const base = `↑1% ${up} · ↓1% ${down}`;
  const price = data.underlyingPrice;
  const afterUp = gexAtSpotOnCurve(data.gammaCurve, price * 1.01);
  const afterDown = gexAtSpotOnCurve(data.gammaCurve, price * 0.99);
  if (afterUp == null || afterDown == null) return base;
  return `${base} · 至+1%档 ${fmtUsd(Math.abs(afterUp))}（${fmtSpeedDelta(afterUp - net)}）· 至−1%档 ${fmtUsd(Math.abs(afterDown))}（${fmtSpeedDelta(afterDown - net)}）`;
}

function gapText(price: number, flip: number): string {
  const pct = (Math.abs(price - flip) / price) * 100;
  return flip < price ? `比现货低 ${pct.toFixed(1)}%` : `比现货高 ${pct.toFixed(1)}%`;
}

function flipNote(
  price: number,
  flip: number,
  change: { ageHours: number; flipPoint: number | null; price: number } | null,
): string {
  const gap = gapText(price, flip);
  if (!change?.flipPoint || !(change.price > 0)) return gap;
  const then = Math.abs(change.flipPoint - change.price) / change.price;
  const now = Math.abs(flip - price) / price;
  const drift = now < then - 0.0008 ? "靠近" : now > then + 0.0008 ? "走远" : "距离差不多";
  return `${gap} · ${fmtAge(change.ageHours)}前${drift}`;
}

function levelNote(strike: number, price: number, oneDay: number | null, fallback: string): string {
  if (!(oneDay && oneDay > 0) || !(price > 0)) return fallback;
  const units = Math.abs(strike - price) / oneDay;
  if (units < 1) return "在一日波动内";
  return `${units.toFixed(1)} 个日波动`;
}

function shownExpiries(rows: StrikeExpiry[]): StrikeExpiry[] {
  if (rows.length <= 6) return rows;
  const nearest = rows.slice(0, 5);
  const biggest = [...rows].sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex))[0];
  if (nearest.some((row) => row.expiry === biggest.expiry)) return nearest;
  return [...nearest, biggest].sort((a, b) => a.days - b.days);
}

function StrikeSplit({ row, changeLabel }: { row: StrikeGex; changeLabel: string | null }) {
  const delta = row.netThen == null ? null : row.netGex - row.netThen;
  return (
    <div className="strike-split">
      <strong>{fmtPx(row.strike)}</strong>
      {shownExpiries(row.byExpiry).map((slice) => (
        <span key={slice.expiry} className={slice.netGex >= 0 ? "is-pos" : "is-neg"}>
          {slice.expiry.slice(5).replace("-", "/")} {fmtTenor(slice.days)} {slice.netGex >= 0 ? "+" : "−"}
          {fmtUsd(Math.abs(slice.netGex))}
        </span>
      ))}
      <span>未平仓 {fmtBtc(row.oi)}</span>
      {row.volume != null && (
        <span>
          24h 成交 {fmtBtc(row.volume)}
          {row.volumePartial ? " · 部分来源" : ""}
        </span>
      )}
      {changeLabel && delta != null && (
        <span>
          较 {changeLabel}前 {delta >= 0 ? "+" : "−"}
          {fmtUsd(Math.abs(delta))}
        </span>
      )}
    </div>
  );
}
