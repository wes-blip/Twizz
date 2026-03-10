"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
} from "lucide-react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { v4 as uuidv4 } from "uuid";

type FormData = {
  destination: string;
  startDate: string;
  nights: number;
  people: number;
  vibe: string;
};

type ItineraryBlock = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** City or area */
  location: string;
  type: "accommodation" | "activity" | "logistics";
  title: string;
  description: string;
};

const initialFormData: FormData = {
  destination: "",
  startDate: "",
  nights: 3,
  people: 2,
  vibe: "",
};

const TOTAL_STEPS = 3;

function isStep1Valid(data: FormData) {
  return data.destination.trim().length > 0;
}

function isStep2Valid(data: FormData) {
  if (!data.startDate.trim()) return false;
  if (!Number.isFinite(data.nights) || data.nights < 1) return false;
  if (!Number.isFinite(data.people) || data.people < 1) return false;
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

function parseTripResponse(data: unknown): ItineraryBlock[] {
  if (Array.isArray(data)) {
    return data.map((b) => ({
      id: String((b as ItineraryBlock).id ?? uuidv4()),
      date: String((b as ItineraryBlock).date ?? ""),
      location: String((b as ItineraryBlock).location ?? ""),
      type:
        (b as ItineraryBlock).type === "accommodation" ||
        (b as ItineraryBlock).type === "logistics"
          ? (b as ItineraryBlock).type
          : "activity",
      title: String((b as ItineraryBlock).title ?? ""),
      description: String((b as ItineraryBlock).description ?? ""),
    }));
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
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [itineraryBlocks, setItineraryBlocks] = useState<ItineraryBlock[]>([]);
  const [tripName, setTripName] = useState("");
  /** When set, next save updates this row; when null, insert creates a new trip. */
  const [currentTripId, setCurrentTripId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  /** Brief success state for Save button label. */
  const [saveJustSucceeded, setSaveJustSucceeded] = useState(false);

  // Step 1 — destination autocomplete (Open-Meteo Geocoding)
  const [suggestions, setSuggestions] = useState<GeocodingResult[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

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
    setGenerateError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(
          typeof data?.error === "string" ? data.error : "Failed to generate trip"
        );
        return;
      }
      const blocks = parseTripResponse(data);
      setItineraryBlocks(blocks);
      setCurrentTripId(null);
      const destinationLabel = formData.destination.trim() || "Destination";
      setTripName(`My ${destinationLabel} Trip`);
      setViewMode("builder");
    } catch {
      setGenerateError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(itineraryBlocks);
    const [reordered] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reordered);
    setItineraryBlocks(items);
  };

  const updateBlock = (id: string, patch: Partial<ItineraryBlock>) => {
    setItineraryBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b))
    );
  };

  const deleteBlock = (id: string) => {
    setItineraryBlocks((prev) => prev.filter((b) => b.id !== id));
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
      },
    ]);
  };

  const handleSaveTrip = async () => {
    if (!supabase) {
      alert(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
      );
      return;
    }
    const name =
      tripName.trim() ||
      `My ${formData.destination.trim() || "Destination"} Trip`;
    setIsSaving(true);
    setSaveJustSucceeded(false);
    try {
      if (!currentTripId) {
        const { data, error } = await supabase
          .from("trips")
          .insert({ name, blocks: itineraryBlocks })
          .select("id")
          .single();
        if (error) throw error;
        const id = data?.id;
        if (id != null) setCurrentTripId(String(id));
      } else {
        const { error } = await supabase
          .from("trips")
          .update({ name, blocks: itineraryBlocks })
          .eq("id", currentTripId);
        if (error) throw error;
      }
      setSaveJustSucceeded(true);
      setTimeout(() => setSaveJustSucceeded(false), 2000);
    } catch (e) {
      console.error(e);
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Failed to save trip";
      alert(message);
    } finally {
      setIsSaving(false);
    }
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
        .select("name, blocks")
        .eq("id", id)
        .single();
      if (error) throw error;
      if (!data) throw new Error("Trip not found");
      const name = String((data as { name?: string }).name ?? "");
      const blocks = parseTripResponse((data as { blocks?: unknown }).blocks);
      setCurrentTripId(id);
      setTripName(name);
      setItineraryBlocks(blocks);
      // Restore destination label in header when possible from first block
      const firstLoc = blocks[0]?.location?.trim();
      if (firstLoc && !formData.destination.trim()) {
        setFormData((prev) => ({ ...prev, destination: firstLoc }));
      }
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
  type TripRow = { id: string; name: string; created_at: string };
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
        .select("id, name, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as TripRow[];
      setTrips(
        rows.map((r) => ({
          id: String(r.id),
          name: String(r.name ?? "Untitled"),
          created_at: String(r.created_at ?? ""),
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

  // ——— Global top nav ———
  const topNav = (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <button
          type="button"
          onClick={() => setViewMode("wizard")}
          className="text-lg font-semibold tracking-tight text-stone-900 transition hover:text-stone-600"
        >
          Twizz
        </button>
        <nav className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setViewMode("wizard")}
            className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 hover:border-stone-300"
          >
            New Trip
          </button>
          <button
            type="button"
            onClick={() => setViewMode("dashboard")}
            className={`rounded-full px-4 py-2 text-sm font-medium shadow-sm transition ${
              viewMode === "dashboard"
                ? "bg-stone-900 text-white hover:bg-stone-800"
                : "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
            }`}
          >
            My Trips
          </button>
        </nav>
      </div>
    </header>
  );

  // ——— Dashboard View ———
  if (viewMode === "dashboard") {
    return (
      <div className="min-h-screen bg-[#f8f8f6] text-stone-900 antialiased">
        {topNav}
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
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
                onClick={() => setViewMode("wizard")}
                className="mt-4 inline-flex rounded-full bg-stone-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
              >
                Plan a trip
              </button>
            </div>
          )}

          {!tripsLoading && !tripsError && trips.length > 0 && (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {trips.map((trip) => (
                <li
                  key={trip.id}
                  className="group relative flex flex-col rounded-2xl border border-stone-200/90 bg-white p-5 shadow-sm ring-1 ring-black/[0.02] transition hover:border-stone-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-lg font-semibold text-stone-900">
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
      <div className="min-h-screen bg-[#f5f4f1] text-stone-900 antialiased">
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
                  {formData.startDate} · {formData.nights} nights · {formData.people}{" "}
                  {formData.people === 1 ? "guest" : "guests"}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setViewMode("wizard");
                setItineraryBlocks([]);
                setCurrentTripId(null);
              }}
              className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 shadow-sm transition hover:bg-stone-50"
            >
              Edit trip
            </button>
          </header>

          {/* Sticky workspace header: trip name + save (below global nav h-14) */}
          <div className="sticky top-14 z-10 -mx-4 mb-6 border-b border-stone-200/80 bg-[#f5f4f1]/95 px-4 py-4 backdrop-blur-sm sm:-mx-6 sm:px-6">
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
              <button
                type="button"
                onClick={() => void handleSaveTrip()}
                disabled={isSaving}
                className={`shrink-0 rounded-xl px-6 py-3 text-base font-semibold shadow-lg shadow-stone-900/15 transition active:scale-[0.98] ${
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

          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="itinerary-list">
              {(provided) => (
                <ul
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="space-y-4"
                >
                  {itineraryBlocks.map((block, index) => (
                    <Draggable
                      key={block.id}
                      draggableId={block.id}
                      index={index}
                    >
                      {(dragProvided, snapshot) => (
                        <li
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className={`rounded-2xl border border-stone-200/80 bg-white shadow-sm ring-1 ring-black/[0.03] transition-shadow ${
                            snapshot.isDragging
                              ? "shadow-lg ring-stone-200"
                              : "hover:shadow-md"
                          }`}
                        >
                          <div className="flex gap-3 p-4 sm:p-5">
                            <div
                              {...dragProvided.dragHandleProps}
                              className="flex shrink-0 cursor-grab touch-none items-start pt-1 text-stone-300 hover:text-stone-500 active:cursor-grabbing"
                              aria-label="Drag to reorder"
                            >
                              <GripVertical className="h-5 w-5" strokeWidth={1.5} />
                            </div>
                            <div className="min-w-0 flex-1 space-y-3">
                              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                                <div className="flex min-w-0 flex-1 flex-col gap-1">
                                  <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
                                    Date
                                  </label>
                                  <input
                                    type="date"
                                    value={block.date}
                                    onChange={(e) =>
                                      updateBlock(block.id, { date: e.target.value })
                                    }
                                    className="w-full max-w-[11rem] rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm text-stone-800 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
                                  />
                                </div>
                                <div className="min-w-0 flex-1 flex-col gap-1 sm:min-w-[12rem]">
                                  <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
                                    Location
                                  </label>
                                  <input
                                    type="text"
                                    value={block.location}
                                    onChange={(e) =>
                                      updateBlock(block.id, {
                                        location: e.target.value,
                                      })
                                    }
                                    placeholder="City or area"
                                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
                                  />
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${typeBadgeClass(block.type)}`}
                                >
                                  {block.type}
                                </span>
                              </div>
                              <input
                                type="text"
                                value={block.title}
                                onChange={(e) =>
                                  updateBlock(block.id, { title: e.target.value })
                                }
                                className="w-full border-0 bg-transparent text-lg font-semibold tracking-tight text-stone-900 placeholder:text-stone-300 focus:outline-none focus:ring-0"
                                placeholder="Title"
                              />
                              <textarea
                                value={block.description}
                                onChange={(e) =>
                                  updateBlock(block.id, {
                                    description: e.target.value,
                                  })
                                }
                                rows={3}
                                className="w-full resize-y rounded-xl border border-stone-100 bg-stone-50/50 px-3 py-2 text-sm leading-relaxed text-stone-600 placeholder:text-stone-400 focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-200"
                                placeholder="Description"
                              />
                              <div className="flex items-center gap-2">
                                <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
                                  Type
                                </label>
                                <select
                                  value={block.type}
                                  onChange={(e) =>
                                    updateBlock(block.id, {
                                      type: e.target.value as ItineraryBlock["type"],
                                    })
                                  }
                                  className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm text-stone-700 focus:border-stone-400 focus:outline-none"
                                >
                                  <option value="activity">Activity</option>
                                  <option value="accommodation">Accommodation</option>
                                  <option value="logistics">Logistics</option>
                                </select>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => deleteBlock(block.id)}
                              className="shrink-0 rounded-xl p-2 text-stone-400 transition hover:bg-red-50 hover:text-red-600"
                              aria-label="Delete block"
                            >
                              <Trash2 className="h-5 w-5" strokeWidth={1.5} />
                            </button>
                          </div>
                        </li>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </DragDropContext>

          <button
            type="button"
            onClick={addCustomBlock}
            className="mt-6 w-full rounded-2xl border border-dashed border-stone-300 bg-white/60 py-4 text-sm font-medium text-stone-600 shadow-sm transition hover:border-stone-400 hover:bg-white hover:text-stone-900"
          >
            + Add custom block
          </button>
        </div>
      </div>
    );
  }

  // ——— Wizard (multi-step form) ———
  return (
    <div className="min-h-screen bg-[#fafaf9] text-stone-900 antialiased">
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
                  <div>
                    <label className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-stone-500">
                      <Calendar className="h-4 w-4" strokeWidth={1.5} />
                      Start date
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
                  <div className="grid gap-10 sm:grid-cols-2">
                    <div>
                      <label className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-stone-500">
                        <Calendar className="h-4 w-4" strokeWidth={1.5} />
                        How many nights?
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={formData.nights}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") return;
                          const n = parseInt(v, 10);
                          if (Number.isFinite(n))
                            updateField("nights", Math.max(1, Math.min(60, n)));
                        }}
                        onBlur={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (!Number.isFinite(n) || n < 1)
                            updateField("nights", initialFormData.nights);
                        }}
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-lg text-stone-900 shadow-sm transition-colors focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-200"
                      />
                    </div>
                    <div>
                      <label className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-stone-500">
                        <Users className="h-4 w-4" strokeWidth={1.5} />
                        How many people?
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={formData.people}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") return;
                          const n = parseInt(v, 10);
                          if (Number.isFinite(n))
                            updateField("people", Math.max(1, Math.min(50, n)));
                        }}
                        onBlur={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (!Number.isFinite(n) || n < 1)
                            updateField("people", initialFormData.people);
                        }}
                        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-lg text-stone-900 shadow-sm transition-colors focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-200"
                      />
                    </div>
                  </div>
                </div>
                {!step2Valid && (
                  <p className="mt-8 text-center text-sm text-stone-400">
                    Choose a start date to continue.
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
