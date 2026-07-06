/// <reference types="vite/client" />

interface PlotlyHTMLElement extends HTMLElement {
  on?: (event: string, handler: (...args: any[]) => void) => void;
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
    newPlot: (
      div: PlotlyHTMLElement | null,
      data: any[],
      layout?: any,
      config?: any,
    ) => Promise<any>;
  };
}
