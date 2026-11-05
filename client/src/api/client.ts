import { GexResponse, VenueFilter } from "../types";

export async function fetchGexData(venue: VenueFilter): Promise<GexResponse> {
  const resp = await fetch(`/api/gex/BTC?venue=${venue}`, { cache: "no-store" });
  if (!resp.ok) {
    const body = (await resp.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `API ${resp.status}`);
  }
  return resp.json();
}
