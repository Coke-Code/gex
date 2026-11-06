/** 手机 / 触控：整页滚动优先，少让 Plotly 抢手势 */
export function touchScrollFriendly(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
}

export function plotDragMode(): false | "pan" {
  return touchScrollFriendly() ? false : "pan";
}

/** 触控上关掉 hover，避免第一次点只出 tooltip、Tab/点选要连点 */
export function plotHoverMode(desktop: string | false): string | false {
  return touchScrollFriendly() ? false : desktop;
}
