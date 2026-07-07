// API 客户端

import { GexResponse, ExchangeHealth, ForwardGammaResult } from "../types";

const API_BASE = "/api";

export async function fetchGexData(underlying: string): Promise<GexResponse> {
  const resp = await fetch(`${API_BASE}/gex/${underlying}`);
  if (!resp.ok) {
    throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export async function fetchHealth(): Promise<ExchangeHealth[]> {
  const resp = await fetch(`${API_BASE}/health`);
  const json = await resp.json();
  return json.exchanges;
}

export async function fetchGammaSurface(
  underlying: string,
): Promise<{ success: boolean; data: ForwardGammaResult; error?: string }> {
  const resp = await fetch(`${API_BASE}/gex/${underlying}/surface`);
  return resp.json();
}
