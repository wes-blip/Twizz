"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import { X, Hotel, Sparkles, TrainFront, Loader2 } from "lucide-react";
import {
  coerceItineraryBlockFromUnknown,
  type ItineraryBlock,
} from "@/lib/itinerary-types";
import { v4 as uuidv4 } from "uuid";

export type CustomBlockWizardType = "accommodation" | "activity" | "logistics";

export type CustomBlockTripContext = {
  destination: string;
  people: number;
  vibe: string;
};

const TRANSPORT_MODES = [
  "Train",
  "Flight",
  "Car",
  "Bus",
  "Ferry",
  "Walking",
  "Other",
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  /** YYYY-MM-DD from trip */
  tripStartDate: string;
  /** YYYY-MM-DD from trip */
  tripEndDate: string;
  /** Prefill / fallback location label (e.g. trip destination) */
  defaultLocation: string;
  tripContext: CustomBlockTripContext;
  onAddToItinerary: (block: ItineraryBlock) => void;
};

type Step = 1 | 2 | 3;

const initialDetails = {
  transportationMode: "",
  fromLocation: "",
  toLocation: "",
  accommodationVibe: "",
  activityDescription: "",
};

export function AddCustomBlockWizardModal({
  open,
  onClose,
  tripStartDate,
  tripEndDate,
  defaultLocation,
  tripContext,
  onAddToItinerary,
}: Props) {
  const titleId = useId();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [selectedType, setSelectedType] = useState<CustomBlockWizardType | null>(null);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [selectDay, setSelectDay] = useState("");
  const [details, setDetails] = useState(initialDetails);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setCurrentStep(1);
    setSelectedType(null);
    setCheckIn("");
    setCheckOut("");
    setSelectDay("");
    setDetails(initialDetails);
    setIsGenerating(false);
    setGenerateError(null);
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const tripBoundsOk =
    Boolean(tripStartDate?.trim()) &&
    Boolean(tripEndDate?.trim()) &&
    tripEndDate >= tripStartDate;

  const step1Valid = selectedType !== null;

  const step2Valid =
    tripBoundsOk &&
    selectedType !== null &&
    (selectedType === "accommodation"
      ? Boolean(
          checkIn &&
            checkOut &&
            checkIn >= tripStartDate &&
            checkIn <= tripEndDate &&
            checkOut >= checkIn &&
            checkOut >= tripStartDate &&
            checkOut <= tripEndDate
        )
      : Boolean(selectDay && selectDay >= tripStartDate && selectDay <= tripEndDate));

  const step3Valid =
    selectedType !== null &&
    (selectedType === "logistics"
      ? Boolean(
          details.transportationMode.trim() &&
            details.fromLocation.trim() &&
            details.toLocation.trim()
        )
      : selectedType === "accommodation"
        ? details.accommodationVibe.trim().length > 0
        : details.activityDescription.trim().length > 0);

  const canGoNext =
    (currentStep === 1 && step1Valid) ||
    (currentStep === 2 && step2Valid) ||
    (currentStep === 3 && step3Valid);

  const goBack = () => {
    if (isGenerating) return;
    if (currentStep === 1) {
      onClose();
      return;
    }
    setCurrentStep((s) => (s === 1 ? 1 : ((s - 1) as Step)));
  };

  const goNext = () => {
    if (isGenerating) return;
    if (currentStep === 1 && !step1Valid) return;
    if (currentStep === 2 && !step2Valid) return;
    if (currentStep < 3) setCurrentStep((s) => (s + 1) as Step);
  };

  const buildIntent = (): string | null => {
    if (!selectedType) return null;
    if (selectedType === "accommodation") {
      return details.accommodationVibe.trim() || null;
    }
    if (selectedType === "activity") {
      return details.activityDescription.trim() || null;
    }
    const mode = details.transportationMode.trim();
    const from = details.fromLocation.trim();
    const to = details.toLocation.trim();
    if (!mode || !from || !to) return null;
    return `${mode}: ${from} → ${to}`;
  };

  const handlePrimary = async () => {
    if (currentStep < 3) {
      goNext();
      return;
    }
    if (!step3Valid || !selectedType) return;
    const intent = buildIntent();
    if (!intent) return;

    setIsGenerating(true);
    setGenerateError(null);

    const tripDestination =
      (tripContext.destination || defaultLocation).trim() || "Trip";

    try {
      const res = await fetch("/api/generate-custom-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: selectedType,
          date: selectedType === "accommodation" ? checkIn : selectDay,
          ...(selectedType === "accommodation" ? { endDate: checkOut } : {}),
          tripDestination,
          people: tripContext.people,
          vibe: tripContext.vibe,
          intent,
          ...(selectedType === "logistics"
            ? {
                logistics: {
                  mode: details.transportationMode.trim(),
                  fromLocation: details.fromLocation.trim(),
                  toLocation: details.toLocation.trim(),
                },
              }
            : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setGenerateError(typeof data?.error === "string" ? data.error : "Generation failed.");
        return;
      }

      const raw = data.itineraryBlocks?.[0];
      if (!raw || typeof raw.id !== "string" || !raw.id) {
        setGenerateError("Invalid response from generator.");
        return;
      }

      const block = coerceItineraryBlockFromUnknown(
        {
          ...(raw as Record<string, unknown>),
          isBooked: false,
          isIncluded: true,
        },
        () => uuidv4()
      );

      if (block.type === "accommodation") {
        const { location: _loc, lat: _lat, lng: _lng, googlePlaceId: _gpid, ...rest } = block;
        onAddToItinerary(rest);
      } else {
        onAddToItinerary(block);
      }
      onClose();
    } catch {
      setGenerateError("Network error. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!open) return null;

  const dateMin = tripBoundsOk ? tripStartDate : undefined;
  const dateMax = tripBoundsOk ? tripEndDate : undefined;
  const checkOutMin = checkIn || dateMin;
  const primaryLabel =
    currentStep === 3 ? (isGenerating ? "Curating…" : "Save / Generate") : "Continue";

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4 backdrop-blur-md motion-reduce:backdrop-blur-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-busy={isGenerating}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/40 backdrop-blur-xl motion-reduce:backdrop-blur-none"
        data-theme="vip"
      >
        {isGenerating && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-slate-950/75 px-8 text-center backdrop-blur-sm motion-reduce:backdrop-blur-none"
            aria-live="polite"
          >
            <Loader2
              className="h-10 w-10 animate-spin text-white/90 motion-reduce:animate-none"
              strokeWidth={1.25}
              aria-hidden
            />
            <p className="text-sm font-medium tracking-wide text-white/90">
              Curating specific recommendation…
            </p>
            <p className="max-w-xs text-xs leading-relaxed text-white/50">
              Matching a concrete place to your dates and intent.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          disabled={isGenerating}
          className="absolute right-4 top-4 cursor-pointer rounded-xl p-2 text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40"
          aria-label="Close"
        >
          <X className="h-5 w-5" strokeWidth={1.5} />
        </button>

        <div className="border-b border-white/10 px-6 pb-4 pt-6 sm:px-8 sm:pt-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">
            Step {currentStep} of 3
          </p>
          <h2 id={titleId} className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
            {currentStep === 1 && "What would you like to add?"}
            {currentStep === 2 && "When?"}
            {currentStep === 3 && "The Details"}
          </h2>
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto px-6 py-6 sm:px-8">
          {generateError && (
            <p
              className="mb-4 rounded-xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100/95"
              role="alert"
            >
              {generateError}
            </p>
          )}
          {currentStep === 1 && (
            <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
              {(
                [
                  {
                    type: "accommodation" as const,
                    label: "Accommodation",
                    sub: "Hotels & stays",
                    icon: Hotel,
                  },
                  {
                    type: "activity" as const,
                    label: "Activity",
                    sub: "Experiences",
                    icon: Sparkles,
                  },
                  {
                    type: "logistics" as const,
                    label: "Logistics",
                    sub: "Getting around",
                    icon: TrainFront,
                  },
                ] as const
              ).map(({ type, label, sub, icon: Icon }) => {
                const selected = selectedType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedType(type)}
                    disabled={isGenerating}
                    className={`group flex cursor-pointer flex-col items-center rounded-2xl border px-4 py-6 text-center transition-all duration-200 sm:py-8 disabled:pointer-events-none disabled:opacity-50 ${
                      selected
                        ? "border-white/30 bg-white/10 shadow-lg shadow-black/20 ring-1 ring-white/20"
                        : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]"
                    }`}
                  >
                    <Icon
                      className={`h-8 w-8 transition-colors duration-200 ${
                        selected ? "text-white" : "text-white/55 group-hover:text-white/80"
                      }`}
                      strokeWidth={1.25}
                    />
                    <span className="mt-3 text-sm font-semibold text-white">{label}</span>
                    <span className="mt-1 text-xs text-white/45">{sub}</span>
                  </button>
                );
              })}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-5">
              {!tripBoundsOk && (
                <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/80">
                  Trip start and end dates are required to pick days. Set them when planning or
                  loading your trip.
                </p>
              )}
              {selectedType === "accommodation" && (
                <>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
                      Check-in Date
                    </span>
                    <input
                      type="date"
                      value={checkIn}
                      min={dateMin}
                      max={dateMax}
                      disabled={isGenerating}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCheckIn(v);
                        if (checkOut && checkOut < v) setCheckOut(v);
                      }}
                      className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white shadow-inner shadow-black/20 placeholder:text-white/35 focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/15 disabled:opacity-50"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
                      Check-out Date
                    </span>
                    <input
                      type="date"
                      value={checkOut}
                      min={checkOutMin}
                      max={dateMax}
                      disabled={isGenerating}
                      onChange={(e) => setCheckOut(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white shadow-inner shadow-black/20 placeholder:text-white/35 focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/15 disabled:opacity-50"
                    />
                  </label>
                </>
              )}
              {(selectedType === "activity" || selectedType === "logistics") && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
                    Select Day
                  </span>
                  <input
                    type="date"
                    value={selectDay}
                    min={dateMin}
                    max={dateMax}
                    disabled={isGenerating}
                    onChange={(e) => setSelectDay(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white shadow-inner shadow-black/20 placeholder:text-white/35 focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/15 disabled:opacity-50"
                  />
                </label>
              )}
            </div>
          )}

          {currentStep === 3 && selectedType === "logistics" && (
            <div className="space-y-5">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
                  Mode of Transportation
                </span>
                <select
                  value={details.transportationMode}
                  disabled={isGenerating}
                  onChange={(e) =>
                    setDetails((d) => ({ ...d, transportationMode: e.target.value }))
                  }
                  className="w-full cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white shadow-inner shadow-black/20 focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="" className="bg-slate-900 text-white">
                    Select…
                  </option>
                  {TRANSPORT_MODES.map((m) => (
                    <option key={m} value={m} className="bg-slate-900 text-white">
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
                  From (Start Location)
                </span>
                <input
                  type="text"
                  value={details.fromLocation}
                  disabled={isGenerating}
                  onChange={(e) =>
                    setDetails((d) => ({ ...d, fromLocation: e.target.value }))
                  }
                  placeholder="City, station, airport…"
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 shadow-inner shadow-black/20 focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/15 disabled:opacity-50"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
                  To (End Location)
                </span>
                <input
                  type="text"
                  value={details.toLocation}
                  disabled={isGenerating}
                  onChange={(e) =>
                    setDetails((d) => ({ ...d, toLocation: e.target.value }))
                  }
                  placeholder="City, station, airport…"
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 shadow-inner shadow-black/20 focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/15 disabled:opacity-50"
                />
              </label>
            </div>
          )}

          {currentStep === 3 && selectedType === "accommodation" && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
                Desired Vibe / Preferences
              </span>
              <textarea
                value={details.accommodationVibe}
                disabled={isGenerating}
                onChange={(e) =>
                  setDetails((d) => ({ ...d, accommodationVibe: e.target.value }))
                }
                rows={4}
                placeholder="Boutique, quiet, pool, neighborhood…"
                className="w-full resize-y rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 shadow-inner shadow-black/20 focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/15 disabled:opacity-50"
              />
            </label>
          )}

          {currentStep === 3 && selectedType === "activity" && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
                What would you like to do?
              </span>
              <textarea
                value={details.activityDescription}
                disabled={isGenerating}
                onChange={(e) =>
                  setDetails((d) => ({ ...d, activityDescription: e.target.value }))
                }
                rows={4}
                placeholder="Scuba, museum day, dinner reservation…"
                className="w-full resize-y rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 shadow-inner shadow-black/20 focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/15 disabled:opacity-50"
              />
            </label>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-white/10 px-6 py-5 sm:flex-row sm:justify-between sm:px-8">
          <button
            type="button"
            onClick={goBack}
            disabled={isGenerating}
            className="cursor-pointer rounded-xl border border-white/15 px-5 py-3 text-sm font-medium text-white/85 transition-colors duration-200 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => void handlePrimary()}
            disabled={!canGoNext || isGenerating}
            className={`rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-200 ${
              canGoNext && !isGenerating
                ? "cursor-pointer bg-white text-slate-900 shadow-lg shadow-black/20 hover:bg-white/95"
                : "cursor-not-allowed bg-white/15 text-white/40"
            }`}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
