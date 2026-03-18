"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  MapPin,
  Calendar,
  Users,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Trash2,
  GripVertical,
  Loader2,
  X,
  Plane,
  ExternalLink,
  Bell,
  CheckCircle,
  MessageSquare,
  Menu,
  Crown,
  Layers,
  CalendarDays,
} from "lucide-react";
import { ItineraryItemCard } from "./components/ItineraryItemCard";
import { v4 as uuidv4 } from "uuid";

type FormData = {
  destination: string;
  startDate: string;
  endDate: string;
  /** Number of travelers; may be empty string while user is typing */
  people: number | string;
  vibe: string;
};

type BookingOption = {
  providerName: string;
  url: string;
  why: string;
};

type ItineraryBlock = {
  id: string;
  /** YYYY-MM-DD (start/check-in for accommodation) */
  date: string;
  /** YYYY-MM-DD optional end/check-out for accommodation or multi-day items */
  endDate?: string;
  /** City or area */
  location: string;
  type: "accommodation" | "activity" | "logistics";
  title: string;
  /** Teaser for card front (accommodation: 2 sentences; others: 3–5 word TLDR) */
  summary?: string;
  description: string;
  /** For Accommodation blocks: exactly 3 options as "Hotel Name - Vibe" per line */
  recommendations?: string;
  bookingOptions?: BookingOption[];
  /** Reservation capture (manual overwrite) */
  isBooked?: boolean;
  bookedName?: string;
  confirmationNumber?: string;
  cost?: string;
  actualBookingUrl?: string;
  /** Include in itinerary (curation); default false; only included blocks are saved */
  isIncluded?: boolean;
  /** Estimated price in dollars (saved to Supabase JSON) */
  price?: number;
  /** Google Place ID when user selects a hotel (for Accommodation blocks) */
  googlePlaceId?: string;
  /** Hotelbeds temporary rate identifier (Availability → CheckRate → Book flow) */
  rateKey?: string;
  /** Hotelbeds rate type: 'BOOKABLE' (direct book) or 'RECHECK' (must call CheckRate first) */
  rateType?: string;
  /** Cancellation policy from the rate (string or structured object) */
  cancellationPolicy?: string | Record<string, unknown>;
  /** APItude flow state: 'searched' | 'quoted' | 'booked' */
  bookingStatus?: string;
  /** Final booking reference from Hotelbeds after booking */
  confirmationCode?: string;
  /** Supplier name from booking (for voucher legal text) */
  supplierName?: string;
  /** Supplier VAT from booking (for voucher legal text) */
  supplierVat?: string;
};

/** Timeline entry: either a real block or a synthetic "check-out" marker for multi-day items. */
export type TimelineEntry =
  | ItineraryBlock
  | { kind: "checkout"; sourceBlock: ItineraryBlock };

/** Trip row from Supabase (trips table); blocks stored as JSON array in blocks field. */
type Trip = {
  id?: string;
  name: string;
  blocks: ItineraryBlock[];
  start_date: string;
  end_date: string;
  user_id?: string;
  status?: string;
};

/**
 * Normalize blocks for Supabase persistence. Uses optional googlePlaceId only (no duffelHotelId)
 * so non-hotel blocks (activity/logistics) never trigger validation on a required hotel id.
 */
function blocksForPersistence(blocks: ItineraryBlock[]): Record<string, unknown>[] {
  const sanitizedBlocks = blocks.map((block) => {
    const raw = block as { googlePlaceId?: string; duffelHotelId?: string };
    const googlePlaceId =
      typeof raw.googlePlaceId === "string" && raw.googlePlaceId.trim()
        ? raw.googlePlaceId.trim()
        : typeof raw.duffelHotelId === "string" && raw.duffelHotelId.trim()
          ? raw.duffelHotelId.trim()
          : undefined;
    return {
      id: block.id,
      date: block.date,
      ...(block.endDate ? { endDate: block.endDate } : {}),
      location: block.location,
      type: block.type,
      title: block.title,
      ...(block.summary !== undefined && block.summary !== "" ? { summary: block.summary } : {}),
      description: block.description,
      ...(block.recommendations !== undefined && block.recommendations !== "" ? { recommendations: block.recommendations } : {}),
      ...(Array.isArray(block.bookingOptions) && block.bookingOptions.length > 0
        ? { bookingOptions: block.bookingOptions }
        : {}),
      ...(block.isBooked !== undefined ? { isBooked: block.isBooked } : {}),
      ...(block.bookedName ? { bookedName: block.bookedName } : {}),
      ...(block.confirmationNumber ? { confirmationNumber: block.confirmationNumber } : {}),
      ...(block.cost ? { cost: block.cost } : {}),
      ...(block.actualBookingUrl ? { actualBookingUrl: block.actualBookingUrl } : {}),
      isIncluded: block.isIncluded,
      ...(typeof block.price === "number" && Number.isFinite(block.price) ? { price: block.price } : {}),
      ...(googlePlaceId ? { googlePlaceId } : {}),
      ...(typeof (block as { lat?: number }).lat === "number" && Number.isFinite((block as { lat?: number }).lat) ? { lat: (block as { lat?: number }).lat } : {}),
      ...(typeof (block as { lng?: number }).lng === "number" && Number.isFinite((block as { lng?: number }).lng) ? { lng: (block as { lng?: number }).lng } : {}),
      ...((block as any).priceNote ? { priceNote: (block as any).priceNote } : {}),
      ...((block as any).rateKey ? { rateKey: (block as any).rateKey } : {}),
      ...((block as any).rateType ? { rateType: (block as any).rateType } : {}),
      ...((block as any).cancellationPolicy != null ? { cancellationPolicy: (block as any).cancellationPolicy } : {}),
      ...(Array.isArray((block as any).cancellationPolicies) && (block as any).cancellationPolicies.length > 0 ? { cancellationPolicies: (block as any).cancellationPolicies } : {}),
      ...((block as any).bookingStatus ? { bookingStatus: (block as any).bookingStatus } : {}),
      ...((block as any).confirmationCode ? { confirmationCode: (block as any).confirmationCode } : {}),
      ...((block as any).supplierName ? { supplierName: (block as any).supplierName } : {}),
      ...((block as any).supplierVat ? { supplierVat: (block as any).supplierVat } : {}),
    };
  });
  return JSON.parse(JSON.stringify(sanitizedBlocks));
}

const initialFormData: FormData = {
  destination: "",
  startDate: "",
  endDate: "",
  people: 2,
  vibe: "",
};

const TOTAL_STEPS = 3;

function isStep1Valid(data: FormData) {
  return data.destination.trim().length > 0;
}

function isStep2Valid(data: FormData) {
  if (!data.startDate.trim()) return false;
  if (!data.endDate.trim()) return false;
  if (data.endDate < data.startDate) return false;
  const n = Number(data.people);
  if (!Number.isFinite(n) || n < 1) return false;
  return true;
}

function isStep3Valid(data: FormData) {
  return data.vibe.trim().length > 0;
}

/** Open-Meteo Geocoding API result item */
type GeocodingResult = {
  id: number;
  name: string;
  country: string;
  admin1?: string;
  admin2?: string;
};

type GeocodingResponse = {
  results?: GeocodingResult[];
};

const GEOCODE_DEBOUNCE_MS = 300;
const GEOCODE_MIN_QUERY_LEN = 2;

/** Supabase client for trips persistence (null if env not set). */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

function formatCityLabel(r: GeocodingResult): string {
  const parts = [r.name];
  if (r.admin1 && r.admin1 !== r.name) parts.push(r.admin1);
  parts.push(r.country);
  return parts.join(", ");
}

/** Sort blocks by date and group by date for timeline view. Returns array of { date, dayLabel, dayIndex, blocks }. */
function groupBlocksByDate(blocks: ItineraryBlock[]): {
  date: string;
  dayLabel: string;
  dayIndex: number;
  blocks: ItineraryBlock[];
}[] {
  const sorted = [...blocks].sort((a, b) => {
    const dA = a.date || "";
    const dB = b.date || "";
    return dA.localeCompare(dB);
  });
  const byDate = new Map<string, ItineraryBlock[]>();
  for (const block of sorted) {
    const d = block.date || "";
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(block);
  }
  const dates = Array.from(byDate.keys()).filter(Boolean).sort();
  return dates.map((date, i) => {
    let dayLabel = date;
    try {
      const parsed = new Date(date + "T12:00:00");
      if (!Number.isNaN(parsed.getTime())) {
        dayLabel = parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      }
    } catch {
      // keep YYYY-MM-DD
    }
    return {
      date,
      dayLabel,
      dayIndex: i + 1,
      blocks: byDate.get(date) ?? [],
    };
  });
}

/** Multi-day blocks (have endDate and it differs from start date). */
function getMultiDayBlocks(blocks: ItineraryBlock[]): ItineraryBlock[] {
  return blocks.filter((b) => b.endDate && b.endDate !== (b.date || ""));
}

/** Group blocks for timeline view: injects synthetic "checkout" entries at the very top of end_date days so accommodations span visually. */
function groupBlocksByDateForTimeline(blocks: ItineraryBlock[]): {
  date: string;
  dayLabel: string;
  dayIndex: number;
  blocks: TimelineEntry[];
}[] {
  const dateSet = new Set<string>();
  for (const block of blocks) {
    const d = block.date || "";
    if (d) dateSet.add(d);
    if (block.endDate && block.endDate !== d) dateSet.add(block.endDate);
  }
  const dates = Array.from(dateSet).filter(Boolean).sort();
  return dates.map((date, i) => {
    let dayLabel = date;
    try {
      const parsed = new Date(date + "T12:00:00");
      if (!Number.isNaN(parsed.getTime())) {
        dayLabel = parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      }
    } catch {
      // keep YYYY-MM-DD
    }
    const checkouts: TimelineEntry[] = blocks
      .filter((b) => b.endDate && b.endDate !== (b.date || "") && b.endDate === date)
      .map((b) => ({ kind: "checkout" as const, sourceBlock: b }));
    const dayBlocks = blocks
      .filter((b) => (b.date || "") === date)
      .sort((a, b) => a.date.localeCompare(b.date));
    const entries: TimelineEntry[] = [...checkouts, ...dayBlocks];
    return {
      date,
      dayLabel,
      dayIndex: i + 1,
      blocks: entries,
    };
  });
}

function parseTripResponse(data: unknown): ItineraryBlock[] {
  if (Array.isArray(data)) {
    return data.map((b) => {
      const block = b as ItineraryBlock & { bookingOptions?: BookingOption[] };
      const options = Array.isArray(block.bookingOptions)
        ? block.bookingOptions.filter(
            (o) =>
              typeof o?.providerName === "string" &&
              typeof o?.url === "string" &&
              typeof o?.why === "string"
          )
        : undefined;
      const endDateRaw = String((block as { endDate?: string }).endDate ?? (block as { checkOutDate?: string }).checkOutDate ?? "").trim() || undefined;
      const raw = block as { googlePlaceId?: string; duffelHotelId?: string };
      const googlePlaceId = typeof raw.googlePlaceId === "string" && raw.googlePlaceId.trim() ? raw.googlePlaceId.trim() : (typeof raw.duffelHotelId === "string" && raw.duffelHotelId.trim() ? raw.duffelHotelId.trim() : undefined);
      const summaryRaw = String((block as { summary?: string }).summary ?? "").trim() || undefined;
      const recommendationsRaw = String((block as { recommendations?: string }).recommendations ?? "").trim() || undefined;
      return {
        id: String(block.id ?? uuidv4()),
        date: String(block.date ?? ""),
        ...(endDateRaw ? { endDate: endDateRaw } : {}),
        location: String(block.location ?? ""),
        type:
          block.type === "accommodation" || block.type === "logistics"
            ? block.type
            : "activity",
        title: String(block.title ?? ""),
        ...(summaryRaw ? { summary: summaryRaw } : {}),
        description: String(block.description ?? ""),
        ...(recommendationsRaw ? { recommendations: recommendationsRaw } : {}),
        ...(options?.length ? { bookingOptions: options } : {}),
        isBooked: Boolean((block as { isBooked?: boolean }).isBooked),
        bookedName: String((block as { bookedName?: string }).bookedName ?? "").trim() || undefined,
        confirmationNumber: String((block as { confirmationNumber?: string }).confirmationNumber ?? "").trim() || undefined,
        cost: String((block as { cost?: string }).cost ?? "").trim() || undefined,
        actualBookingUrl: String((block as { actualBookingUrl?: string }).actualBookingUrl ?? "").trim() || undefined,
        isIncluded: (block as { isIncluded?: boolean }).isIncluded !== false,
        ...(typeof (block as { price?: number }).price === "number" && Number.isFinite((block as { price?: number }).price)
          ? { price: (block as { price?: number }).price }
          : {}),
        ...(googlePlaceId ? { googlePlaceId } : {}),
        ...(typeof (block as { lat?: number }).lat === "number" && Number.isFinite((block as { lat?: number }).lat) ? { lat: (block as { lat?: number }).lat } : {}),
        ...(typeof (block as { lng?: number }).lng === "number" && Number.isFinite((block as { lng?: number }).lng) ? { lng: (block as { lng?: number }).lng } : {}),
        ...((block as { priceNote?: string }).priceNote ? { priceNote: (block as { priceNote?: string }).priceNote } : {}),
        ...((block as { rateKey?: string }).rateKey ? { rateKey: (block as { rateKey?: string }).rateKey } : {}),
        ...((block as { rateType?: string }).rateType ? { rateType: (block as { rateType?: string }).rateType } : {}),
        ...((block as { cancellationPolicy?: string | Record<string, unknown> }).cancellationPolicy != null ? { cancellationPolicy: (block as { cancellationPolicy?: string | Record<string, unknown> }).cancellationPolicy } : {}),
        ...(Array.isArray((block as { cancellationPolicies?: unknown[] }).cancellationPolicies) && (block as { cancellationPolicies: unknown[] }).cancellationPolicies.length > 0 ? { cancellationPolicies: (block as { cancellationPolicies: unknown[] }).cancellationPolicies } : {}),
        ...((block as { bookingStatus?: string }).bookingStatus ? { bookingStatus: (block as { bookingStatus?: string }).bookingStatus } : {}),
        ...((block as { confirmationCode?: string }).confirmationCode ? { confirmationCode: (block as { confirmationCode?: string }).confirmationCode } : {}),
        ...((block as { supplierName?: string }).supplierName ? { supplierName: (block as { supplierName?: string }).supplierName } : {}),
        ...((block as { supplierVat?: string }).supplierVat ? { supplierVat: (block as { supplierVat?: string }).supplierVat } : {}),
      };
    });
  }
  if (
    data &&
    typeof data === "object" &&
    "itineraryBlocks" in data &&
    Array.isArray((data as { itineraryBlocks: unknown }).itineraryBlocks)
  ) {
    return parseTripResponse((data as { itineraryBlocks: unknown[] }).itineraryBlocks);
  }
  return [];
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);

  /** wizard = multi-step form; builder = drag-drop itinerary; dashboard = saved trips list */
  const [viewMode, setViewMode] = useState<"wizard" | "builder" | "dashboard">(
    "wizard"
  );
  /** Within trip/itinerary page: builder (edit), timeline (read-only), or map placeholder */
  const [activeView, setActiveView] = useState<"builder" | "timeline" | "map">("builder");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [itineraryBlocks, setItineraryBlocks] = useState<ItineraryBlock[]>([]);
  /** Block id currently fetching booking options (for per-block loading spinner). */
  const [bookingOptionsLoadingBlockId, setBookingOptionsLoadingBlockId] =
    useState<string | null>(null);
  const [tripName, setTripName] = useState("");
  /** When set, next save updates this row; when null, insert creates a new trip. */
  const [currentTripId, setCurrentTripId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  /** Brief success state for Save button label. */
  const [saveJustSucceeded, setSaveJustSucceeded] = useState(false);
  /** Trip concierge status from Supabase (defaults to 'draft'). */
  const [tripStatus, setTripStatus] = useState<"draft" | "quote_requested" | "booked">("draft");
  const [showRequestBookingModal, setShowRequestBookingModal] = useState(false);

  // Auth
  const [user, setUser] = useState<any>(null);
  /** Twizz Founders VIP theme: true = purple background, false/null = default. */
  const [isFounderVip, setIsFounderVip] = useState<boolean | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  // Step 1 — destination autocomplete (Open-Meteo Geocoding)
  const [suggestions, setSuggestions] = useState<GeocodingResult[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

  /** Timeline: refs and measured positions for multi-day connector lines (check-in → check-out). */
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const timelineLineStartRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const timelineLineEndRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [timelineLinePositions, setTimelineLinePositions] = useState<
    Record<string, { top: number; height: number }>
  >({});

  const activeBlocks = itineraryBlocks.filter((b) => b.isIncluded !== false);
  const tripTotal = Math.round(
    activeBlocks.reduce((sum, block) => sum + (Number(block.price) || 0), 0)
  );
  const totalBudget = activeBlocks.reduce((sum, block) => {
    const cost = parseFloat(String(block.price ?? block.cost ?? 0));
    return sum + (isNaN(cost) ? 0 : cost);
  }, 0);

  const fetchSuggestions = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < GEOCODE_MIN_QUERY_LEN) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    setSuggestionsLoading(true);
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5`;
      const res = await fetch(url);
      if (!res.ok) {
        setSuggestions([]);
        return;
      }
      const data: GeocodingResponse = await res.json();
      setSuggestions(data.results ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = formData.destination;
    if (query.trim().length < GEOCODE_MIN_QUERY_LEN) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(query);
    }, GEOCODE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [formData.destination, fetchSuggestions]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = dropdownContainerRef.current;
      if (el && !el.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [dropdownOpen]);

  // Auth session: check on load and subscribe to changes
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch founder VIP status from profiles when user changes (graceful if no profile)
  useEffect(() => {
    if (!user || !supabase) {
      setIsFounderVip(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("is_founder_vip")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setIsFounderVip(false);
          return;
        }
        setIsFounderVip(data?.is_founder_vip === true);
      } catch {
        if (!cancelled) setIsFounderVip(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  // Measure timeline connector lines when timeline view is active and multi-day blocks exist.
  useEffect(() => {
    if (activeView !== "timeline") {
      setTimelineLinePositions({});
      timelineLineStartRefs.current = {};
      timelineLineEndRefs.current = {};
      return;
    }
    const multiDay = getMultiDayBlocks(itineraryBlocks);
    if (multiDay.length === 0) {
      setTimelineLinePositions({});
      return;
    }
    const container = timelineContainerRef.current;
    if (!container) return;
    const raf = requestAnimationFrame(() => {
      const containerRect = container.getBoundingClientRect();
      const next: Record<string, { top: number; height: number }> = {};
      for (const block of multiDay) {
        const startEl = timelineLineStartRefs.current[block.id];
        const endEl = timelineLineEndRefs.current[block.id];
        if (!startEl || !endEl) continue;
        const startRect = startEl.getBoundingClientRect();
        const endRect = endEl.getBoundingClientRect();
        const startCenter = startRect.top + startRect.height / 2;
        const endCenter = endRect.top + endRect.height / 2;
        const top = startCenter - containerRect.top + container.scrollTop;
        const height = endCenter - startCenter;
        if (height > 0) next[block.id] = { top, height };
      }
      setTimelineLinePositions((prev) =>
        Object.keys(next).length === 0 && Object.keys(prev).length === 0 ? prev : next
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [activeView, itineraryBlocks]);

  const selectDestination = useCallback((r: GeocodingResult) => {
    const label = formatCityLabel(r);
    setFormData((prev) => ({ ...prev, destination: label }));
    setSuggestions([]);
    setDropdownOpen(false);
  }, []);

  const step1Valid = isStep1Valid(formData);
  const step2Valid = isStep2Valid(formData);
  const step3Valid = isStep3Valid(formData);

  const canGoNext =
    (step === 1 && step1Valid) || (step === 2 && step2Valid);

  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const goNext = () => {
    if (step === 1 && !step1Valid) return;
    if (step === 2 && !step2Valid) return;
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const handleBuildItinerary = async () => {
    if (!step3Valid) return;
    const peopleNum = Number(formData.people);
    if (!Number.isFinite(peopleNum) || peopleNum < 1) {
      setGenerateError("Please enter a valid number of travelers (at least 1).");
      return;
    }
    setGenerateError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, people: peopleNum }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(
          typeof data?.error === "string" ? data.error : "Failed to generate trip"
        );
        return;
      }
      const rawBlocks = Array.isArray(data)
        ? data
        : (data as { itineraryBlocks?: unknown[] }).itineraryBlocks;
      const blocks = parseTripResponse(rawBlocks);
      setItineraryBlocks(blocks);
      setCurrentTripId(null);
      setTripStatus("draft");
      const destinationLabel = formData.destination.trim() || "Destination";
      const creativeName = (data as { creativeTripName?: string }).creativeTripName;
      const nameFromApi =
        typeof creativeName === "string" && creativeName.trim()
          ? creativeName.trim()
          : "";
      setTripName(nameFromApi || `My ${destinationLabel} Trip`);
      setViewMode("builder");
    } catch {
      setGenerateError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const updateBlock = (id: string, patch: Partial<ItineraryBlock>) => {
    setItineraryBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b))
    );
  };

  const deleteBlock = (id: string) => {
    setItineraryBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const toggleIncludeInItinerary = (blockId: string) => {
    setItineraryBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId ? { ...b, isIncluded: b.isIncluded === false } : b
      )
    );
  };

  const handleFindBookings = async (blockId: string, blockData: ItineraryBlock) => {
    setBookingOptionsLoadingBlockId(blockId);
    try {
      const res = await fetch("/api/get-booking-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: blockData.type,
          title: blockData.title,
          location: blockData.location,
          description: blockData.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error(data?.error ?? "Failed to fetch booking options");
        return;
      }
      const options = Array.isArray(data?.options) ? data.options : [];
      setItineraryBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId ? { ...b, bookingOptions: options } : b
        )
      );
    } finally {
      setBookingOptionsLoadingBlockId(null);
    }
  };

  const addCustomBlock = () => {
    setItineraryBlocks((prev) => [
      ...prev,
      {
        id: uuidv4(),
        date: "",
        location: "",
        type: "activity",
        title: "Custom block",
        description: "Add your own plans here.",
        bookingOptions: undefined,
        isBooked: false,
        isIncluded: true,
      },
    ]);
  };

  const handleSaveTrip = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (!supabase) {
      alert(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
      );
      return;
    }
    const activeBlocks = itineraryBlocks.filter((block) => block.isIncluded !== false);
    if (activeBlocks.length === 0) {
      alert("Please keep at least one item before saving.");
      return;
    }
    const blocksToSave = [...activeBlocks].sort((a, b) =>
      (a.date || "").localeCompare(b.date || "")
    );
    const name =
      tripName.trim() ||
      `My ${formData.destination.trim() || "Destination"} Trip`;
    setIsSaving(true);
    setSaveJustSucceeded(false);
    try {
      const blocksPayload = blocksForPersistence(blocksToSave);
      if (!currentTripId) {
        const { data, error } = await supabase
          .from("trips")
          .insert({ name, blocks: blocksPayload, start_date: formData.startDate, end_date: formData.endDate, user_id: user.id, status: "draft" })
          .select("id")
          .single();
        if (error) throw error;
        const id = data?.id;
        if (id != null) setCurrentTripId(String(id));
      } else {
        const { error } = await supabase
          .from("trips")
          .update({ name, blocks: blocksPayload, start_date: formData.startDate, end_date: formData.endDate, user_id: user.id })
          .eq("id", currentTripId);
        if (error) throw error;
      }
      setItineraryBlocks(blocksToSave);
      setSaveJustSucceeded(true);
      setTimeout(() => setSaveJustSucceeded(false), 2000);
    } catch (e) {
      console.error("SUPABASE ERROR:", e);
      if (e && typeof e === "object" && "message" in e) console.error("MESSAGE:", (e as { message: unknown }).message);
      if (e && typeof e === "object" && "details" in e) console.error("DETAILS:", (e as { details: unknown }).details);
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Failed to save trip";
      alert(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestBooking = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (!supabase) {
      alert(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
      );
      return;
    }
    const activeBlocks = itineraryBlocks.filter((block) => block.isIncluded !== false);
    if (activeBlocks.length === 0) {
      alert("Please keep at least one item before requesting a booking.");
      return;
    }
    const blocksToSave = [...activeBlocks].sort((a, b) =>
      (a.date || "").localeCompare(b.date || "")
    );
    const name =
      tripName.trim() ||
      `My ${formData.destination.trim() || "Destination"} Trip`;
    try {
      const blocksPayload = blocksForPersistence(blocksToSave);
      if (currentTripId == null) {
        const { data, error } = await supabase
          .from("trips")
          .insert({ name, blocks: blocksPayload, start_date: formData.startDate, end_date: formData.endDate, user_id: user.id, status: "quote_requested" })
          .select("id")
          .single();
        if (error) throw error;
        const id = data?.id;
        if (id != null) setCurrentTripId(String(id));
        setTripStatus("quote_requested");
        setItineraryBlocks(blocksToSave);
      } else {
        const { error } = await supabase
          .from("trips")
          .update({ name, blocks: blocksPayload, start_date: formData.startDate, end_date: formData.endDate, status: "quote_requested" })
          .eq("id", currentTripId);
        if (error) throw error;
        setTripStatus("quote_requested");
        setItineraryBlocks(blocksToSave);
      }
      setShowRequestBookingModal(false);
    } catch (e) {
      console.error(e);
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Failed to submit booking request";
      alert(message);
    }
  };

  const handleNewTrip = () => {
    setViewMode("wizard");
    setCurrentTripId(null);
    setItineraryBlocks([]);
    setTripName("");
    setStep(1);
    setFormData(initialFormData);
    setTripStatus("draft");
    setGenerateError(null);
    setSuggestions([]);
    setDropdownOpen(false);
  };

  const primaryDisabledClass =
    "cursor-not-allowed bg-stone-300 text-stone-500 shadow-none hover:bg-stone-300 hover:shadow-none active:scale-100";
  const primaryEnabledClass =
    "bg-stone-900 text-white shadow-lg shadow-stone-900/15 hover:bg-stone-800 hover:shadow-xl active:scale-[0.98]";

  const typeBadgeClass = (type: ItineraryBlock["type"]) => {
    switch (type) {
      case "accommodation":
        return "bg-emerald-50 text-emerald-800 ring-emerald-100";
      case "logistics":
        return "bg-sky-50 text-sky-800 ring-sky-100";
      default:
        return "bg-amber-50 text-amber-900 ring-amber-100";
    }
  };

  /** Timeline blurbs: compact pill colors by type (no labels). */
  const timelineBlurbClass = (type: ItineraryBlock["type"]) => {
    switch (type) {
      case "accommodation":
        return "bg-green-50 text-green-800 border-green-200";
      case "logistics":
        return "bg-blue-50 text-blue-800 border-blue-200";
      default:
        return "bg-orange-50 text-orange-800 border-orange-200";
    }
  };

  // ——— Load saved trip into builder ———
  const [loadTripError, setLoadTripError] = useState<string | null>(null);
  const [loadingTripId, setLoadingTripId] = useState<string | null>(null);

  const loadTrip = async (id: string) => {
    if (!supabase) {
      setLoadTripError(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
      return;
    }
    setLoadTripError(null);
    setLoadingTripId(id);
    try {
      const { data, error } = await supabase
        .from("trips")
        .select("name, blocks, status, start_date, end_date")
        .eq("id", id)
        .single();
      if (error) throw error;
      if (!data) throw new Error("Trip not found");
      const name = String((data as { name?: string }).name ?? "");
      const blocks = parseTripResponse((data as { blocks?: unknown }).blocks).map((b) => ({
        ...b,
        isIncluded: true,
      }));
      const status = (data as { status?: string }).status;
      const startDate = String((data as { start_date?: string }).start_date ?? "").trim();
      const endDate = String((data as { end_date?: string }).end_date ?? "").trim();
      setCurrentTripId(id);
      setTripName(name);
      setItineraryBlocks(blocks);
      setTripStatus(
        status === "quote_requested" || status === "booked" ? status : "draft"
      );
      // Restore form data for header (destination, dates) — always set from loaded trip so header updates when switching trips
      const firstLoc = blocks[0]?.location?.trim();
      const headerDestination = firstLoc || name || undefined;
      setFormData((prev) => ({
        ...prev,
        ...(headerDestination ? { destination: headerDestination } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      }));
      setViewMode("builder");
    } catch (e) {
      console.error(e);
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Failed to load trip";
      setLoadTripError(message);
    } finally {
      setLoadingTripId(null);
    }
  };

  // ——— Dashboard: list trips ———
  type TripRow = { id: string; name: string; created_at: string; status?: string };
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripsError, setTripsError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTrips = useCallback(async () => {
    if (!supabase) {
      setTripsError(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
      setTrips([]);
      return;
    }
    setTripsLoading(true);
    setTripsError(null);
    try {
      const { data, error } = await supabase
        .from("trips")
        .select("id, name, created_at, status")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as TripRow[];
      setTrips(
        rows.map((r) => ({
          id: String(r.id),
          name: String(r.name ?? "Untitled"),
          created_at: String(r.created_at ?? ""),
          status: r.status ?? "draft",
        }))
      );
    } catch (e) {
      console.error(e);
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Failed to load trips";
      setTripsError(message);
      setTrips([]);
    } finally {
      setTripsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "dashboard") void fetchTrips();
  }, [viewMode, fetchTrips]);

  const deleteTrip = async (id: string) => {
    if (!supabase) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from("trips").delete().eq("id", id);
      if (error) throw error;
      setTrips((prev) => prev.filter((t) => t.id !== id));
      if (currentTripId === id) {
        setCurrentTripId(null);
        setItineraryBlocks([]);
        setTripName("");
        setTripStatus("draft");
      }
    } catch (e) {
      console.error(e);
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Failed to delete trip";
      alert(message);
    } finally {
      setDeletingId(null);
    }
  };

  const formatTripDate = (iso: string) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthError(null);
    try {
      if (authMode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (error) throw error;
      }
      setShowAuthModal(false);
      setAuthEmail("");
      setAuthPassword("");
      setAuthError(null);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Something went wrong";
      setAuthError(message);
    }
  };

  const closeAuthModal = () => {
    setShowAuthModal(false);
    setAuthError(null);
    setAuthEmail("");
    setAuthPassword("");
  };

  // ——— Global top nav ———
  const topNav = (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleNewTrip}
            className="text-lg font-semibold tracking-tight text-stone-900 transition hover:text-stone-600"
          >
            Twizz
          </button>
          {isFounderVip === true && (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white shadow-sm"
              title="Twizz Founder VIP"
              aria-label="Twizz Founder VIP"
            >
              <Crown className="h-4 w-4" strokeWidth={2} />
            </span>
          )}
        </div>
        <nav className="relative flex items-center gap-2">
          {tripStatus === "draft" && (
            <button
              type="button"
              onClick={() => setShowRequestBookingModal(true)}
              className="rounded-md bg-black px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-gray-800"
              aria-label="Request VIP booking"
            >
              VIP
            </button>
          )}
          {isFounderVip === true && (
            <Link
              href="/feedback"
              className="flex h-9 items-center justify-center gap-2 rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-800 shadow-sm transition hover:bg-purple-100 hover:border-purple-300"
            >
              <MessageSquare className="h-4 w-4 shrink-0" strokeWidth={2} />
              Beta Feedback
            </Link>
          )}
          <button
            type="button"
            onClick={() => setIsMenuOpen((o) => !o)}
            className="flex h-9 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 hover:border-stone-300"
            aria-expanded={isMenuOpen}
            aria-haspopup="true"
          >
            <Menu className="h-4 w-4 shrink-0" strokeWidth={2} />
            Menu
          </button>
          {isMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                aria-hidden="true"
                onClick={() => setIsMenuOpen(false)}
              />
              <div
                className="absolute right-0 top-full z-50 mt-2 w-48 rounded-md border border-stone-200 bg-white py-1 shadow-lg"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleNewTrip();
                    setIsMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-100"
                >
                  New Trip
                </button>
                {user ? (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setViewMode("dashboard");
                        setIsMenuOpen(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-100"
                    >
                      My Trips
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        supabase?.auth.signOut();
                        setIsMenuOpen(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-100"
                    >
                      Sign Out
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowAuthModal(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-100"
                  >
                    Sign In
                  </button>
                )}
              </div>
            </>
          )}
        </nav>
      </div>
    </header>
  );

  // ——— Auth Modal ———
  const authModal = showAuthModal && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
      aria-labelledby="auth-modal-title"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={closeAuthModal}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"
          aria-label="Close"
        >
          <X className="h-5 w-5" strokeWidth={2} />
        </button>
        <h2 id="auth-modal-title" className="pr-8 text-xl font-semibold text-stone-900">
          {authMode === "signin" ? "Sign In" : "Sign Up"}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          {authMode === "signin"
            ? "Enter your email and password."
            : "Create an account with your email and password."}
        </p>

        {/* Sign in with Google */}
        <div className="mt-6">
          <button
            type="button"
            onClick={async () => {
              if (!supabase) return;
              setAuthError(null);
              // Use current origin so dev stays on localhost, prod on production URL
              const redirectTo = `${window.location.origin}/auth/callback`;
              await supabase.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo },
              });
            }}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-sm font-medium text-stone-900 shadow-sm transition hover:border-stone-300 hover:bg-stone-50"
          >
            <Plane className="h-5 w-5 text-stone-600" strokeWidth={2} aria-hidden />
            Sign in with Google
          </button>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <div className="w-full border-t border-stone-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs font-medium uppercase tracking-wider text-stone-400">
                OR
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleAuthSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-stone-500">
              Email
            </span>
            <input
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-stone-900 shadow-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-stone-500">
              Password
            </span>
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              required
              autoComplete={authMode === "signin" ? "current-password" : "new-password"}
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-stone-900 shadow-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
            />
          </label>
          {authError && (
            <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {authError}
            </p>
          )}
          <div className="flex flex-col gap-3 pt-2">
            <button
              type="submit"
              className="w-full rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
            >
              {authMode === "signin" ? "Sign In" : "Sign Up"}
            </button>
            <button
              type="button"
              onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
              className="text-sm text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-stone-700"
            >
              {authMode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // ——— Dashboard View ———
  if (viewMode === "dashboard") {
    return (
      <div className={`min-h-screen overflow-x-hidden ${isFounderVip === true ? "bg-purple-100" : "bg-[#f8f8f6]"} text-stone-900 antialiased`}>
        {authModal}
        {topNav}
        <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
              My Trips
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Open a saved itinerary or start fresh with New Trip.
            </p>
          </div>

          {loadTripError && (
            <div
              className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {loadTripError}
            </div>
          )}

          {!supabase && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Connect Supabase in .env.local to see your saved trips.
            </div>
          )}

          {tripsLoading && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2
                className="h-10 w-10 animate-spin text-stone-400"
                aria-hidden
              />
              <p className="mt-4 text-sm text-stone-500">Loading your trips…</p>
            </div>
          )}

          {!tripsLoading && tripsError && (
            <div
              className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {tripsError}
            </div>
          )}

          {!tripsLoading && !tripsError && trips.length === 0 && supabase && (
            <div className="rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center shadow-sm">
              <p className="text-stone-600">No saved trips yet.</p>
              <button
                type="button"
                onClick={handleNewTrip}
                className="mt-4 inline-flex rounded-full bg-stone-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
              >
                Plan a trip
              </button>
            </div>
          )}

          {!tripsLoading && !tripsError && trips.length > 0 && (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {trips.map((trip) => (
                <li
                  key={trip.id}
                  className="group relative flex min-w-0 w-full flex-col rounded-2xl border border-stone-200/90 bg-white p-5 shadow-sm ring-1 ring-black/[0.02] transition hover:border-stone-300 hover:shadow-md"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="break-words whitespace-normal text-lg font-semibold text-stone-900">
                        {trip.name}
                      </h2>
                      <p className="mt-1 text-xs font-medium uppercase tracking-wider text-stone-400">
                        Saved {formatTripDate(trip.created_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteTrip(trip.id)}
                      disabled={deletingId === trip.id}
                      className="shrink-0 rounded-xl p-2 text-stone-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      aria-label="Delete trip"
                    >
                      {deletingId === trip.id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Trash2 className="h-5 w-5" strokeWidth={1.5} />
                      )}
                    </button>
                  </div>
                  <div className="mt-6 flex-1" />
                  <button
                    type="button"
                    onClick={() => void loadTrip(trip.id)}
                    disabled={loadingTripId === trip.id}
                    className="w-full rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 disabled:cursor-wait disabled:opacity-90"
                  >
                    {loadingTripId === trip.id ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Opening…
                      </span>
                    ) : (
                      "Open Trip"
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    );
  }

  // ——— Builder View (itinerary drag-drop) ———
  if (viewMode === "builder") {
    return (
      <div className={`min-h-screen ${isFounderVip === true ? "bg-purple-100" : "bg-[#f5f4f1]"} text-stone-900 antialiased`}>
        {authModal}
        {topNav}
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
          <header className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                Your itinerary
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
                {formData.destination}
              </h1>
              {formData.startDate && (
                <p className="mt-1 text-sm text-stone-500">
                  {formData.startDate} – {formData.endDate} ·{" "}
                  {Number(formData.people) >= 1 ? Number(formData.people) : "—"}{" "}
                  {Number(formData.people) === 1 ? "guest" : "guests"}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setViewMode("wizard");
                setItineraryBlocks([]);
                setCurrentTripId(null);
                setTripStatus("draft");
              }}
              className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 shadow-sm transition hover:bg-stone-50"
            >
              Edit trip
            </button>
          </header>

          {/* Sticky workspace header: trip name + concierge CTA + save (below global nav h-14) */}
          <div className={`sticky top-14 z-10 -mx-4 mb-6 border-b border-stone-200/80 px-4 py-4 backdrop-blur-sm sm:-mx-6 sm:px-6 ${isFounderVip === true ? "bg-purple-100/95" : "bg-[#f5f4f1]/95"}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Trip name
                </span>
                <input
                  type="text"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  placeholder={`My ${formData.destination.trim() || "Destination"} Trip`}
                  className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base font-medium text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
                />
              </label>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {tripStatus === "quote_requested" && (
                  <span className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-500">
                    <Sparkles className="h-4 w-4 text-stone-400" strokeWidth={1.5} aria-hidden />
                    Quote Requested — Advisor Reviewing
                  </span>
                )}
                {tripStatus === "booked" && (
                  <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                    <CheckCircle className="h-4 w-4 text-emerald-600" strokeWidth={2} aria-hidden />
                    Trip Confirmed
                  </span>
                )}
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={() => void handleSaveTrip()}
                    disabled={isSaving}
                    className={`rounded-xl px-6 py-3 text-base font-semibold shadow-lg shadow-stone-900/15 transition active:scale-[0.98] ${
                      isSaving
                        ? "cursor-wait bg-stone-600 text-white"
                        : saveJustSucceeded
                          ? "bg-emerald-600 text-white hover:bg-emerald-600"
                          : "bg-stone-900 text-white hover:bg-stone-800"
                    } disabled:opacity-90`}
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      {isSaving && (
                        <Loader2
                          className="h-5 w-5 shrink-0 animate-spin"
                          aria-hidden
                        />
                      )}
                      {isSaving
                        ? "Saving…"
                        : saveJustSucceeded
                          ? "Saved!"
                          : "Save Trip"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Request VIP Booking modal */}
          {showRequestBookingModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-sm"
              aria-modal="true"
              role="dialog"
              aria-labelledby="request-booking-modal-title"
            >
              <div className="relative w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl">
                <button
                  type="button"
                  onClick={() => setShowRequestBookingModal(false)}
                  className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
                <div className="flex items-center gap-3 text-amber-600">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                    <Bell className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <h2 id="request-booking-modal-title" className="text-xl font-semibold text-stone-900">
                    Submit Booking Request?
                  </h2>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-stone-600">
                  Our human advisors will review your itinerary, secure VIP perks (like room upgrades), and send you a soft quote. No credit card required.
                </p>
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 ring-1 ring-amber-200/80">
                  Note: Only the items you have bookmarked will be submitted for booking.
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => void handleRequestBooking()}
                    className="w-full rounded-xl bg-amber-500 py-3 text-base font-semibold text-white shadow-lg shadow-amber-500/25 transition hover:bg-amber-600"
                  >
                    Confirm Request
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRequestBookingModal(false)}
                    className="w-full rounded-xl border border-stone-200 py-3 text-sm font-medium text-stone-600 transition hover:bg-stone-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* View mode tabs: Builder | Timeline | Map */}
          <div className="mb-6">
            <nav
              className="flex rounded-full border border-stone-200 bg-white p-1 shadow-sm"
              aria-label="Itinerary view"
            >
              {(
                [
                  { id: "builder" as const, label: "Builder", icon: Layers },
                  { id: "timeline" as const, label: "Timeline", icon: CalendarDays },
                  { id: "map" as const, label: "Map", icon: MapPin },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveView(id)}
                  className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition sm:flex-initial ${
                    activeView === id
                      ? "bg-stone-900 text-white shadow-sm"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                  }`}
                  aria-current={activeView === id ? "true" : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {activeView === "builder" && (() => {
            const activeBlocks = itineraryBlocks.filter((b) => b.isIncluded !== false);
            const discardedBlocks = itineraryBlocks.filter((b) => b.isIncluded === false);
            return (
              <>
                <ul className="space-y-4">
                  {activeBlocks.map((block) => (
                    <ItineraryItemCard
                      key={block.id}
                      block={block}
                      dragHandleProps={null}
                      updateBlock={updateBlock}
                      deleteBlock={deleteBlock}
                      toggleIncludeInItinerary={toggleIncludeInItinerary}
                      typeBadgeClass={typeBadgeClass}
                    />
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={addCustomBlock}
                  className="mt-6 w-full rounded-2xl border border-dashed border-stone-300 bg-white/60 py-4 text-sm font-medium text-stone-600 shadow-sm transition hover:border-stone-400 hover:bg-white hover:text-stone-900"
                >
                  + Add custom block
                </button>

                <hr className="my-8 border-gray-300" />

                {discardedBlocks.length > 0 && (
                  <div className="opacity-50 grayscale">
                    <ul className="space-y-4">
                      {discardedBlocks.map((block) => (
                        <ItineraryItemCard
                          key={block.id}
                          block={block}
                          dragHandleProps={null}
                          updateBlock={updateBlock}
                          deleteBlock={deleteBlock}
                          toggleIncludeInItinerary={toggleIncludeInItinerary}
                          typeBadgeClass={typeBadgeClass}
                        />
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-6 flex flex-col gap-4">
                  <div className="rounded-2xl border border-stone-200 bg-white/90 px-5 py-4 shadow-sm ring-1 ring-black/[0.03]">
                    <p className="text-sm font-medium uppercase tracking-wider text-stone-500">
                      Total Estimated Cost
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-stone-900">
                      ${tripTotal.toLocaleString()}
                    </p>
                  </div>
                </div>
              </>
            );
          })()}

          {activeView === "map" && (
            <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-stone-200 bg-white/80 py-16 text-center shadow-sm">
              <p className="text-lg font-medium text-stone-500">Map View Coming Soon</p>
            </div>
          )}

          {activeView === "timeline" && (
            <div
              ref={timelineContainerRef}
              className="relative border-l-2 border-stone-200 pl-8"
            >
              {groupBlocksByDateForTimeline(itineraryBlocks).length === 0 ? (
                <div className="py-12 text-center text-sm text-stone-500">
                  Add items with dates in Builder to see your timeline.
                </div>
              ) : (
                <>
                  {/* Green connector lines: check-in dot → check-out dot (behind content) */}
                  {getMultiDayBlocks(itineraryBlocks).map((block) => {
                    const pos = timelineLinePositions[block.id];
                    if (!pos || pos.height <= 0) return null;
                    return (
                      <div
                        key={`line-${block.id}`}
                        className="pointer-events-none absolute left-0 w-0.5 rounded-full bg-green-400"
                        style={{
                          top: pos.top,
                          height: pos.height,
                          marginLeft: "-1px",
                        }}
                        aria-hidden
                      />
                    );
                  })}
                  {groupBlocksByDateForTimeline(itineraryBlocks).map((group) => (
                    <div key={group.date} className="relative pb-10 last:pb-0">
                      {/* Day header dot on track */}
                      <div
                        className="absolute -left-8 top-0.5 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-stone-900 shadow-sm"
                        aria-hidden
                      />
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500">
                        Day {group.dayIndex}: {group.dayLabel}
                      </h2>
                      <ul className="mt-4 space-y-3">
                        {group.blocks.map((entry) => {
                          const isCheckout =
                            typeof entry === "object" &&
                            "kind" in entry &&
                            entry.kind === "checkout";
                          if (isCheckout && "sourceBlock" in entry) {
                            const source = entry.sourceBlock;
                            const title =
                              source.isBooked && source.bookedName
                                ? source.bookedName
                                : source.title || "Accommodation";
                            return (
                              <li
                                key={`checkout-${source.id}`}
                                className="relative flex items-center justify-between gap-3 pl-2"
                              >
                                {/* Dot on track (ref for green line end) */}
                                <div
                                  ref={(el) => {
                                    timelineLineEndRefs.current[source.id] = el;
                                  }}
                                  className="absolute -left-8 top-5 h-2 w-2 -translate-x-1/2 rounded-full bg-green-500 ring-2 ring-white shadow-sm"
                                  aria-hidden
                                />
                                <span
                                  className={`inline-flex w-fit max-w-md items-center gap-2 rounded-lg border py-2 px-4 shadow-sm ${timelineBlurbClass("accommodation")}`}
                                >
                                  Check out: {title}
                                </span>
                                {source.price != null && (
                                  <span className="shrink-0 font-semibold text-gray-700">
                                    ${Math.round(Number(source.price))}
                                  </span>
                                )}
                              </li>
                            );
                          }
                          const block = entry as ItineraryBlock;
                          const isMultiDay =
                            block.endDate && block.endDate !== (block.date || "");
                          const displayName =
                            block.isBooked && block.bookedName
                              ? block.bookedName
                              : block.title || "Untitled";
                          const isAccommodation = block.type === "accommodation";
                          const blurbLabel =
                            isAccommodation && isMultiDay
                              ? `Check in: ${displayName}`
                              : displayName;
                          return (
                            <li key={block.id} className="relative flex items-center justify-between gap-3 pl-2">
                              {/* Dot on track: ref for green line start when multi-day accommodation */}
                              <div
                                ref={(el) => {
                                  if (isMultiDay)
                                    timelineLineStartRefs.current[block.id] = el;
                                }}
                                className={`absolute -left-8 top-5 h-2 w-2 -translate-x-1/2 rounded-full ring-2 ring-white shadow-sm ${
                                  isMultiDay && isAccommodation
                                    ? "bg-green-500"
                                    : "bg-stone-400"
                                }`}
                                aria-hidden
                              />
                              <span
                                className={`inline-flex w-fit max-w-md items-center gap-2 rounded-lg border py-2 px-4 shadow-sm ${timelineBlurbClass(block.type)}`}
                              >
                                {blurbLabel}
                              </span>
                              {block.price != null && (
                                <span className="shrink-0 font-semibold text-gray-700">
                                  ${Math.round(Number(block.price))}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                  {groupBlocksByDateForTimeline(itineraryBlocks).length > 0 && (
                    <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end items-center">
                      <div className="bg-white px-6 py-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                        <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Estimated Budget</span>
                        <span className="text-2xl font-bold text-gray-900">${totalBudget.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ——— Wizard (multi-step form) ———
  return (
    <div className={`min-h-screen ${isFounderVip === true ? "bg-purple-100" : "bg-[#fafaf9]"} text-stone-900 antialiased`}>
      {authModal}
      {topNav}
      <div className="flex min-h-screen flex-col pt-4">

        <main className="flex flex-1 flex-col items-center justify-center px-6 pb-12 pt-4">
          {generateError && (
            <div
              className="mb-6 w-full max-w-2xl rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {generateError}
            </div>
          )}

          <div className="mb-12 flex items-center gap-2">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-500 ease-out ${
                  i + 1 === step
                    ? "w-8 bg-stone-900"
                    : i + 1 < step
                      ? "w-1.5 bg-stone-400"
                      : "w-1.5 bg-stone-200"
                }`}
                aria-hidden
              />
            ))}
          </div>

          <div className="relative min-h-[320px] w-full max-w-2xl sm:min-h-[380px]">
            {/* Step 1 — Destination */}
            <div
              className={`transition-all duration-500 ease-out ${
                step === 1
                  ? "translate-y-0 opacity-100"
                  : step > 1
                    ? "pointer-events-none absolute inset-0 -translate-y-6 opacity-0"
                    : "pointer-events-none absolute inset-0 translate-y-6 opacity-0"
              }`}
              aria-hidden={step !== 1}
            >
              <div className="flex flex-col items-center text-center">
                <h1 className="mb-12 text-pretty text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl lg:text-5xl">
                  Where do you want to escape to?
                </h1>
                <div ref={dropdownContainerRef} className="relative w-full">
                  <MapPin
                    className="pointer-events-none absolute left-0 top-1/2 z-10 h-6 w-6 -translate-y-1/2 text-stone-400 sm:left-1"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <input
                    type="text"
                    role="combobox"
                    aria-expanded={dropdownOpen}
                    aria-autocomplete="list"
                    aria-controls="destination-suggestions"
                    value={formData.destination}
                    onChange={(e) => {
                      updateField("destination", e.target.value);
                      setDropdownOpen(true);
                    }}
                    onFocus={() => {
                      if (
                        suggestions.length > 0 ||
                        formData.destination.trim().length >= GEOCODE_MIN_QUERY_LEN
                      ) {
                        setDropdownOpen(true);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setDropdownOpen(false);
                        return;
                      }
                      if (e.key === "Enter" && step1Valid && !dropdownOpen) {
                        e.preventDefault();
                        goNext();
                      }
                    }}
                    placeholder="City, region, or country"
                    className="relative z-0 w-full border-0 border-b-2 border-stone-200 bg-transparent py-4 pl-10 pr-2 text-left text-xl text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none sm:pl-12 sm:text-2xl"
                    autoFocus={step === 1}
                    aria-invalid={!step1Valid}
                    aria-describedby={!step1Valid ? "step1-hint" : undefined}
                    autoComplete="off"
                  />
                  {dropdownOpen &&
                    (suggestionsLoading || suggestions.length > 0) && (
                      <ul
                        id="destination-suggestions"
                        role="listbox"
                        className="absolute left-0 right-0 top-full z-20 mt-2 max-h-64 overflow-auto rounded-2xl border border-stone-100 bg-white py-2 shadow-lg shadow-stone-200/80 ring-1 ring-black/5"
                      >
                        {suggestionsLoading && suggestions.length === 0 && (
                          <li className="px-4 py-3 text-left text-sm text-stone-500">
                            Searching…
                          </li>
                        )}
                        {suggestions.map((r) => {
                          const label = formatCityLabel(r);
                          return (
                            <li key={r.id} role="option">
                              <button
                                type="button"
                                className="w-full px-4 py-3 text-left text-base text-stone-900 transition-colors hover:bg-stone-100 focus:bg-stone-100 focus:outline-none"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => selectDestination(r)}
                              >
                                <span className="font-medium">{r.name}</span>
                                <span className="mt-0.5 block text-sm text-stone-500">
                                  {[r.admin1, r.country].filter(Boolean).join(" · ")}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                </div>
                {!step1Valid && (
                  <p id="step1-hint" className="mt-4 text-sm text-stone-400">
                    Enter a destination to continue.
                  </p>
                )}
              </div>
            </div>

            {/* Step 2 — Logistics */}
            <div
              className={`transition-all duration-500 ease-out ${
                step === 2
                  ? "translate-y-0 opacity-100"
                  : step > 2
                    ? "pointer-events-none absolute inset-0 -translate-y-6 opacity-0"
                    : "pointer-events-none absolute inset-0 translate-y-6 opacity-0"
              }`}
              aria-hidden={step !== 2}
            >
              <div className="flex flex-col items-center text-center">
                <h1 className="mb-12 text-pretty text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl lg:text-5xl">
                  When and who?
                </h1>
                <div className="w-full space-y-10 text-left">
                  <div className="grid gap-10 sm:grid-cols-2">
                    <div>
                      <label className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-stone-500">
                        <Calendar className="h-4 w-4" strokeWidth={1.5} />
                        Arrival date
                      </label>
                      <input
                        type="date"
                        value={formData.startDate}
                        onChange={(e) => updateField("startDate", e.target.value)}
                        required
                        className={`w-full rounded-2xl border bg-white px-4 py-4 text-lg text-stone-900 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-stone-200 ${
                          !formData.startDate.trim()
                            ? "border-amber-200 focus:border-amber-400"
                            : "border-stone-200 focus:border-stone-900"
                        }`}
                        aria-invalid={!formData.startDate.trim()}
                      />
                    </div>
                    <div>
                      <label className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-stone-500">
                        <Calendar className="h-4 w-4" strokeWidth={1.5} />
                        Departure date
                      </label>
                      <input
                        type="date"
                        value={formData.endDate}
                        onChange={(e) => updateField("endDate", e.target.value)}
                        min={formData.startDate || undefined}
                        required
                        className={`w-full rounded-2xl border bg-white px-4 py-4 text-lg text-stone-900 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-stone-200 ${
                          !formData.endDate.trim() || formData.endDate < formData.startDate
                            ? "border-amber-200 focus:border-amber-400"
                            : "border-stone-200 focus:border-stone-900"
                        }`}
                        aria-invalid={!formData.endDate.trim() || formData.endDate < formData.startDate}
                      />
                    </div>
                  </div>
                  <div className="grid gap-10 sm:grid-cols-2">
                    <div>
                      <label className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-stone-500">
                        <Users className="h-4 w-4" strokeWidth={1.5} />
                        How many people?
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={formData.people === "" ? "" : String(formData.people)}
                        onChange={(e) => updateField("people", e.target.value)}
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-lg text-stone-900 shadow-sm transition-colors focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>
                </div>
                {!step2Valid && (
                  <p className="mt-8 text-center text-sm text-stone-400">
                    Choose arrival and departure dates to continue.
                  </p>
                )}
              </div>
            </div>

            {/* Step 3 — Vibe */}
            <div
              className={`transition-all duration-500 ease-out ${
                step === 3
                  ? "translate-y-0 opacity-100"
                  : step < 3
                    ? "pointer-events-none absolute inset-0 translate-y-6 opacity-0"
                    : "pointer-events-none absolute inset-0 -translate-y-6 opacity-0"
              }`}
              aria-hidden={step !== 3}
            >
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex items-center justify-center gap-2">
                  <Sparkles
                    className="h-8 w-8 text-amber-500"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                </div>
                <h1 className="mb-4 text-pretty text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl lg:text-5xl">
                  What&apos;s the vibe?
                </h1>
                <p className="mb-10 max-w-lg text-pretty text-base leading-relaxed text-stone-500 sm:text-lg">
                  Tell us about the occasion, transportation preferences, or
                  specific things you must do.
                </p>
                <div className="relative w-full">
                  <textarea
                    value={formData.vibe}
                    onChange={(e) => updateField("vibe", e.target.value)}
                    placeholder="Romantic getaway, beach-only days, no driving after dark…"
                    rows={6}
                    className="w-full resize-none rounded-3xl border border-stone-200 bg-white p-6 text-left text-lg leading-relaxed text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-200 sm:text-xl"
                    autoFocus={step === 3}
                    aria-invalid={!step3Valid}
                  />
                </div>
                {!step3Valid && (
                  <p className="mt-4 text-sm text-stone-400">
                    Add a few details about your trip to build your itinerary.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-16 flex w-full max-w-2xl items-center justify-between gap-4">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 1}
              className="flex items-center gap-2 rounded-full px-5 py-3 text-base font-medium text-stone-600 transition-all duration-300 hover:bg-stone-100 hover:text-stone-900 disabled:pointer-events-none disabled:opacity-0"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2} />
              Back
            </button>

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!canGoNext}
                aria-disabled={!canGoNext}
                className={`flex items-center gap-2 rounded-full px-8 py-3 text-base font-medium transition-all duration-300 ${
                  canGoNext ? primaryEnabledClass : primaryDisabledClass
                }`}
              >
                Next
                <ChevronRight className="h-5 w-5" strokeWidth={2} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleBuildItinerary}
                disabled={!step3Valid || generating}
                aria-disabled={!step3Valid || generating}
                className={`flex items-center gap-2 rounded-full px-10 py-4 text-lg font-semibold transition-all duration-300 ${
                  step3Valid && !generating
                    ? "bg-stone-900 text-white shadow-xl shadow-stone-900/20 hover:bg-stone-800 hover:shadow-2xl active:scale-[0.98]"
                    : primaryDisabledClass
                }`}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2} />
                    Building…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" strokeWidth={2} />
                    Build My Itinerary
                  </>
                )}
              </button>
            )}
          </div>
        </main>

        <footer className="shrink-0 pb-8 text-center text-sm text-stone-400">
          © {new Date().getFullYear()} Twizz
        </footer>
      </div>
    </div>
  );
}
