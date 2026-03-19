/**
 * Shared itinerary block types and normalization for rich Google Places fields (Mapbox-ready).
 */

export type ItineraryRichLocation = {
  name: string;
  lat: number;
  lng: number;
  placeId: string;
};

export type BookingOption = {
  providerName: string;
  url: string;
  why: string;
};

export type ItineraryBlock = {
  id: string;
  /** YYYY-MM-DD (start/check-in for accommodation) */
  date: string;
  /** YYYY-MM-DD optional end/check-out for accommodation */
  endDate?: string;
  type: "accommodation" | "activity" | "logistics";
  title: string;
  /** Teaser for card front (accommodation: 2 sentences; others: 3–5 word TLDR). Fallback to description for legacy. */
  summary?: string;
  description: string;
  /**
   * Accommodation & activity: primary place/area from Google Places (name + coordinates).
   * Omit for logistics (use startLocation / endLocation).
   */
  location?: ItineraryRichLocation;
  /** Logistics: route endpoints */
  startLocation?: ItineraryRichLocation;
  endLocation?: ItineraryRichLocation;
  bookingOptions?: BookingOption[];
  isBooked?: boolean;
  bookedName?: string;
  confirmationNumber?: string;
  cost?: string;
  actualBookingUrl?: string;
  isIncluded?: boolean;
  price?: number;
  /** Google Place ID when user selects a hotel (Accommodation — Hotelbeds flow) */
  googlePlaceId?: string;
  lat?: number;
  lng?: number;
  priceNote?: string;
  rateKey?: string;
  rateType?: string;
  cancellationPolicy?: string | Record<string, unknown>;
  cancellationPolicies?: Array<{ from?: string; amount?: number; [key: string]: unknown }>;
  bookingStatus?: string;
  confirmationCode?: string;
  supplierName?: string;
  supplierVat?: string;
  recommendations?: string;
};

export function emptyRichLocation(): ItineraryRichLocation {
  return { name: "", lat: 0, lng: 0, placeId: "" };
}

export function stringToRichLocation(name: string): ItineraryRichLocation {
  const n = String(name ?? "").trim();
  return { name: n, lat: 0, lng: 0, placeId: "" };
}

export function parseRichLocationJson(v: unknown): ItineraryRichLocation | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const name = String(o.name ?? "").trim();
  const lat = typeof o.lat === "number" && Number.isFinite(o.lat) ? o.lat : 0;
  const lng = typeof o.lng === "number" && Number.isFinite(o.lng) ? o.lng : 0;
  const placeId = String(o.placeId ?? "").trim();
  if (!name && !placeId && lat === 0 && lng === 0) return null;
  return { name, lat, lng, placeId };
}

/** Human-readable location line for cards and booking search context. */
export function blockLocationLabel(block: {
  type: ItineraryBlock["type"];
  location?: ItineraryRichLocation;
  startLocation?: ItineraryRichLocation;
  endLocation?: ItineraryRichLocation;
}): string {
  if (block.type === "logistics") {
    const a = block.startLocation?.name?.trim() ?? "";
    const b = block.endLocation?.name?.trim() ?? "";
    if (a && b) return `${a} → ${b}`;
    return a || b;
  }
  return block.location?.name?.trim() ?? "";
}

type RawBookingOption = { providerName?: unknown; url?: unknown; why?: unknown };

/** Coerce API / Supabase JSON into ItineraryBlock (migrates legacy string `location`). */
export function coerceItineraryBlockFromUnknown(
  b: Record<string, unknown>,
  genId: () => string
): ItineraryBlock {
  const bookingOptionsRaw = b.bookingOptions;
  const options = Array.isArray(bookingOptionsRaw)
    ? bookingOptionsRaw.filter((o): o is BookingOption => {
        const x = o as RawBookingOption;
        return (
          typeof x?.providerName === "string" &&
          typeof x?.url === "string" &&
          typeof x?.why === "string"
        );
      })
    : undefined;

  const endDateRaw =
    String(b.endDate ?? b.checkOutDate ?? "").trim() || undefined;
  const googlePlaceIdRaw = b.googlePlaceId;
  const duffelHotelIdRaw = b.duffelHotelId;
  const googlePlaceId =
    typeof googlePlaceIdRaw === "string" && googlePlaceIdRaw.trim()
      ? googlePlaceIdRaw.trim()
      : typeof duffelHotelIdRaw === "string" && duffelHotelIdRaw.trim()
        ? duffelHotelIdRaw.trim()
        : undefined;
  const summaryRaw = String(b.summary ?? "").trim() || undefined;
  const recommendationsRaw = String(b.recommendations ?? "").trim() || undefined;

  const type: ItineraryBlock["type"] =
    b.type === "accommodation" || b.type === "logistics" ? b.type : "activity";

  const legacyLocationString =
    typeof b.location === "string" ? b.location.trim() : "";

  const base: ItineraryBlock = {
    id: typeof b.id === "string" && b.id.trim() ? b.id.trim() : genId(),
    date: typeof b.date === "string" ? b.date : "",
    ...(endDateRaw ? { endDate: endDateRaw } : {}),
    type,
    title: typeof b.title === "string" ? b.title : "",
    ...(summaryRaw ? { summary: summaryRaw } : {}),
    description: typeof b.description === "string" ? b.description : "",
    ...(recommendationsRaw ? { recommendations: recommendationsRaw } : {}),
    ...(options?.length ? { bookingOptions: options } : {}),
    isBooked: Boolean(b.isBooked),
    bookedName: String(b.bookedName ?? "").trim() || undefined,
    confirmationNumber: String(b.confirmationNumber ?? "").trim() || undefined,
    cost: String(b.cost ?? "").trim() || undefined,
    actualBookingUrl: String(b.actualBookingUrl ?? "").trim() || undefined,
    isIncluded: b.isIncluded !== false,
    ...(typeof b.price === "number" && Number.isFinite(b.price) ? { price: b.price } : {}),
    ...(googlePlaceId ? { googlePlaceId } : {}),
    ...(typeof b.lat === "number" && Number.isFinite(b.lat) ? { lat: b.lat } : {}),
    ...(typeof b.lng === "number" && Number.isFinite(b.lng) ? { lng: b.lng } : {}),
    ...(typeof b.priceNote === "string" && b.priceNote.trim() ? { priceNote: b.priceNote.trim() } : {}),
    ...(typeof b.rateKey === "string" && b.rateKey.trim() ? { rateKey: b.rateKey.trim() } : {}),
    ...(typeof b.rateType === "string" && b.rateType.trim() ? { rateType: b.rateType.trim() } : {}),
    ...(b.cancellationPolicy != null ? { cancellationPolicy: b.cancellationPolicy as ItineraryBlock["cancellationPolicy"] } : {}),
    ...(Array.isArray(b.cancellationPolicies) && b.cancellationPolicies.length > 0
      ? { cancellationPolicies: b.cancellationPolicies as ItineraryBlock["cancellationPolicies"] }
      : {}),
    ...(typeof b.bookingStatus === "string" && b.bookingStatus.trim()
      ? { bookingStatus: b.bookingStatus.trim() }
      : {}),
    ...(typeof b.confirmationCode === "string" && b.confirmationCode.trim()
      ? { confirmationCode: b.confirmationCode.trim() }
      : {}),
    ...(typeof b.supplierName === "string" && b.supplierName.trim()
      ? { supplierName: b.supplierName.trim() }
      : {}),
    ...(typeof b.supplierVat === "string" && b.supplierVat.trim()
      ? { supplierVat: b.supplierVat.trim() }
      : {}),
  };

  if (type === "logistics") {
    const start =
      parseRichLocationJson(b.startLocation) ??
      parseRichLocationJson(b.location) ??
      (legacyLocationString ? stringToRichLocation(legacyLocationString) : emptyRichLocation());
    const end = parseRichLocationJson(b.endLocation) ?? emptyRichLocation();
    return { ...base, startLocation: start, endLocation: end };
  }

  const location =
    parseRichLocationJson(b.location) ??
    (legacyLocationString ? stringToRichLocation(legacyLocationString) : emptyRichLocation());

  return { ...base, location };
}
