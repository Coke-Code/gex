import { HistorySnap } from "../types";
import { fmtTenor } from "./format";
import HistoryHeatmapChart, { heatmapSubtitle } from "./HistoryHeatmapChart";
import HistoryLevelsChart from "./HistoryLevelsChart";

export default function HistoryGammaView({
  points,
  revision,
}: {
  points: HistorySnap[];
  revision: string;
}) {
  return (
    <div className="history-gf-view">
      <HistoryLevelsChart points={points} revision={revision} />
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
  return `约 ${fmtTenor(hours / 24)} · ${points.length} 点 · ${heat}`;
}
