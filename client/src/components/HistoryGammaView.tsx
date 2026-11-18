import { HistorySnap } from "../types";
import { HISTORY_DAYS } from "./historyChartTime";
import { fmtTenor } from "./format";
import HistoryHeatmapChart, { heatmapSubtitle } from "./HistoryHeatmapChart";

export default function HistoryGammaView({
  points,
  revision,
}: {
  points: HistorySnap[];
  revision: string;
}) {
  return (
    <div className="history-gf-view">
      <HistoryHeatmapChart points={points} revision={revision} />
    </div>
  );
}

export function historySpanLabel(points: HistorySnap[]): string | null {
  if (points.length < 2) return null;
  const first = points[0].timestamp;
  const last = points[points.length - 1].timestamp;
  const hours = (last - first) / (60 * 60 * 1000);
  const heat = heatmapSubtitle(points);
  const windowDays = Math.min(HISTORY_DAYS, hours / 24);
  return `${fmtTenor(windowDays)} / ${HISTORY_DAYS} 天 · ${points.length} 点 · ${heat}`;
}
