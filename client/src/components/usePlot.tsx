import { useEffect, useRef, type RefObject } from "react";

type AxisLayout = { range?: number[]; [key: string]: unknown };
type FigureLayout = {
  uirevision?: string;
  dragmode?: string;
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

export function usePlot(
  getFigure: () => { traces: unknown[]; layout: FigureLayout },
  revision: string,
  onPick?: (x: number) => void,
) {
  const ref = useRef<HTMLDivElement>(null);
  const getRef = useRef(getFigure);
  const onPickRef = useRef(onPick);
  const home = useRef<HomeView>({ key: "plot" });
  const generation = useRef(0);
  getRef.current = getFigure;
  onPickRef.current = onPick;

  const applyView = (layout: FigureLayout): FigureLayout => ({
    ...layout,
    dragmode: "pan",
    uirevision: `${home.current.key}@${generation.current}`,
  });

  const reset = () => {
    const el = ref.current;
    const view = home.current;
    if (!el || !window.Plotly) return;
    generation.current += 1;
    const update: Record<string, unknown> = {
      uirevision: `${view.key}@${generation.current}`,
      dragmode: "pan",
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
    const layout = applyView(figure.layout);
    let alive = true;
    window.Plotly
      .react(plot, figure.traces as never, layout as never, {
        displayModeBar: false,
        displaylogo: false,
        responsive: true,
        scrollZoom: true,
        doubleClick: false,
      })
      .then(() => {
        if (alive && ref.current) window.Plotly.Plots.resize(ref.current);
      });
    const onDoubleClick = () => reset();
    const onPlotClick = (event: { points?: Array<{ x?: unknown; curveNumber?: number }> }) => {
      const point = event.points?.[0];
      if (!point || point.curveNumber !== 0) return;
      if (typeof point.x === "number") onPickRef.current?.(point.x);
    };
    plot.addEventListener("dblclick", onDoubleClick);
    plot.on?.("plotly_click", onPlotClick);
    return () => {
      alive = false;
      plot.removeEventListener("dblclick", onDoubleClick);
      plot.removeListener?.("plotly_click", onPlotClick);
    };
    // reset reads the saved ranges from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  useEffect(() => {
    const onResize = () => {
      if (ref.current && window.Plotly) window.Plotly.Plots.resize(ref.current);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return { ref, reset };
}

export function PlotFrame({
  plotRef,
  onReset,
}: {
  plotRef: RefObject<HTMLDivElement>;
  onReset: () => void;
}) {
  return (
    <div className="plot-wrap">
      <button type="button" className="plot-reset" onClick={onReset} title="滚轮缩放，拖拽平移，点这里回到初始范围">
        复位
      </button>
      <div ref={plotRef} className="plot" />
    </div>
  );
}
