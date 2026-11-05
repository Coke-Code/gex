export type ExchangeSource = "deribit" | "binance" | "okx";
export type VenueFilter = "all" | ExchangeSource;

export interface StrikeExpiry {
  expiry: string;
  days: number;
  netGex: number;
}

export interface StrikeGex {
  strike: number;
  callGex: number;
  putGex: number;
  netGex: number;
  absGex: number;
  oi: number;
  volume: number | null;
  volumePartial: boolean;
  byExpiry: StrikeExpiry[];
  netThen: number | null;
}

export interface ExpirySlice {
  expiry: string;
  expiryTimestamp: number;
  days: number;
  netGex: number;
  absGex: number;
  atmIv: number | null;
}

export interface PriceLevel {
  strike: number;
  netGex: number;
}

export interface VenueStatus {
  venue: ExchangeSource;
  online: boolean;
  error: string | null;
  included: boolean;
  contractsUsed: number;
  netGex: number;
  absGex: number;
  flipPoint: number | null;
}

export interface GammaCurvePoint {
  spot: number;
  totalNetGex: number;
}

export type MarkerKind = "P" | "N" | "A" | "F" | "S" | "V" | "GC";

export interface ChartMarker {
  id: string;
  kind: MarkerKind;
  price: number;
  confluence: boolean;
}

export interface DataQuality {
  contractsSeen: number;
  contractsUsed: number;
  contractsDropped: number;
}

export interface GexAnalysis {
  underlying: string;
  underlyingPrice: number;
  timestamp: number;
  strikes: StrikeGex[];
  totalNetGex: number;
  totalAbsGex: number;
  flipPoint: number | null;
  markers: ChartMarker[];
  hedgingPressure: "positive" | "negative" | "neutral";
  gammaCurve: GammaCurvePoint[];
  levels: {
    support: PriceLevel | null;
    resistance: PriceLevel | null;
  };
  expiries: ExpirySlice[];
  move: {
    expiry: string;
    days: number;
    iv: number;
    oneDay: number;
  } | null;
  change: {
    timestamp: number;
    ageHours: number;
    flipPoint: number | null;
    price: number;
  } | null;
  speed: {
    hedgeUsdPer1Pct: number;
    gexChangePer1Pct: number | null;
  };
  skew: {
    expiry: string;
    days: number;
    putIv: number;
    callIv: number;
    rr: number;
  } | null;
  venue: VenueFilter;
  venues: VenueStatus[];
  quality: DataQuality;
}

export interface GexResponse {
  success: boolean;
  data?: GexAnalysis;
  exchanges: ExchangeSource[];
  errors?: { exchange: string; message: string }[];
  error?: string;
}

export const VENUE_LABEL: Record<VenueFilter, string> = {
  all: "聚合",
  deribit: "Deribit",
  binance: "Binance",
  okx: "OKX",
};
