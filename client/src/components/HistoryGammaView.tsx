import { HistoryHeatmapPayload } from "../types";
import { HISTORY_DAYS } from "./historyChartTime";
import { fmtTenor } from "./format";
import HistoryHeatmapChart, { heatmapSubtitle } from "./HistoryHeatmapChart";

export default function HistoryGammaView({
  payload,
  revision,
}: {
  payload: HistoryHeatmapPayload;
  revision: string;
}) {
  return (
    <div className="history-gf-view">
      <HistoryHeatmapChart payload={payload} revision={revision} />
    </div>
  );
}

export function historySpanLabel(payload: HistoryHeatmapPayload): string | null {
  if (payload.t.length < 2) return null;
  const first = payload.t[0];
  const last = payload.t[payload.t.length - 1];
  const hours = (last - first) / (60 * 60 * 1000);
  const heat = heatmapSubtitle(payload);
  const windowDays = Math.min(HISTORY_DAYS, hours / 24);
  return `${fmtTenor(windowDays)} / ${HISTORY_DAYS} 天 · ${payload.t.length} 点/时 · ${heat}`;
}