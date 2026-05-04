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
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { ItineraryItemCard } from "./components/ItineraryItemCard";
import type { ItineraryBlock } from "@/lib/itinerary-types";
import {
  coerceItineraryBlockFromUnknown,
  blockLocationLabel,
} from "@/lib/itinerary-types";
import { AddCustomBlockWizardModal } from "./components/AddCustomBlockWizardModal";
import { LiveHotelSearch, type HotelSearchResult } from "./components/LiveHotelSearch";
import MapTab from "./components/MapTab";
import { v4 as uuidv4 } from "uuid";

type FormData = {
  /** Set only when the user picks a row from Google Places suggestions (cleared if they edit the field). */
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  /** Number of travelers; may be empty string while user is typing */
  people: number | string;
  vibe: string;
};

/** Trip wizard step 1 — shared glass styling for origin and destination inputs. */
const TRIP_WIZARD_LOCATION_INPUT_CLASS =
  "w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3.5 pl-11 pr-10 text-base text-white shadow-sm backdrop-blur placeholder:text-slate-400 transition-all focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:ring-offset-0 [color-scheme:dark]";

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
    const geoFields =
      block.type === "logistics"
        ? {
            startLocation: block.startLocation,
            endLocation: block.endLocation,
          }
        : { location: block.location };

    return {
      id: block.id,
      date: block.date,
      ...(block.endDate ? { endDate: block.endDate } : {}),
      ...geoFields,
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
  origin: "",
  destination: "",
  startDate: "",
  endDate: "",
  people: 2,
  vibe: "",
};

const TOTAL_STEPS = 3;

function isStep1Valid(data: FormData) {
  return data.origin.trim().length > 0 && data.destination.trim().length > 0;
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

/** Droppable id for itinerary items with no date (optional bucket when undated blocks exist). */
const BUILDER_UNSCHEDULED_DROPPABLE = "__builder_unscheduled__";

function addCalendarDaysIso(isoDate: string, deltaDays: number): string {
  const t = new Date(isoDate + "T12:00:00");
  t.setDate(t.getDate() + deltaDays);
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function enumerateTripDateStrings(start: string, end: string): string[] {
  const s = (start || "").trim();
  const e = (end || "").trim();
  if (!s || !e || e < s) return [];
  const out: string[] = [];
  let cur = s;
  while (cur <= e) {
    out.push(cur);
    cur = addCalendarDaysIso(cur, 1);
  }
  return out;
}

function droppableIdToBlockDate(droppableId: string): string {
  return droppableId === BUILDER_UNSCHEDULED_DROPPABLE ? "" : droppableId;
}

function formatBuilderDayHeader(date: string, dayIndex: number): string {
  const parsed = new Date(date + "T12:00:00");
  if (Number.isNaN(parsed.getTime())) {
    return `DAY ${dayIndex} • ${date.toUpperCase()}`;
  }
  const wd = parsed.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const mon = parsed.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const n = parsed.getDate();
  return `DAY ${dayIndex} • ${wd}, ${mon} ${n}`;
}

type BuilderDayBucket = {
  droppableId: string;
  date: string;
  dayHeader: string;
  blocks: ItineraryBlock[];
};

/** Day buckets for Builder: trip date range ∪ block dates; unscheduled only if needed. Preserves within-day order from `activeBlocks`. */
function getBuilderDayBuckets(
  activeBlocks: ItineraryBlock[],
  tripStart: string,
  tripEnd: string
): BuilderDayBucket[] {
  const tripDays = enumerateTripDateStrings(tripStart, tripEnd);
  const dateSet = new Set<string>(tripDays);
  for (const b of activeBlocks) {
    const d = (b.date || "").trim();
    if (d) dateSet.add(d);
  }
  const orderedDates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));
  const byDay = new Map<string, ItineraryBlock[]>();
  for (const d of orderedDates) byDay.set(d, []);

  const unscheduled: ItineraryBlock[] = [];
  for (const block of activeBlocks) {
    const d = (block.date || "").trim();
    if (d === "") {
      unscheduled.push(block);
      continue;
    }
    byDay.get(d)!.push(block);
  }
  const buckets: BuilderDayBucket[] = [];

  if (unscheduled.length > 0) {
    buckets.push({
      droppableId: BUILDER_UNSCHEDULED_DROPPABLE,
      date: "",
      dayHeader: "UNSCHEDULED",
      blocks: unscheduled,
    });
  }

  let dayIdx = 0;
  for (const d of orderedDates) {
    buckets.push({
      droppableId: d,
      date: d,
      dayHeader: formatBuilderDayHeader(d, ++dayIdx),
      blocks: byDay.get(d) ?? [],
    });
  }

  return buckets;
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
    return data.map((b) =>
      coerceItineraryBlockFromUnknown(b as Record<string, unknown>, () => uuidv4())
    );
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
  const [showAddBlockWizard, setShowAddBlockWizard] = useState(false);

  // Auth
  const [user, setUser] = useState<any>(null);
  /** Twizz Founders VIP: profile flag for Beta Feedback link, badges, and gated features. */
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

  const selectOriginPlace = useCallback((place: HotelSearchResult) => {
    const formatted = [place.name, place.location].filter(Boolean).join(" — ");
    setFormData((prev) => ({ ...prev, origin: formatted }));
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

  const handleBuilderDragEnd = useCallback(
    (result: DropResult) => {
      const { destination, source, draggableId } = result;
      if (!destination) return;
      if (
        destination.droppableId === source.droppableId &&
        destination.index === source.index
      ) {
        return;
      }

      setItineraryBlocks((prev) => {
        const discarded = prev.filter((b) => b.isIncluded === false);
        const active = prev.filter((b) => b.isIncluded !== false);

        const bucketModels = getBuilderDayBuckets(
          active,
          formData.startDate,
          formData.endDate
        );
        const buckets = bucketModels.map((b) => ({
          ...b,
          blocks: [...b.blocks],
        }));

        const sourceBucket = buckets.find((b) => b.droppableId === source.droppableId);
        const destBucket = buckets.find((b) => b.droppableId === destination.droppableId);
        if (!sourceBucket || !destBucket) return prev;

        const sourceList = sourceBucket.blocks;
        const [moved] = sourceList.splice(source.index, 1);
        if (!moved || moved.id !== draggableId) return prev;

        const destDate = droppableIdToBlockDate(destination.droppableId);
        const updated =
          source.droppableId === destination.droppableId
            ? moved
            : { ...moved, date: destDate };

        destBucket.blocks.splice(destination.index, 0, updated);

        const newActive = buckets.flatMap((b) => b.blocks);
        return [...newActive, ...discarded];
      });
    },
    [formData.startDate, formData.endDate]
  );

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
          location: blockLocationLabel(blockData),
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

  const handleAddBlockFromWizard = (block: ItineraryBlock) => {
    setItineraryBlocks((prev) => [...prev, block]);
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
    "cursor-not-allowed bg-white/15 text-white/40 shadow-none hover:bg-white/15 hover:shadow-none active:scale-100";
  const primaryEnabledClass =
    "bg-white text-slate-950 shadow-lg shadow-black/25 hover:bg-slate-200 hover:shadow-xl transition-colors duration-200 active:scale-[0.98]";

  const typeBadgeClass = (type: ItineraryBlock["type"]) => {
    switch (type) {
      case "accommodation":
        return "bg-emerald-500/20 text-emerald-200 ring-emerald-400/30";
      case "logistics":
        return "bg-sky-500/20 text-sky-200 ring-sky-400/30";
      default:
        return "bg-amber-500/20 text-amber-200 ring-amber-400/30";
    }
  };

  /** Timeline blurbs: compact pill colors by type (no labels). */
  const timelineBlurbClass = (type: ItineraryBlock["type"]) => {
    switch (type) {
      case "accommodation":
        return "border border-emerald-500/30 bg-emerald-950/40 text-emerald-100";
      case "logistics":
        return "border border-sky-500/30 bg-sky-950/40 text-sky-100";
      default:
        return "border border-amber-500/30 bg-amber-950/40 text-amber-100";
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
      const firstLoc = blocks[0] ? blockLocationLabel(blocks[0]).trim() : "";
      const headerDestination = firstLoc || name || undefined;
      setFormData((prev) => ({
        ...prev,
        origin: "",
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
    <header
      className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl transition-colors duration-[400ms] ease-[var(--twizz-transition-ease)]"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleNewTrip}
            className="text-lg font-semibold tracking-tight text-white transition-colors duration-200 hover:opacity-90"
          >
            Twizz
          </button>
          {isFounderVip === true && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-100"
              title="Founder VIP"
            >
              <Crown className="h-3 w-3 shrink-0 text-amber-300" strokeWidth={2} aria-hidden />
              VIP
            </span>
          )}
        </div>
        <nav className="relative flex items-center gap-2">
          {isFounderVip === true && (
            <Link
              href="/feedback"
              className="flex h-9 items-center justify-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-white/20"
            >
              <MessageSquare className="h-4 w-4 shrink-0" strokeWidth={2} />
              Beta Feedback
            </Link>
          )}
          <button
            type="button"
            onClick={() => setIsMenuOpen((o) => !o)}
            className="flex h-9 items-center justify-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-200 hover:bg-white/20"
            aria-expanded={isMenuOpen}
            aria-haspopup="true"
          >
            <Menu className="h-4 w-4 shrink-0" strokeWidth={2} />
            Menu
          </button>
          {isMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-[99]"
                aria-hidden="true"
                onClick={() => setIsMenuOpen(false)}
              />
              <div
                className="absolute right-0 top-full z-[100] mt-2 w-48 rounded-md border border-white/15 bg-slate-900/95 py-1 text-white shadow-lg backdrop-blur-xl"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleNewTrip();
                    setIsMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/10"
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
                      className="w-full px-4 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/10"
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
                      className="w-full px-4 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/10"
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
                    className="w-full px-4 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/10"
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
      aria-labelledby="auth-modal-title"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl">
        <button
          type="button"
          onClick={closeAuthModal}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" strokeWidth={2} />
        </button>
        <h2 id="auth-modal-title" className="pr-8 text-xl font-semibold text-white">
          {authMode === "signin" ? "Sign In" : "Sign Up"}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
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
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-slate-900/50 px-4 py-3.5 text-sm font-medium text-white shadow-sm backdrop-blur transition hover:border-white/25 hover:bg-slate-800/80"
          >
            <Plane className="h-5 w-5 text-slate-400" strokeWidth={2} aria-hidden />
            Sign in with Google
          </button>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-slate-900/90 px-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                OR
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleAuthSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
              Email
            </span>
            <input
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white shadow-sm backdrop-blur placeholder:text-slate-500 focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/15 [color-scheme:dark]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
              Password
            </span>
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              required
              autoComplete={authMode === "signin" ? "current-password" : "new-password"}
              className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white shadow-sm backdrop-blur placeholder:text-slate-500 focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/15 [color-scheme:dark]"
            />
          </label>
          {authError && (
            <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200" role="alert">
              {authError}
            </p>
          )}
          <div className="flex flex-col gap-3 pt-2">
            <button
              type="submit"
              className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-slate-200"
            >
              {authMode === "signin" ? "Sign In" : "Sign Up"}
            </button>
            <button
              type="button"
              onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
              className="text-sm text-slate-400 underline decoration-white/20 underline-offset-2 hover:text-white"
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
      <div
        className="min-h-screen bg-slate-950 text-white transition-colors duration-[400ms] ease-[var(--twizz-transition-ease)] antialiased"
        data-theme="vip"
      >
        {authModal}
        {topNav}
        {/* Sticky sub-nav: flush under main nav (h-16); content scrolls beneath */}
        <div className="relative min-h-[calc(100vh-4rem)]">
          <header
            className="sticky top-16 z-40 w-full border-b border-white/10 bg-slate-900/80 backdrop-blur-xl transition-colors duration-[400ms] ease-[var(--twizz-transition-ease)]"
          >
            <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 md:px-8">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  My Trips
                </h1>
                {isFounderVip === true && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/35 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-amber-100">
                    <Crown className="h-3.5 w-3.5 text-amber-300" strokeWidth={2} aria-hidden />
                    Founder VIP
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-white/70">
                Open a saved itinerary or start fresh with New Trip.
              </p>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">

          {loadTripError && (
            <div
              className="mb-6 rounded-2xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200"
              role="alert"
            >
              {loadTripError}
            </div>
          )}

          {!supabase && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
              Connect Supabase in .env.local to see your saved trips.
            </div>
          )}

          {tripsLoading && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2
                className="h-10 w-10 animate-spin text-slate-500"
                aria-hidden
              />
              <p className="mt-4 text-sm text-slate-400">Loading your trips…</p>
            </div>
          )}

          {!tripsLoading && tripsError && (
            <div
              className="rounded-2xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200"
              role="alert"
            >
              {tripsError}
            </div>
          )}

          {!tripsLoading && !tripsError && trips.length === 0 && supabase && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 px-6 py-12 text-center shadow-lg shadow-black/20 ring-1 ring-white/5 backdrop-blur-md">
              <p className="text-slate-300">No saved trips yet.</p>
              <button
                type="button"
                onClick={handleNewTrip}
                className="mt-4 inline-flex rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-slate-200"
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
                  className="group relative flex min-w-0 w-full flex-col rounded-2xl border border-white/10 bg-slate-900/50 p-5 shadow-lg shadow-black/25 ring-1 ring-white/5 backdrop-blur-md transition hover:border-white/20 hover:ring-white/10"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="break-words whitespace-normal text-lg font-semibold text-white">
                        {trip.name}
                      </h2>
                      <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                        Saved {formatTripDate(trip.created_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteTrip(trip.id)}
                      disabled={deletingId === trip.id}
                      className="shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
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
                    className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-slate-200 disabled:cursor-wait disabled:opacity-90"
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
      </div>
    );
  }

  // ——— Builder View (itinerary drag-drop) ———
  if (viewMode === "builder") {
    return (
      <div
        className="min-h-screen bg-slate-950 text-white transition-colors duration-[400ms] ease-[var(--twizz-transition-ease)] antialiased"
        data-theme="vip"
      >
        {authModal}
        {topNav}
        {/* Sticky sub-nav: flush under main nav (h-16); content scrolls beneath */}
        <header
          className="sticky top-16 z-40 w-full border-b border-white/10 bg-slate-900/80 backdrop-blur-xl transition-colors duration-[400ms] ease-[var(--twizz-transition-ease)]"
        >
          <div className="mx-auto max-w-2xl px-4 py-3 sm:px-6">
            {/* Compact trip meta: dates (left) · travelers (right) */}
            <div className="mb-2 flex flex-row items-center justify-between w-full">
              <div className="min-w-0 flex items-center gap-1.5">
                <span className="text-xs font-medium tabular-nums text-white">
                  {formData.startDate.trim() ? formData.startDate : "—"}
                </span>
                <span className="text-xs text-white/50">→</span>
                <span className="text-xs font-medium tabular-nums text-white">
                  {formData.endDate.trim() ? formData.endDate : "—"}
                </span>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <span className="text-xs text-white/50">TRAVELERS:</span>
                <span className="text-xs font-medium tabular-nums text-white">
                  {Number(formData.people) >= 1 ? Number(formData.people) : "—"}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-white/70">
                  Trip name
                </span>
                <input
                  type="text"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  placeholder={`My ${formData.destination.trim() || "Destination"} Trip`}
                  className="h-12 w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 text-base font-medium text-white shadow-sm backdrop-blur placeholder:text-slate-400 focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/20"
                />
              </label>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {tripStatus === "booked" && (
                  <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-200">
                    <CheckCircle className="h-4 w-4 text-emerald-400" strokeWidth={2} aria-hidden />
                    Trip Confirmed
                  </span>
                )}
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={() => void handleSaveTrip()}
                    disabled={isSaving}
                    className={`flex h-12 items-center justify-center rounded-xl px-6 text-base font-semibold transition-all active:scale-[0.98] ${
                      isSaving
                        ? "cursor-wait bg-slate-600 text-white"
                        : saveJustSucceeded
                          ? "bg-emerald-600 text-white hover:bg-emerald-600"
                          : "border border-white/15 bg-slate-900/50 text-white shadow-lg shadow-black/20 backdrop-blur-sm hover:bg-slate-800/80 disabled:opacity-90"
                    }`}
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
        </header>

        <div className="mx-auto max-w-2xl px-4 pb-8 pt-4 sm:px-6">
          <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
            <div className="flex shrink-0 items-center" aria-label="Estimated trip budget">
              <div className="inline-flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-2.5 shadow-sm backdrop-blur-sm sm:gap-4 sm:px-5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80 sm:text-xs">
                  Est. budget
                </span>
                <span className="text-lg font-bold tabular-nums tracking-tight text-white sm:text-xl">
                  ${totalBudget.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setViewMode("wizard");
                setItineraryBlocks([]);
                setCurrentTripId(null);
                setTripStatus("draft");
              }}
              className="shrink-0 rounded-full border border-white/15 bg-slate-900/40 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:border-white/25 hover:bg-slate-800/60"
            >
              Edit trip
            </button>
          </div>

          {/* Request VIP Booking modal */}
          <AddCustomBlockWizardModal
            open={showAddBlockWizard}
            onClose={() => setShowAddBlockWizard(false)}
            tripStartDate={formData.startDate}
            tripEndDate={formData.endDate}
            defaultLocation={formData.destination.trim()}
            tripContext={{
              destination: formData.destination.trim(),
              people: Number(formData.people) || 2,
              vibe:
                typeof formData.vibe === "string"
                  ? formData.vibe.trim()
                  : String(formData.vibe ?? "").trim(),
            }}
            onAddToItinerary={handleAddBlockFromWizard}
          />

          {showRequestBookingModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
              aria-modal="true"
              role="dialog"
              aria-labelledby="request-booking-modal-title"
            >
              <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => setShowRequestBookingModal(false)}
                  className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
                <div className="flex items-center gap-3 text-amber-300">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/15">
                    <Bell className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <h2 id="request-booking-modal-title" className="text-xl font-semibold text-white">
                    Submit Booking Request?
                  </h2>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-slate-400">
                  Our human advisors will review your itinerary, secure VIP perks (like room upgrades), and send you a soft quote. No credit card required.
                </p>
                <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-100">
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
                    className="w-full rounded-xl border border-white/15 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/10"
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
              className="flex rounded-full border border-white/10 bg-slate-900/50 p-1 shadow-inner shadow-black/20 backdrop-blur-md"
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
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-400 hover:bg-white/10 hover:text-white"
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
            const dayBuckets = getBuilderDayBuckets(
              activeBlocks,
              formData.startDate,
              formData.endDate
            );
            const bucketDividerClass = "mt-8 border-t border-white/10 pt-8";
            const dayHeaderClass =
              "text-sm font-medium uppercase tracking-widest text-slate-400";

            return (
              <>
                <DragDropContext onDragEnd={handleBuilderDragEnd}>
                  <div>
                    {dayBuckets.map((bucket, bucketIndex) => (
                      <div
                        key={bucket.droppableId}
                        className={bucketIndex > 0 ? bucketDividerClass : ""}
                      >
                        <h2 className={`${dayHeaderClass} select-none`}>{bucket.dayHeader}</h2>
                        <Droppable droppableId={bucket.droppableId}>
                          {(dropProvided) => (
                            <ul
                              ref={dropProvided.innerRef}
                              {...dropProvided.droppableProps}
                              className="mt-4 space-y-4"
                            >
                              {bucket.blocks.map((block, index) => (
                                <Draggable key={block.id} draggableId={block.id} index={index}>
                                  {(dragProvided, snapshot) => (
                                    <ItineraryItemCard
                                      block={block}
                                      isFounderVip={isFounderVip}
                                      dragHandleProps={dragProvided.dragHandleProps}
                                      dragInnerRef={dragProvided.innerRef}
                                      dragDraggableProps={dragProvided.draggableProps}
                                      snapshot={snapshot}
                                      updateBlock={updateBlock}
                                      deleteBlock={deleteBlock}
                                      toggleIncludeInItinerary={toggleIncludeInItinerary}
                                      typeBadgeClass={typeBadgeClass}
                                    />
                                  )}
                                </Draggable>
                              ))}
                              {dropProvided.placeholder}
                            </ul>
                          )}
                        </Droppable>
                      </div>
                    ))}
                  </div>
                </DragDropContext>

                <button
                  type="button"
                  onClick={() => setShowAddBlockWizard(true)}
                  className="mt-6 w-full rounded-2xl border border-dashed border-white/20 bg-slate-900/30 py-4 text-sm font-medium text-white/80 shadow-sm backdrop-blur-sm transition hover:border-white/35 hover:bg-slate-900/50 hover:text-white"
                >
                  Add block to itinerary
                </button>

                <hr className="my-8 border-white/10" />

                {discardedBlocks.length > 0 && (
                  <div className="opacity-50 grayscale">
                    <ul className="space-y-4">
                      {discardedBlocks.map((block) => (
                        <ItineraryItemCard
                          key={block.id}
                          block={block}
                          isFounderVip={isFounderVip}
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
                  <div className="rounded-2xl border border-white/10 bg-slate-900/50 px-5 py-4 shadow-lg shadow-black/20 ring-1 ring-white/5 backdrop-blur-md">
                    <p className="text-sm font-medium uppercase tracking-wider text-slate-400">
                      Total Estimated Cost
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-white">
                      ${tripTotal.toLocaleString()}
                    </p>
                  </div>
                </div>
              </>
            );
          })()}

          {activeView === "map" && (
            <MapTab
              itineraryItems={itineraryBlocks.filter((b) => b.isIncluded !== false)}
            />
          )}

          {activeView === "timeline" && (
            <div
              ref={timelineContainerRef}
              className="relative border-l-2 border-white/15 pl-10 sm:pl-12 transition-all duration-300 ease-[var(--twizz-transition-ease)]"
            >
              {groupBlocksByDateForTimeline(itineraryBlocks).length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm font-medium text-slate-500">
                    Add items with dates in Builder to see your timeline.
                  </p>
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
                        className="pointer-events-none absolute left-0 w-0.5 rounded-full bg-green-400 transition-opacity duration-300"
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
                    <div key={group.date} className="relative pb-14 last:pb-0 transition-all duration-300 ease-[var(--twizz-transition-ease)]">
                      {/* Day header dot on track */}
                      <div
                        className="absolute -left-10 sm:-left-12 top-1 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-slate-950 bg-white shadow-md shadow-black/40"
                        aria-hidden
                      />
                      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Day {group.dayIndex}
                      </h2>
                      <p className="mt-0.5 text-base font-medium tracking-tight text-white">
                        {group.dayLabel}
                      </p>
                      <ul className="mt-6 space-y-4">
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
                                className="relative flex items-center justify-between gap-3 pl-3 transition-opacity duration-200"
                              >
                                {/* Dot on track (ref for green line end) */}
                                <div
                                  ref={(el) => {
                                    timelineLineEndRefs.current[source.id] = el;
                                  }}
                                  className="absolute -left-10 sm:-left-12 top-5 h-2 w-2 -translate-x-1/2 rounded-full bg-green-500 ring-2 ring-slate-950 shadow-sm"
                                  aria-hidden
                                />
                                <span
                                  className={`inline-flex w-fit max-w-md items-center gap-2 rounded-lg border py-2 px-4 shadow-sm ${timelineBlurbClass("accommodation")}`}
                                >
                                  Check out: {title}
                                </span>
                                {source.price != null && (
                                  <span className="shrink-0 font-semibold text-slate-300">
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
                            <li key={block.id} className="relative flex items-center justify-between gap-3 pl-3 transition-opacity duration-200">
                              {/* Dot on track: ref for green line start when multi-day accommodation */}
                              <div
                                ref={(el) => {
                                  if (isMultiDay)
                                    timelineLineStartRefs.current[block.id] = el;
                                }}
                                className={`absolute -left-10 sm:-left-12 top-5 h-2 w-2 -translate-x-1/2 rounded-full ring-2 ring-slate-950 shadow-sm ${
                                  isMultiDay && isAccommodation
                                    ? "bg-green-500"
                                    : "bg-slate-500"
                                }`}
                                aria-hidden
                              />
                              <span
                                className={`inline-flex w-fit max-w-md items-center gap-2 rounded-lg border py-2 px-4 shadow-sm ${timelineBlurbClass(block.type)}`}
                              >
                                {blurbLabel}
                              </span>
                              {block.price != null && (
                                <span className="shrink-0 font-semibold text-slate-300">
                                  ${Math.round(Number(block.price))}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
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
    <div
      className="min-h-screen bg-slate-950 text-white transition-colors duration-[400ms] ease-[var(--twizz-transition-ease)] antialiased"
      data-theme="vip"
    >
      {authModal}
      {topNav}
      <div className="flex min-h-screen flex-col pt-4">

        <main className="flex flex-1 flex-col items-center justify-center px-6 pb-12 pt-4">
          {generateError && (
            <div
              className="mb-6 w-full max-w-2xl rounded-2xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200"
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
                    ? "w-8 bg-white"
                    : i + 1 < step
                      ? "w-1.5 bg-white/60"
                      : "w-1.5 bg-white/20"
                }`}
                aria-hidden
              />
            ))}
          </div>

          <div className="relative min-h-[420px] w-full max-w-2xl sm:min-h-[520px]">
            {/* Step 1 — Origin + destination */}
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
                <h1 className="mb-10 text-pretty text-3xl font-medium tracking-tight text-white sm:mb-12 sm:text-4xl lg:text-5xl">
                  Where do you want to escape to?
                </h1>
                <div className="w-full space-y-10 text-left">
                  <div>
                    <label
                      htmlFor="trip-wizard-origin"
                      className="mb-3 block text-sm font-medium uppercase tracking-wider text-slate-400"
                    >
                      Where are you leaving from?
                    </label>
                    <div className="relative w-full">
                      <LiveHotelSearch
                        inputId="trip-wizard-origin"
                        value={formData.origin}
                        onSelect={selectOriginPlace}
                        onQueryChange={() =>
                          setFormData((prev) => ({ ...prev, origin: "" }))
                        }
                        searchApiBasePath="/api/places/autocomplete?profile=origin"
                        placeholder="City, airport, or region"
                        emptyMessage="No matching places. Keep typing."
                        hintMessage="Select a suggestion to confirm your departure point."
                        autoFocus={step === 1}
                        inputClassName={TRIP_WIZARD_LOCATION_INPUT_CLASS}
                        listClassName="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-white/15 bg-slate-900/95 py-2 shadow-lg shadow-black/30 ring-1 ring-white/10 backdrop-blur-xl"
                        listItemClassName="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left text-base text-white transition hover:bg-white/10 focus:bg-white/10 focus:outline-none"
                        listItemSelectedClassName="bg-white/15"
                        listEmptyClassName="px-4 py-3 text-left text-sm text-slate-400"
                        listHintClassName="mt-1 border-t border-white/10 px-4 pb-1 pt-3 text-sm text-slate-400 select-none"
                        loaderClassName="text-slate-400"
                        listItemLocationClassName="text-slate-400"
                        listItemBadgeClassName="hidden"
                      />
                      <Plane
                        className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-gray-400"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    </div>
                  </div>
                  <div ref={dropdownContainerRef} className="relative w-full">
                    <label
                      htmlFor="trip-wizard-destination"
                      className="mb-3 block text-sm font-medium uppercase tracking-wider text-slate-400"
                    >
                      Where are you headed?
                    </label>
                    <div className="relative w-full">
                      <MapPin
                        className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-gray-400"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      <input
                        id="trip-wizard-destination"
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
                        className={TRIP_WIZARD_LOCATION_INPUT_CLASS}
                        aria-invalid={!step1Valid}
                        aria-describedby={!step1Valid ? "step1-hint" : undefined}
                        autoComplete="off"
                      />
                    </div>
                  {dropdownOpen &&
                    (suggestionsLoading || suggestions.length > 0) && (
                      <ul
                        id="destination-suggestions"
                        role="listbox"
                        className="absolute left-0 right-0 top-full z-20 mt-2 max-h-64 overflow-auto rounded-2xl border border-white/15 bg-slate-900/95 py-2 shadow-lg shadow-black/30 ring-1 ring-white/10 backdrop-blur-xl"
                      >
                        {suggestionsLoading && suggestions.length === 0 && (
                          <li className="px-4 py-3 text-left text-sm text-slate-400">
                            Searching…
                          </li>
                        )}
                        {suggestions.map((r) => {
                          const label = formatCityLabel(r);
                          return (
                            <li key={r.id} role="option">
                              <button
                                type="button"
                                className="w-full px-4 py-3 text-left text-base text-white transition-colors hover:bg-white/10 focus:bg-white/10 focus:outline-none"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => selectDestination(r)}
                              >
                                <span className="font-medium">{r.name}</span>
                                <span className="mt-0.5 block text-sm text-slate-400">
                                  {[r.admin1, r.country].filter(Boolean).join(" · ")}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
                {!step1Valid && (
                  <p
                    id="step1-hint"
                    className="mt-4 text-center text-sm text-slate-500"
                  >
                    Select your departure place from the suggestions and enter a destination to continue.
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
                <h1 className="mb-12 text-pretty text-3xl font-medium tracking-tight text-white sm:text-4xl lg:text-5xl">
                  When and who?
                </h1>
                <div className="w-full space-y-10 text-left">
                  <div className="grid gap-10 sm:grid-cols-2">
                    <div>
                      <label className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-slate-400">
                        <Calendar className="h-4 w-4" strokeWidth={1.5} />
                        Arrival date
                      </label>
                      <input
                        type="date"
                        value={formData.startDate}
                        onChange={(e) => updateField("startDate", e.target.value)}
                        required
                        className={`w-full rounded-2xl border px-4 py-4 text-lg text-white shadow-sm transition-colors [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-white/20 ${
                          !formData.startDate.trim()
                            ? "border-amber-400/60 bg-slate-900/50 backdrop-blur focus:border-amber-400/80"
                            : "border-white/15 bg-slate-900/50 backdrop-blur focus:border-white/40"
                        }`}
                        aria-invalid={!formData.startDate.trim()}
                      />
                    </div>
                    <div>
                      <label className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-slate-400">
                        <Calendar className="h-4 w-4" strokeWidth={1.5} />
                        Departure date
                      </label>
                      <input
                        type="date"
                        value={formData.endDate}
                        onChange={(e) => updateField("endDate", e.target.value)}
                        min={formData.startDate || undefined}
                        required
                        className={`w-full rounded-2xl border px-4 py-4 text-lg text-white shadow-sm transition-colors [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-white/20 ${
                          !formData.endDate.trim() || formData.endDate < formData.startDate
                            ? "border-amber-400/60 bg-slate-900/50 backdrop-blur focus:border-amber-400/80"
                            : "border-white/15 bg-slate-900/50 backdrop-blur focus:border-white/40"
                        }`}
                        aria-invalid={!formData.endDate.trim() || formData.endDate < formData.startDate}
                      />
                    </div>
                  </div>
                  <div className="grid gap-10 sm:grid-cols-2">
                    <div>
                      <label className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-slate-400">
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
                        className="w-full rounded-2xl border border-white/15 bg-slate-900/50 px-4 py-4 text-lg text-white shadow-sm backdrop-blur transition-colors [appearance:textfield] [color-scheme:dark] placeholder:text-slate-400 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </div>
                  </div>
                </div>
                {!step2Valid && (
                  <p className="mt-8 text-center text-sm text-slate-500">
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
                <h1 className="mb-4 text-pretty text-3xl font-medium tracking-tight text-white sm:text-4xl lg:text-5xl">
                  What&apos;s the vibe?
                </h1>
                <p className="mb-10 max-w-lg text-pretty text-base leading-relaxed text-slate-400 sm:text-lg">
                  Tell us about the occasion, transportation preferences, or
                  specific things you must do.
                </p>
                <div className="relative w-full">
                  <textarea
                    value={formData.vibe}
                    onChange={(e) => updateField("vibe", e.target.value)}
                    placeholder="Romantic getaway, beach-only days, no driving after dark…"
                    rows={6}
                    className="w-full resize-none rounded-3xl border border-white/15 bg-slate-900/50 p-6 text-left text-lg leading-relaxed text-white shadow-sm backdrop-blur placeholder:text-slate-400 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 sm:text-xl [color-scheme:dark]"
                    autoFocus={step === 3}
                    aria-invalid={!step3Valid}
                  />
                </div>
                {!step3Valid && (
                  <p className="mt-4 text-sm text-slate-500">
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
              className="flex items-center gap-2 rounded-full px-5 py-3 text-base font-medium text-slate-400 transition-all duration-300 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-0"
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
                  step3Valid && !generating ? primaryEnabledClass : primaryDisabledClass
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

        <footer className="shrink-0 pb-8 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} Twizz
        </footer>
      </div>
    </div>
  );
}
