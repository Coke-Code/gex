const POS_PEAK = "#60b077";
const NEG_PEAK = "#be4245";
const STEPS = 10;
const MIN_SCALE = 0.26;
const MAX_SCALE = 1;
const LEVELS = Array.from(
  { length: STEPS + 1 },
  (_, index) => MIN_SCALE + ((MAX_SCALE - MIN_SCALE) * index) / STEPS,
);
const BELOW_MEDIAN_STEPS = 5;
const ABOVE_MEDIAN_STEPS = 5;

/** 正负分开算中位数。≤ 中位数 5 档，> 中位数 5 档（到 10 倍中位数顶满）。空间、时间柱图共用。 */
export function barColors(values: number[]): string[] {
  const colors = values.map(() => shade(POS_PEAK, 0));
  for (const positive of [true, false]) {
    const indexes = values
      .map((value, index) => ({ value, index }))
      .filter((item) => (positive ? item.value > 0 : item.value < 0))
      .map((item) => item.index);
    if (indexes.length === 0) continue;
    const magnitudes = indexes.map((index) => Math.abs(values[index])).sort((a, b) => a - b);
    const mid = Math.floor(magnitudes.length / 2);
    const median =
      magnitudes.length % 2 === 0
        ? (magnitudes[mid - 1] + magnitudes[mid]) / 2
        : magnitudes[mid];
    const peak = positive ? POS_PEAK : NEG_PEAK;
    for (const index of indexes) {
      const ratio = median > 0 ? Math.abs(values[index]) / median : 1;
      colors[index] = shade(peak, ratio);
    }
  }
  return colors;
}

function shade(peak: string, ratio: number): string {
  const r = Math.max(0, ratio);
  let x: number;
  if (r <= 1) {
    x = r * BELOW_MEDIAN_STEPS;
  } else {
    const capped = Math.min(STEPS, r);
    x = BELOW_MEDIAN_STEPS + ((capped - 1) / (STEPS - 1)) * ABOVE_MEDIAN_STEPS;
  }
  x = Math.min(STEPS, x);
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
