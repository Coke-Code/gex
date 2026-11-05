export function fmtUsd(value: number): string {
  const abs = Math.abs(value);
  const body =
    abs >= 1e9
      ? `${(abs / 1e9).toFixed(1)}B`
      : abs >= 1e6
        ? `${(abs / 1e6).toFixed(1)}M`
        : abs >= 1e3
          ? `${(abs / 1e3).toFixed(0)}K`
          : abs.toFixed(0);
  return body;
}

export function fmtPx(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function fmtBtc(value: number): string {
  const abs = Math.abs(value);
  const body = abs >= 100 ? abs.toFixed(0) : abs >= 10 ? abs.toFixed(1) : abs.toFixed(2);
  return `${body} BTC`;
}

export function fmtAge(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} 分钟`;
  if (hours < 10) return `${hours.toFixed(1)} 小时`;
  return `${Math.round(hours)} 小时`;
}

export function fmtTenor(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}小时`;
  if (days < 10) return `${days.toFixed(days < 2 ? 1 : 0)}天`;
  return `${Math.round(days)}天`;
}
