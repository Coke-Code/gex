import { useCallback, useEffect, useRef, type RefObject } from "react";
import { plotDragMode, touchScrollFriendly } from "./plotTouch";

type AxisLayout = { range?: number[]; [key: string]: unknown };
type FigureLayout = {
  uirevision?: string;
  dragmode?: string | false;
  xaxis?: AxisLayout;
  yaxis?: AxisLayout;
  yaxis2?: AxisLayout;
  [key: string]: unknown;
};

type HomeAxis = { range?: number[] };
type HomeView = {
  key: string;
  xaxis?: HomeAxis;
  yaxis?: HomeAxis;
  yaxis2?: HomeAxis;
};

function capture(layout: FigureLayout): HomeView {
  const axis = (value: unknown): HomeAxis | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const range = (value as AxisLayout).range;
    return { range: range ? [...range] : undefined };
  };
  return {
    key: String(layout.uirevision ?? "plot").split("@")[0],
    xaxis: axis(layout.xaxis),
    yaxis: axis(layout.yaxis),
    yaxis2: axis(layout.yaxis2),
  };
}

type PlotOptions = {
  onPick?: (x: number) => void;
  /** 悬停时在 x 轴附近贴一行权价/价格标签 */
  xHoverLabel?: { y: number; format: (x: number) => string };
};

export function usePlot(
  getFigure: () => { traces: unknown[]; layout: FigureLayout },
  revision: string,
  options?: PlotOptions,
) {
  const ref = useRef<HTMLDivElement>(null);
  const getRef = useRef(getFigure);
  const optionsRef = useRef(options);
  const baseAnnotations = useRef<object[]>([]);
  const home = useRef<HomeView>({ key: "plot" });
  const generation = useRef(0);
  getRef.current = getFigure;
  optionsRef.current = options;

  const resize = useCallback(() => {
    const el = ref.current;
    if (el && window.Plotly) window.Plotly.Plots.resize(el);
  }, []);

  const applyView = (layout: FigureLayout): FigureLayout => ({
    ...layout,
    dragmode: plotDragMode(),
    ...(touchScrollFriendly() ? { hovermode: false } : {}),
    uirevision: `${home.current.key}@${generation.current}`,
  });

  const reset = () => {
    const el = ref.current;
    const view = home.current;
    if (!el || !window.Plotly) return;
    generation.current += 1;
    const update: Record<string, unknown> = {
      uirevision: `${view.key}@${generation.current}`,
      dragmode: plotDragMode(),
    };
    for (const key of ["xaxis", "yaxis", "yaxis2"] as const) {
      const axis = view[key];
      if (!axis) continue;
      if (axis.range) {
        update[`${key}.range`] = [...axis.range];
        update[`${key}.autorange`] = false;
      } else {
        update[`${key}.autorange`] = true;
      }
    }
    window.Plotly.relayout(el as PlotlyHTMLElement, update);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || !window.Plotly) return;
    const plot = el as PlotlyHTMLElement;
    const figure = getRef.current();
    home.current = capture(figure.layout);
    baseAnnotations.current = (figure.layout.annotations as object[] | undefined) ?? [];
    const layout = applyView(figure.layout);
    let alive = true;
    const scrollZoom = !touchScrollFriendly();
    window.Plotly
      .react(plot, figure.traces as never, layout as never, {
        displayModeBar: false,
        displaylogo: false,
        responsive: true,
        scrollZoom,
        doubleClick: false,
      })
      .then(() => {
        if (!alive || !ref.current) return;
        const node = ref.current;
        node.style.height = "";
        node.style.width = "";
        resize();
        requestAnimationFrame(() => {
          resize();
          requestAnimationFrame(resize);
        });
      });
    const onDoubleClick = () => reset();
    const onPlotClick = (event: { points?: Array<{ x?: unknown; curveNumber?: number }> }) => {
      const point = event.points?.[0];
      if (!point || point.curveNumber !== 0) return;
      if (typeof point.x === "number") optionsRef.current?.onPick?.(point.x);
    };
    const setXHoverLabel = (x: number | null) => {
      const label = optionsRef.current?.xHoverLabel;
      if (!label || !window.Plotly) return;
      if (x == null || !Number.isFinite(x)) {
        window.Plotly.relayout(plot, { annotations: [...baseAnnotations.current] });
        return;
      }
      window.Plotly.relayout(plot, {
        annotations: [
          ...baseAnnotations.current,
          {
            x,
            y: label.y,
            xref: "x",
            yref: "paper",
            text: label.format(x),
            showarrow: false,
            font: { size: 11, color: "#3f342c" },
            bgcolor: "#ffffff",
            bordercolor: "#e2e5ea",
            borderwidth: 1,
            borderpad: 3,
          },
        ],
      });
    };
    const onPlotHover = (event: { points?: Array<{ x?: unknown }> }) => {
      const x = event.points?.[0]?.x;
      if (typeof x === "number") setXHoverLabel(x);
    };
    const onPlotUnhover = () => setXHoverLabel(null);
    const clearPlotHover = () => {
      onPlotUnhover();
      if (window.Plotly?.Fx?.hover) {
        window.Plotly.Fx.hover(plot, []);
      }
    };
    const onOutsidePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (target && el.contains(target)) return;
      clearPlotHover();
    };
    plot.addEventListener("dblclick", onDoubleClick);
    plot.on?.("plotly_click", onPlotClick);
    const touchScroll = touchScrollFriendly();
    if (!touchScroll) {
      plot.on?.("plotly_hover", onPlotHover);
      plot.on?.("plotly_unhover", onPlotUnhover);
      document.addEventListener("mousedown", onOutsidePointer);
      document.addEventListener("touchstart", onOutsidePointer, { passive: true });
    }
    return () => {
      alive = false;
      plot.removeEventListener("dblclick", onDoubleClick);
      plot.removeListener?.("plotly_click", onPlotClick);
      if (!touchScroll) {
        plot.removeListener?.("plotly_hover", onPlotHover);
        plot.removeListener?.("plotly_unhover", onPlotUnhover);
        document.removeEventListener("mousedown", onOutsidePointer);
        document.removeEventListener("touchstart", onOutsidePointer);
      }
    };
    // reset reads the saved ranges from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (touchScrollFriendly()) {
      requestAnimationFrame(resize);
      const onViewport = () => requestAnimationFrame(resize);
      window.addEventListener("orientationchange", onViewport);
      window.visualViewport?.addEventListener("resize", onViewport);
      return () => {
        window.removeEventListener("orientationchange", onViewport);
        window.visualViewport?.removeEventListener("resize", onViewport);
      };
    }

    const target = el.parentElement ?? el;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(target);
    window.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [revision, resize]);

  return { ref, reset, resize };
}

export function PlotFrame({
  plotRef,
  onReset,
  resetTitle = "滚轮缩放，拖拽平移，点这里回到初始范围",
}: {
  plotRef: RefObject<HTMLDivElement>;
  onReset: () => void;
  resetTitle?: string;
}) {
  return (
    <div className="plot-wrap">
      <button type="button" className="plot-reset" onClick={onReset} title={resetTitle}>
        复位
      </button>
      <div ref={plotRef} className="plot" />
    </div>
  );
}
