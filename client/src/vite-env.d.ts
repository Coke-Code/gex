/// <reference types="vite/client" />

interface PlotlyHTMLElement extends HTMLElement {
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
}

interface Window {
  Plotly: {
    react: (
      div: PlotlyHTMLElement | null,
      data: any[],
      layout?: any,
      config?: any,
    ) => Promise<any>;
    Plots: {
      resize: (div: PlotlyHTMLElement) => void;
    };
    Fx?: {
      hover: (div: PlotlyHTMLElement, pts?: unknown[]) => void;
    };
    relayout: (div: PlotlyHTMLElement | null, update: Record<string, unknown>) => Promise<unknown>;
    newPlot: (
      div: PlotlyHTMLElement | null,
      data: any[],
      layout?: any,
      config?: any,
    ) => Promise<any>;
  };
}
