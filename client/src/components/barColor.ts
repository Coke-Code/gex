const POS_PEAK = "#60b077";
const NEG_PEAK = "#be4245";
const STEPS = 10;
// 相对该区平均高度的 0 到 10 倍。10 倍及以上用极值色，再往下同色加深。
const LEVELS = Array.from({ length: STEPS + 1 }, (_, index) => 0.46 + (0.54 * index) / STEPS);

/** 正负分开算平均高度。大约每高一倍换一档，共 10 档，档与档之间平滑过渡。 */
export function barColors(values: number[]): string[] {
  const colors = values.map(() => shade(POS_PEAK, 0));
  for (const positive of [true, false]) {
    const indexes = values
      .map((value, index) => ({ value, index }))
      .filter((item) => (positive ? item.value > 0 : item.value < 0))
      .map((item) => item.index);
    if (indexes.length === 0) continue;
    const mean = indexes.reduce((sum, index) => sum + Math.abs(values[index]), 0) / indexes.length;
    const peak = positive ? POS_PEAK : NEG_PEAK;
    for (const index of indexes) {
      const ratio = mean > 0 ? Math.abs(values[index]) / mean : 1;
      colors[index] = shade(peak, ratio);
    }
  }
  return colors;
}

function shade(peak: string, ratio: number): string {
  const x = Math.min(STEPS, Math.max(0, ratio));
  const step = Math.min(STEPS - 1, Math.floor(x));
  return mix(darken(peak, LEVELS[step]), darken(peak, LEVELS[step + 1]), smooth(x - step));
}

function smooth(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

function darken(hex: string, scale: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((channel) =>
    Math.round(channel * scale)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${channels.join("")}`;
}

function mix(from: string, to: string, t: number): string {
  const hex = (color: string) => {
    const n = Number.parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = hex(from);
  const b = hex(to);
  const u = Math.min(1, Math.max(0, t));
  const channels = a.map((channel, index) => Math.round(channel + (b[index] - channel) * u));
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}
