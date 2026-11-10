import { ReactNode, useEffect, useState } from "react";
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
import TermStructureChart from "./TermStructureChart";
import ExpiryMetricsChart from "./ExpiryMetricsChart";
import GexChangeChart from "./GexChangeChart";
import GexChangeMovers from "./GexChangeMovers";
import HistoryGammaView, { historySpanLabel } from "./HistoryGammaView";
import OiWallChart, { oiWallNote } from "./OiWallChart";
import VolSkewChart from "./VolSkewChart";
import SummaryModuleCard from "./SummaryModuleCard";
import { useGexHistory } from "../hooks/useGexHistory";
import { buildGexSummary } from "./gexSummary";
import { BtcIcon, VenueFilterIcon, VenueIcon } from "./MarketIcons";

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
  term:
    "Term Structure（GammaFlip 风格）：横轴到期（含 TOTAL），纵轴价位。绿带 Positive peaks（P1–P2）、红带 Negative peaks（N1–N2）、Flip 线；右缘为带内说明。虚线=现货，左轴该高度标现价。",
  termMetrics: "各到期净 GEX（柱）与未平仓币数（线，右轴）。与左侧期限图并排，比例同 Gex Level 空间/预测。",
  change:
    "相对本地历史快照（约 4h 内最近一条）的净 GEX 变动，仅「全部」venue。左：按行权价的 Δ 柱；右：排行含 ΔOI——|ΔGEX| 大但 |ΔOI| 小多为重定价，两者同放大才是挪仓。",
  oiWall:
    "现货 ±25% 各行权价的期权 OI（BTC）。橘色为 OI 最厚的前 3 档「墙」，与 GEX 峰可一致也可背离；OI 有数小时延迟。",
  volSkew:
    "多到期 ATM IV（左轴）与 25Δ 风险逆转 RR（右轴，Put IV − Call IV）。RR 为正表示防跌更贵。",
  history:
    "上：关键价位；背景色带=Regime（绿 Sticky / 红 Jumpy / 灰 平衡，与顶栏同阈）。下：净 GEX 热力。空白格=无该档快照。",
  summaryModule:
    "由当前快照规则生成的摘要与交易参考，非投资建议。与同页图表同源数据。",
  forecast:
    "Net GEX Forecast（Gamma Profile）：假想现货在各价位时的净 Gamma 对冲。绿区 Sticky（正 GEX），红区 Jumpy（负 GEX）。曲线为展示样条，底层仍按 0.5% 步长计算。虚线=现价。",
} as const;

const REFRESH_SECONDS = 60;
const PILLS: VenueFilter[] = ["all", "deribit", "binance", "okx"];
type BoardTab = "gex" | "term" | "change" | "history";

export default function Dashboard() {
  const { data, loading, error, refresh, venue, setVenue } = useGexData();
  const [tab, setTab] = useState<BoardTab>("gex");
  const history = useGexHistory(tab === "history");
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [picked, setPicked] = useState<number | null>(null);
  const selectTab = (next: BoardTab) => {
    setTab(next);
    requestAnimationFrame(() => window.scrollTo(0, 0));
  };

  useEffect(() => {
    setCountdown(REFRESH_SECONDS);
    const timer = setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          refresh(true);
          return REFRESH_SECONDS;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [refresh, data?.timestamp]);

  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(id);
  }, [tab]);

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
  const summaryPack =
    data && price > 0 && data.quality.contractsUsed > 0
      ? buildGexSummary(data, venue)
      : null;

  return (
    <div className="board">
      <header className="board-head">
        <div className="board-id">
          <BtcIcon size={24} className="board-btc-icon" />
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
              <VenueFilterIcon venue={item} size={15} />
              <span className="board-pill-label">{VENUE_LABEL[item]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="board-refresh" onClick={() => refresh()} disabled={loading}>
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
                {flips.map((item) => (
                  <span
                    key={item.venue}
                    className="venue-flip-chip"
                    title={`${VENUE_LABEL[item.venue]} Flip`}
                  >
                    <VenueIcon venue={item.venue} size={16} />
                    <span>{fmtPx(item.flipPoint ?? 0)}</span>
                  </span>
                ))}
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

      <nav className="board-tabs" role="tablist" aria-label="图表视图">
        <BoardTabButton
          tabId="board-tab-gex"
          panelId="board-panel-gex"
          active={tab === "gex"}
          onSelect={() => selectTab("gex")}
        >
          GEX 水平
        </BoardTabButton>
        <BoardTabButton
          tabId="board-tab-term"
          panelId="board-panel-term"
          active={tab === "term"}
          onSelect={() => selectTab("term")}
        >
          GEX 期限
        </BoardTabButton>
        <BoardTabButton
          tabId="board-tab-change"
          panelId="board-panel-change"
          active={tab === "change"}
          onSelect={() => selectTab("change")}
        >
          GEX 变化
        </BoardTabButton>
        <BoardTabButton
          tabId="board-tab-history"
          panelId="board-panel-history"
          active={tab === "history"}
          onSelect={() => selectTab("history")}
        >
          GEX 演进
        </BoardTabButton>
      </nav>

      <main className="board-main">
        {tab === "gex" && (
        <div
          className="board-pane is-active"
          role="tabpanel"
          id="board-panel-gex"
          aria-labelledby="board-tab-gex"
        >
          <div className="board-grid board-grid--triple">
            <section className="panel space-panel panel--main">
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
            <section className="panel forecast-panel panel--side-top">
              <PanelTitle k="预测" help={HELP.forecast} s={speedNote(data)} />
              {data && price > 0 && data.gammaCurve.length > 0 ? (
                <SpeedChart
                  curve={data.gammaCurve}
                  price={price}
                  flip={flip}
                  markers={data.markers ?? []}
                  revision={revision}
                />
              ) : (
                <Empty loading={loading} />
              )}
            </section>
            <section className="panel summary-module-panel panel--side-summary">
              <PanelTitle
                k={summaryPack?.modules[0].title ?? "摘要"}
                help={HELP.summaryModule}
                s={summaryPack?.modules[0].lead ?? "波动环境"}
              />
              <SummaryModuleCard module={summaryPack?.modules[0] ?? null} />
            </section>
          </div>
        </div>
        )}
        {tab === "term" && (
        <div
          className="board-pane is-active"
          role="tabpanel"
          id="board-panel-term"
          aria-labelledby="board-tab-term"
        >
          <div className="board-grid board-grid--triple">
            <section className="panel term-structure-panel panel--main">
              <PanelTitle
                k="期限"
                help={HELP.term}
                s={termStructureNote(data?.termStructure)}
              />
              {data && data.termStructure.length > 0 && price > 0 ? (
                <TermStructureChart
                  slices={data.termStructure}
                  price={price}
                  revision={revision}
                />
              ) : (
                <Empty loading={loading} />
              )}
            </section>
            <section className="panel term-metrics-panel panel--side-top">
              <PanelTitle k="到期 NET / OI" help={HELP.termMetrics} s="净 GEX · OI（BTC）" />
              {data && data.expiries.length > 0 && price > 0 ? (
                <ExpiryMetricsChart expiries={data.expiries} revision={revision} />
              ) : (
                <Empty loading={loading} />
              )}
              <PanelTitle
                k="IV · Skew"
                help={HELP.volSkew}
                s={(data?.skewTerm?.length ?? 0) > 0 ? "ATM IV · 25Δ RR" : "暂无多到期 RR"}
              />
              {data && data.expiries.length > 0 && (data.skewTerm?.length ?? 0) > 0 ? (
                <VolSkewChart
                  expiries={data.expiries}
                  skewTerm={data.skewTerm ?? []}
                  revision={revision}
                />
              ) : (
                <div className="panel-empty panel-empty--sm">近端缺少可算 25Δ 的到期</div>
              )}
            </section>
            <section className="panel summary-module-panel panel--side-summary">
              <PanelTitle
                k={summaryPack?.modules[1].title ?? "摘要"}
                help={HELP.summaryModule}
                s={summaryPack?.modules[1].lead ?? "关键价位"}
              />
              <SummaryModuleCard module={summaryPack?.modules[1] ?? null} />
            </section>
          </div>
        </div>
        )}
        {tab === "change" && (
        <div
          className="board-pane is-active"
          role="tabpanel"
          id="board-panel-change"
          aria-labelledby="board-tab-change"
        >
          <div className="board-grid board-grid--triple">
            <section className="panel change-map-panel panel--main">
              <div className="change-main-stack">
                <div className="change-main-gex">
                  <PanelTitle
                    k="Δ 空间"
                    help={HELP.change}
                    s={changeMapNote(data, venue, changeLabel)}
                  />
                  {data && price > 0 && venue === "all" && data.change ? (
                    <GexChangeChart
                      strikes={data.strikes}
                      price={price}
                      ageHours={data.change.ageHours}
                      revision={revision}
                    />
                  ) : (
                    <ChangeEmpty loading={loading} venue={venue} hasChange={Boolean(data?.change)} />
                  )}
                </div>
                <div className="change-main-oi">
                  <PanelTitle
                    k="OI 墙"
                    help={HELP.oiWall}
                    s={data && price > 0 ? oiWallNote(data.strikes, price) : "现货 ±25%"}
                  />
                  {data && price > 0 && data.strikes.length > 0 ? (
                    <OiWallChart strikes={data.strikes} price={price} revision={revision} />
                  ) : (
                    <Empty loading={loading} />
                  )}
                </div>
              </div>
            </section>
            <section className="panel change-movers-panel panel--side-top">
              <PanelTitle
                k="变动排行"
                s="±25% 内 |ΔGEX| 前 10 · 对照 ΔOI"
              />
              {data && price > 0 && venue === "all" && data.change && changeLabel ? (
                <GexChangeMovers
                  strikes={data.strikes}
                  price={price}
                  ageLabel={changeLabel}
                  spotThen={data.change.price}
                />
              ) : (
                <ChangeEmpty loading={loading} venue={venue} hasChange={Boolean(data?.change)} />
              )}
            </section>
            <section className="panel summary-module-panel panel--side-summary">
              <PanelTitle
                k={summaryPack?.modules[2].title ?? "摘要"}
                help={HELP.summaryModule}
                s={summaryPack?.modules[2].lead ?? "流向与变化"}
              />
              <SummaryModuleCard module={summaryPack?.modules[2] ?? null} />
            </section>
          </div>
        </div>
        )}
        {tab === "history" && (
        <div
          className="board-pane is-active"
          role="tabpanel"
          id="board-panel-history"
          aria-labelledby="board-tab-history"
        >
          <div className="board-grid board-grid--triple">
            <section className="panel history-panel panel--main">
              <PanelTitle
                k="结构演进"
                help={HELP.history}
                s={historySpanLabel(history.points) ?? "等待本地采样"}
              />
              {history.points.length >= 2 ? (
                <HistoryGammaView points={history.points} revision={`history@${history.points.length}`} />
              ) : (
                <HistoryEmpty loading={history.loading || loading} error={history.error} />
              )}
            </section>
            <section className="panel history-side-panel panel--side-top">
              <PanelTitle k="相对 4h 基准" help={HELP.change} s={changeMapNote(data, venue, changeLabel)} />
              {data && price > 0 && venue === "all" && data.change ? (
                <GexChangeChart
                  strikes={data.strikes}
                  price={price}
                  ageHours={data.change.ageHours}
                  revision={revision}
                />
              ) : (
                <ChangeEmpty loading={loading} venue={venue} hasChange={Boolean(data?.change)} />
              )}
            </section>
            <section className="panel summary-module-panel panel--side-summary">
              <PanelTitle
                k={summaryPack?.modules[0].title ?? "摘要"}
                help={HELP.summaryModule}
                s={summaryPack?.modules[0].lead ?? "波动环境"}
              />
              <SummaryModuleCard module={summaryPack?.modules[0] ?? null} />
            </section>
          </div>
        </div>
        )}
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

function BoardTabButton({
  tabId,
  panelId,
  active,
  onSelect,
  children,
}: {
  tabId: string;
  panelId: string;
  active: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={tabId}
      aria-selected={active}
      aria-controls={panelId}
      className={`board-tab${active ? " is-active" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {children}
    </button>
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

function HistoryEmpty({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <div className="panel-empty">正在读取历史…</div>;
  if (error) return <div className="panel-empty">{error}</div>;
  return (
    <div className="panel-empty">
      本地还没有足够采样。服务运行约 10 分钟后会出现第二点；全链路需保持 API 在「全部」venue 下定期刷新。
    </div>
  );
}

function ChangeEmpty({
  loading,
  venue,
  hasChange,
}: {
  loading: boolean;
  venue: VenueFilter;
  hasChange: boolean;
}) {
  if (loading) return <div className="panel-empty">正在读取 BTC 期权…</div>;
  if (venue !== "all") {
    return <div className="panel-empty">GEX 变化仅「全部」聚合。请切到全部 venue。</div>;
  }
  if (!hasChange) {
    return (
      <div className="panel-empty">
        本地还没有历史快照。服务运行数小时后会自动存盘，并与约 4 小时前最近一条对比。
      </div>
    );
  }
  return <div className="panel-empty">暂无可用数据</div>;
}

function changeMapNote(
  data: GexAnalysis | null,
  venue: VenueFilter,
  changeLabel: string | null,
): string {
  if (venue !== "all") return "需「全部」venue";
  if (!data?.change || !changeLabel) return "等待历史基准";
  return `较 ${changeLabel}前 · 现货 ±25% · 绿增红减`;
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

function termStructureNote(slices: GexAnalysis["termStructure"] | undefined): string {
  if (!slices || slices.length === 0) return "近端到期 · P/N/A 带、Flip、Max Pain";
  const rows = slices.length;
  const contracts = slices.reduce((sum, row) => sum + row.contractsUsed, 0);
  const partial = slices.filter((row) => row.qualityNote?.includes("缺")).length;
  return `${rows} 个到期 · ${contracts} 张 · ★ 同价带${partial > 0 ? ` · ${partial} 行缺所` : ""} · OI 延迟`;
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
