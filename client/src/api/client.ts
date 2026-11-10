import { GexResponse, HistoryResponse, VenueFilter } from "../types";

export async function fetchGexData(venue: VenueFilter): Promise<GexResponse> {
  const resp = await fetch(`/api/gex/BTC?venue=${venue}`, { cache: "no-store" });
  if (!resp.ok) {
    const body = (await resp.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `API ${resp.status}`);
  }
  return resp.json();
}

export async function fetchGexHistory(): Promise<HistoryResponse> {
  const resp = await fetch(`/api/gex/BTC/history`, { cache: "no-store" });
  if (!resp.ok) throw new Error(`History API ${resp.status}`);
  return resp.json();
}
