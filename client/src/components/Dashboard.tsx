import { useEffect, useState } from "react";
import { useGexData } from "../hooks/useGexData";
import { StrikeExpiry, StrikeGex, VENUE_LABEL, VenueFilter, VenueStatus } from "../types";
import { fmtAge, fmtBtc, fmtPx, fmtTenor, fmtUsd } from "./format";
import SpaceChart from "./SpaceChart";
import SpeedChart from "./SpeedChart";
import TimeChart from "./TimeChart";

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
            v={flip ? fmtPx(flip) : "附近没有"}
            s={flip ? flipNote(price, flip, data.change) : "±30% 内未穿过 0"}
          />
          <Stat
            k="支撑"
            v={support ? fmtPx(support) : "—"}
            s={support ? levelNote(support, price, oneDay, "下方最重的负 Gamma") : "下方最重的负 Gamma"}
          />
          <Stat
            k="阻力"
            v={resistance ? fmtPx(resistance) : "—"}
            s={
              resistance
                ? levelNote(resistance, price, oneDay, "上方最重的正 Gamma")
                : "上方最重的正 Gamma"
            }
          />
          <Stat
            k={data.totalNetGex >= 0 ? "上涨 1% 卖出" : "上涨 1% 买入"}
            v={fmtUsd(Math.abs(data.totalNetGex))}
            s={data.totalNetGex >= 0 ? "做市商压制波动" : "做市商放大波动"}
            tone={data.totalNetGex >= 0 ? "green" : "red"}
          />
          <Stat
            k="偏斜"
            v={data.skew ? `${data.skew.rr >= 0 ? "+" : ""}${(data.skew.rr * 100).toFixed(1)}` : "—"}
            s={
              data.skew
                ? `${fmtTenor(data.skew.days)} · ${data.skew.rr >= 0 ? "下跌保险更贵" : "上涨保险更贵"}`
                : "近端没有 25Δ"
            }
          />
          {flips.length >= 2 && (
            <div className="stat venue-flips">
              <span className="stat-k">分所翻转</span>
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
            s={
              pickedRow
                ? "点选的这一档"
                : oneDay
                  ? `一日 ±${fmtPx(oneDay)} · P/N 峰 · A 磁铁 · S 稳定 · V 放大 · GC 悬崖`
                  : "P/N 峰 · A 磁铁 · S 稳定 · V 放大 · GC 悬崖"
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
          <PanelTitle k="时间" s="Gamma 和隐波落在哪一天" />
          {data && data.expiries.length > 0 ? (
            <TimeChart expiries={data.expiries} revision={revision} />
          ) : (
            <Empty loading={loading} />
          )}
        </section>
        <section className="panel">
          <PanelTitle
            k="速度"
            s={
              data?.speed.gexChangePer1Pct == null
                ? "价格再走，对冲额怎么变"
                : `再涨 1%，对冲额${data.speed.gexChangePer1Pct >= 0 ? "增加" : "减少"} ${fmtUsd(Math.abs(data.speed.gexChangePer1Pct))}`
            }
          />
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
        绿柱是正 Gamma，价格上去做市商卖、下来买。未平仓有数小时延迟，只供看结构。
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
}: {
  k: string;
  v: string;
  s: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="stat">
      <span className="stat-k">{k}</span>
      <span className={`stat-v${tone ? ` is-${tone}` : ""}`}>{v}</span>
      <span className="stat-s">{s}</span>
    </div>
  );
}

function PanelTitle({ k, s }: { k: string; s: string }) {
  return (
    <div className="panel-h">
      <strong>{k}</strong>
      <span>{s}</span>
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
