/** GET /history 列式热力图载荷 */
export interface HistoryHeatmapPayload {
  span: number;
  t: number[];
  p: number[];
  f: (number | null)[];
  k: number[];
  z: (number | null)[][];
}

export const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const HEATMAP_BUCKET_MS = 60 * 60 * 1000;
export const HEATMAP_STRIKE_SPAN = 0.25;

export function emptyHeatmapPayload(): HistoryHeatmapPayload {
  return { span: HEATMAP_STRIKE_SPAN, t: [], p: [], f: [], k: [], z: [] };
}