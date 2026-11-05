// 三所 BTC 期权。单所失败不影响其余所，短缓存避免看板连打。

import { analyzeChain, chainFlip } from "./analysis";
import { BinanceAdapter } from "./exchanges/binance";
import { DeribitAdapter } from "./exchanges/deribit";
import { OkxAdapter } from "./exchanges/okx";
import {
  ExchangeAdapter,
  ExchangeSource,
  GexAnalysis,
  NormalizedOption,
  VenueFilter,
} from "./types";

const BOOK_MS = 20_000;
const VENUES: ExchangeSource[] = ["deribit", "binance", "okx"];

interface VenueBook {
  venue: ExchangeSource;
  options: NormalizedOption[];
  indexPrice: number | null;
  error: string | null;
  fetchedAt: number;
}

const adapters: Record<ExchangeSource, ExchangeAdapter> = {
  deribit: new DeribitAdapter(),
  binance: new BinanceAdapter(),
  okx: new OkxAdapter(),
};

const cache = new Map<ExchangeSource, VenueBook>();

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function parseVenue(value: unknown): VenueFilter {
  const venue = String(value ?? "all").toLowerCase();
  if (venue === "deribit" || venue === "binance" || venue === "okx") return venue;
  return "all";
}

async function loadVenue(venue: ExchangeSource): Promise<VenueBook> {
  const hit = cache.get(venue);
  if (hit && Date.now() - hit.fetchedAt < BOOK_MS) return hit;

  const adapter = adapters[venue];
  try {
    const [indexPrice, options] = await Promise.all([
      adapter.fetchUnderlyingPrice("BTC"),
      adapter.fetchOptions("BTC"),
    ]);
    const book: VenueBook = {
      venue,
      options,
      indexPrice: indexPrice > 0 ? indexPrice : null,
      error: null,
      fetchedAt: Date.now(),
    };
    cache.set(venue, book);
    return book;
  } catch (err) {
    const book: VenueBook = {
      venue,
      options: [],
      indexPrice: null,
      error: errorMessage(err),
      fetchedAt: Date.now(),
    };
    cache.set(venue, book);
    return book;
  }
}

export async function loadBtc(venue: VenueFilter): Promise<GexAnalysis> {
  const books = await Promise.all(VENUES.map((name) => loadVenue(name)));
  const selected = books.filter(
    (book) => venue === "all" || book.venue === venue,
  );
  const indexPrice =
    selected.find((book) => book.indexPrice)?.indexPrice ??
    books.find((book) => book.indexPrice)?.indexPrice ??
    0;
  const options = selected.flatMap((book) => book.options);
  const analysis = analyzeChain({
    underlying: "BTC",
    indexPrice,
    options,
    venue,
    venueNotes: books.map((book) => ({
      venue: book.venue,
      error: book.error,
      included: venue === "all" || book.venue === venue,
    })),
  });
  for (const status of analysis.venues) {
    const book = books.find((item) => item.venue === status.venue);
    if (!status.online || !book || book.options.length === 0 || !(indexPrice > 0)) {
      status.flipPoint = null;
      continue;
    }
    const soleBook = venue === status.venue || (venue === "all" && selected.length === 1);
    status.flipPoint = soleBook ? analysis.flipPoint : chainFlip(book.options, indexPrice);
  }

  const online = books.filter((book) => book.error == null).map((book) => book.venue);
  console.log(
    `BTC ${venue} net=${analysis.totalNetGex.toExponential(3)} flip=${analysis.flipPoint?.toFixed(0) ?? "none"} online=${online.join(",") || "none"}`,
  );
  return analysis;
}
