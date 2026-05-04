"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  GripVertical,
  Trash2,
  Pencil,
  X,
} from "lucide-react";
import { LiveHotelSearch, type HotelSearchResult } from "./LiveHotelSearch";
import type { ItineraryBlock, ItineraryRichLocation } from "@/lib/itinerary-types";
import {
  blockLocationLabel,
  emptyRichLocation,
  stringToRichLocation,
} from "@/lib/itinerary-types";

export type { ItineraryBlock, ItineraryRichLocation } from "@/lib/itinerary-types";

async function richLocationFromPlaceSelection(
  place: HotelSearchResult
): Promise<ItineraryRichLocation> {
  let lat = 0;
  let lng = 0;
  try {
    const res = await fetch(
      `/api/hotels/place-details?placeId=${encodeURIComponent(place.id)}`
    );
    if (res.ok) {
      const data = (await res.json()) as { lat?: unknown; lng?: unknown };
      if (
        typeof data.lat === "number" &&
        typeof data.lng === "number" &&
        Number.isFinite(data.lat) &&
        Number.isFinite(data.lng)
      ) {
        lat = data.lat;
        lng = data.lng;
      }
    }
  } catch {
    /* coordinates optional */
  }
  return { name: place.name, placeId: place.id, lat, lng };
}

type ItineraryItemCardProps = {
  block: ItineraryBlock;
  /** When true, only the front (read-only) content is shown; no drag/edit/discard. */
  readOnly?: boolean;
  /** Founder VIP flag from profile (feature gating in parent); card UI is universal dark. */
  isFounderVip?: boolean | null;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement> | null;
  dragInnerRef?: (el: HTMLElement | null) => void;
  dragDraggableProps?: object;
  snapshot?: { isDragging: boolean };
  updateBlock?: (id: string, patch: Partial<ItineraryBlock>) => void;
  deleteBlock?: (id: string) => void;
  toggleIncludeInItinerary?: (blockId: string) => void;
  typeBadgeClass: (type: ItineraryBlock["type"]) => string;
};

const inputFieldClass =
  "bg-slate-900/50 backdrop-blur border border-white/10 text-white placeholder:text-slate-400 focus:border-white/25 focus:ring-0 focus:outline-none [color-scheme:dark] [&_input]:!text-white";

const placesSearchInputClass =
  "mt-1 w-full rounded-lg py-2 pl-3 pr-10 text-sm bg-slate-900/50 backdrop-blur border border-white/10 focus:border-white/25 focus:ring-0 focus:outline-none !text-white placeholder:text-slate-400";
const placesSearchListClass =
  "absolute z-50 w-full mt-1 max-h-60 overflow-auto rounded-lg py-1 bg-slate-900/70 backdrop-blur-xl border border-white/10 shadow-2xl";
const placesSearchItemClass =
  "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm text-white transition hover:bg-white/10";

const LIVE_WHOLESALE_API_PHRASE: Record<ItineraryBlock["type"], string> = {
  accommodation: "global hotel APIs",
  activity: "global activity & guide APIs",
  logistics: "global transportation APIs",
};

export function ItineraryItemCard({
  block,
  readOnly = false,
  isFounderVip = false,
  dragHandleProps = null,
  dragInnerRef,
  dragDraggableProps = {},
  snapshot = { isDragging: false },
  updateBlock,
  deleteBlock,
  toggleIncludeInItinerary,
  typeBadgeClass,
}: ItineraryItemCardProps) {
  const placesItemSelectedClass = "bg-white/15 text-white";
  const placesEmptyClass = "px-3 py-2 text-sm text-slate-400";
  const placesHintClass =
    "px-3 py-2 text-sm text-slate-500 select-none pointer-events-none border-t border-white/10 mt-1 pt-2";
  const placesLoaderClass = "text-slate-400";
  const placesItemLocationClass = "text-slate-400";
  const placesItemBadgeClass =
    "shrink-0 rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-medium text-amber-200 ring-1 ring-amber-400/30";

  const applyRichLocation = useCallback(
    async (
      place: HotelSearchResult,
      field: "location" | "startLocation" | "endLocation"
    ) => {
      const rich = await richLocationFromPlaceSelection(place);
      if (field === "location") {
        updateBlock?.(block.id, { location: rich });
      } else if (field === "startLocation") {
        updateBlock?.(block.id, { startLocation: rich });
      } else {
        updateBlock?.(block.id, { endLocation: rich });
      }
    },
    [block.id, updateBlock]
  );

  const [isFlipped, setIsFlipped] = useState(false);
  const [isCheckingPrice, setIsCheckingPrice] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [childAges, setChildAges] = useState<number[]>([]);

  const ENABLE_LIVE_BOOKING = false; // TODO: Flip to true when Hotelbeds live keys are approved

  const handleSave = () => {
    // Data is already in parent state via updateBlock on each field change; flip back to front.
    // Front label (e.g. type) reads from block props so it updates immediately.
    setIsFlipped(false);
  };

  /** Super Parser: vibe tags from block.recommendations — accepts bullets (• - *), colons, hyphens, en-dashes */
  /** Accommodation: hotel search reflects rich `location`; legacy rows may have title+googlePlaceId without `location`. */
  const accommodationHotelFieldValue = useMemo(() => {
    if (block.type !== "accommodation") return "";
    if (block.googlePlaceId) {
      const t = (block.title ?? "").trim();
      if (t && t !== "Where to stay" && t !== "Where to Stay") return t;
    }
    const fromLoc = block.location?.name?.trim() ?? "";
    if (fromLoc) return fromLoc;
    const t = (block.title ?? "").trim();
    if (t === "Where to stay" || t === "Where to Stay") return "";
    return t;
  }, [block.type, block.googlePlaceId, block.location?.name, block.title]);

  const vibeTags = useMemo(() => {
    if (block.type !== "accommodation") return [];
    const raw = (block.recommendations ?? "").trim();
    if (!raw) return [];
    return raw
      .split(/\r?\n/)
      .map((line) => {
        let s = line.trim().replace(/^[\s•\-*·]\s*/, "");
        if (!s) return null;
        // Prefer separators with surrounding spaces: " - ", " – ", " : "
        const separators = [/\s+[\-\–]\s+/, /\s+:\s+/];
        for (const sep of separators) {
          const match = s.match(sep);
          if (match) {
            const idx = s.indexOf(match[0]);
            const hotel = s.slice(0, idx).trim();
            const vibe = s.slice(idx + match[0].length).trim();
            if (hotel && vibe) return { hotel, vibe };
          }
        }
        // Fallback: single hyphen/colon with optional spaces
        const single = s.match(/\s*[\-\–:]\s*/);
        if (single) {
          const idx = s.indexOf(single[0]);
          const hotel = s.slice(0, idx).trim();
          const vibe = s.slice(idx + single[0].length).trim();
          if (hotel && vibe) return { hotel, vibe };
        }
        return null;
      })
      .filter((tag): tag is { hotel: string; vibe: string } => tag != null);
  }, [block.type, block.recommendations]);

  /** Format cancellation note for pre-booking display (Area 3). */
  const cancellationNote =
    block.type === "accommodation" && block.bookingStatus !== "booked"
      ? (() => {
          const policies = block.cancellationPolicies;
          if (!policies || policies.length === 0) return "Non-Refundable";
          const first = policies[0];
          const from =
            first && typeof first === "object" && "from" in first && typeof (first as { from?: string }).from === "string"
              ? (first as { from: string }).from
              : undefined;
          if (from) {
            try {
              const d = new Date(from);
              if (!Number.isNaN(d.getTime())) return `Penalty applies after ${d.toLocaleDateString()}`;
            } catch {
              // fall through
            }
          }
          return "Check cancellation terms";
        })()
      : null;

  if (readOnly) {
    return (
      <div className="itinerary-card rounded-xl border border-stone-200 bg-stone-50/80 p-4 shadow-md shadow-stone-200/50 ring-1 ring-stone-200/60 transition-shadow duration-200">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-stone-600">
            {block.endDate ? `${block.date} – ${block.endDate}` : block.date}
          </span>
          <span className="min-w-0 truncate text-sm text-stone-600">
            {blockLocationLabel(block)}
          </span>
          <span
            className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${typeBadgeClass(block.type)}`}
          >
            {block.type}
          </span>
        </div>
        <h3 className="mt-2 line-clamp-2 min-w-0 text-base font-semibold tracking-tight text-stone-900">
          {block.isBooked ? (block.bookedName ?? block.title) : block.title || "Untitled"}
        </h3>
        {(block.summary ?? block.description) ? (
          <p className="mt-1 line-clamp-2 text-sm text-ellipsis overflow-hidden text-stone-700">
            {block.summary ?? block.description}
          </p>
        ) : null}
        {typeof block.price === "number" && block.price > 0 && (
          <span className="mt-2 inline-flex w-fit items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
            ${block.price ? Number(block.price).toFixed(2) : "0.00"}
          </span>
        )}
      </div>
    );
  }

  return (
    <li
      ref={dragInnerRef}
      {...dragDraggableProps}
      data-founder-vip={isFounderVip === true ? "true" : "false"}
      className={`itinerary-card rounded-2xl border border-white/10 bg-slate-900/50 shadow-lg shadow-black/30 ring-1 ring-white/5 backdrop-blur-md transition-all duration-200 ${
        snapshot.isDragging ? "shadow-xl ring-white/15" : "hover:shadow-xl hover:ring-white/10"
      }`}
    >
      <div className="flex gap-3 p-4 sm:p-5">
        <div
          {...(dragHandleProps ?? {})}
          className="flex shrink-0 cursor-grab touch-none items-start pt-1 text-slate-500 hover:text-slate-300 active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <div className="group min-w-0 flex-1 w-full [perspective:1000px]">
          <div
            className={`relative w-full transition-transform duration-500 [transform-style:preserve-3d] ${isFlipped ? "[transform:rotateY(180deg)]" : ""}`}
          >
            {/* Front — read-only; relative when visible so wrapper shrink-wraps; absolute when flipped */}
            <div
              className={`flex flex-col w-full [backface-visibility:hidden] ${isFlipped ? "absolute inset-0" : "relative"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        block.type === "accommodation" ? "text-slate-400" : "text-white"
                      }`}
                    >
                      {block.endDate ? `${block.date} – ${block.endDate}` : block.date}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span
                      className={`min-w-0 truncate text-sm ${
                        block.type !== "accommodation" ? "text-slate-300" : "text-slate-400"
                      }`}
                    >
                      {blockLocationLabel(block)}
                    </span>
                  </div>
                  <span
                    className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${typeBadgeClass(block.type)}`}
                  >
                    {block.type}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsFlipped(true)}
                    className="rounded-full border border-sky-500/25 bg-sky-500/15 p-2 text-sky-300 transition-colors hover:bg-sky-500/25"
                    aria-label="Edit / View details"
                  >
                    <Pencil className="h-5 w-5" strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleIncludeInItinerary?.(block.id);
                    }}
                    className={`rounded-xl p-2 transition ${
                      block.isIncluded === false
                        ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                        : "text-slate-500 hover:bg-white/10 hover:text-slate-300"
                    }`}
                    aria-label={
                      block.isIncluded === false
                        ? "Discarded — click to keep"
                        : "Discard from itinerary"
                    }
                    aria-pressed={block.isIncluded === false}
                  >
                    <Trash2
                      className="h-5 w-5"
                      strokeWidth={block.isIncluded === false ? 2.5 : 1.5}
                      fill={block.isIncluded === false ? "currentColor" : "none"}
                    />
                  </button>
                </div>
              </div>
              <h3 className="mt-2 line-clamp-2 min-w-0 text-lg font-semibold tracking-tight text-white">
                {block.isBooked ? (block.bookedName ?? block.title) : block.title || "Untitled"}
              </h3>
              {(block.summary ?? block.description) ? (
                <p className="mt-1 line-clamp-2 text-sm text-ellipsis overflow-hidden text-slate-400">
                  {block.summary ?? block.description}
                </p>
              ) : null}
              {typeof block.price === "number" && block.price > 0 && (
                <span
                  className={`mt-2 inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ${
                    block.type === "accommodation"
                      ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
                      : "bg-white/10 text-white ring-white/15"
                  }`}
                >
                  ${block.price ? Number(block.price).toFixed(2) : "0.00"}
                </span>
              )}
            </div>

            {/* Back — edit form; no inner bucket, form sits in main card */}
            <div
              className={`itinerary-card flex flex-col w-full overflow-y-auto rounded-2xl [backface-visibility:hidden] [transform:rotateY(180deg)] ${isFlipped ? "relative max-h-[70vh] sm:max-h-[500px]" : "absolute inset-0 top-0 left-0"}`}
            >
              <div className="space-y-3 p-1">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  {block.type === "accommodation" ? (
                    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-nowrap sm:items-end sm:gap-4">
                      <div className="flex shrink-0 flex-col gap-1">
                        <label className="text-xs font-medium uppercase tracking-wider text-gray-400">
                          Check-in
                        </label>
                        <input
                          type="date"
                          value={block.date}
                          onChange={(e) =>
                            updateBlock?.(block.id, {
                              date: e.target.value,
                              price: undefined,
                              rateKey: undefined,
                              rateType: undefined,
                              bookingStatus: undefined,
                            })
                          }
                          className={`w-full max-w-[11rem] rounded-lg px-2 py-2 text-sm ${inputFieldClass}`}
                        />
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <label className="text-xs font-medium uppercase tracking-wider text-gray-400">
                          Check-out
                        </label>
                        <input
                          type="date"
                          value={block.endDate ?? ""}
                          onChange={(e) =>
                            updateBlock?.(block.id, {
                              endDate: e.target.value || undefined,
                              price: undefined,
                              rateKey: undefined,
                              rateType: undefined,
                              bookingStatus: undefined,
                            })
                          }
                          min={block.date || undefined}
                          className={`w-full max-w-[11rem] rounded-lg px-2 py-2 text-sm ${inputFieldClass}`}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <label className="text-xs font-medium uppercase tracking-wider text-gray-400">
                        Date
                      </label>
                      <input
                        type="date"
                        value={block.date}
                        onChange={(e) => updateBlock?.(block.id, { date: e.target.value })}
                        className={`w-full max-w-[11rem] rounded-lg px-2 py-2 text-sm ${inputFieldClass}`}
                      />
                    </div>
                  )}
                  {block.type === "activity" && (
                    <div className="min-w-0 flex-1 sm:min-w-[12rem]">
                      <label className="text-xs font-medium uppercase tracking-wider text-gray-400">
                        Location
                      </label>
                      <LiveHotelSearch
                        searchApiBasePath="/api/places/autocomplete"
                        value={(block.location ?? emptyRichLocation()).name}
                        onSelect={(place) => {
                          void applyRichLocation(place, "location");
                        }}
                        placeholder="Search for a place or area…"
                        inputClassName={placesSearchInputClass}
                        listClassName={placesSearchListClass}
                        listItemClassName={placesSearchItemClass}
                        listItemSelectedClassName={placesItemSelectedClass}
                        listEmptyClassName={placesEmptyClass}
                        listHintClassName={placesHintClass}
                        loaderClassName={placesLoaderClass}
                        listItemLocationClassName={placesItemLocationClass}
                        listItemBadgeClassName={placesItemBadgeClass}
                      />
                    </div>
                  )}
                </div>
                {block.type === "logistics" && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <label className="text-xs font-medium uppercase tracking-wider text-gray-400">
                        Start Location
                      </label>
                      <LiveHotelSearch
                        searchApiBasePath="/api/places/autocomplete"
                        value={(block.startLocation ?? emptyRichLocation()).name}
                        onSelect={(place) => {
                          void applyRichLocation(place, "startLocation");
                        }}
                        placeholder="Start point…"
                        inputClassName={placesSearchInputClass}
                        listClassName={placesSearchListClass}
                        listItemClassName={placesSearchItemClass}
                        listItemSelectedClassName={placesItemSelectedClass}
                        listEmptyClassName={placesEmptyClass}
                        listHintClassName={placesHintClass}
                        loaderClassName={placesLoaderClass}
                        listItemLocationClassName={placesItemLocationClass}
                        listItemBadgeClassName={placesItemBadgeClass}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <label className="text-xs font-medium uppercase tracking-wider text-gray-400">
                        End Location
                      </label>
                      <LiveHotelSearch
                        searchApiBasePath="/api/places/autocomplete"
                        value={(block.endLocation ?? emptyRichLocation()).name}
                        onSelect={(place) => {
                          void applyRichLocation(place, "endLocation");
                        }}
                        placeholder="End point…"
                        inputClassName={placesSearchInputClass}
                        listClassName={placesSearchListClass}
                        listItemClassName={placesSearchItemClass}
                        listItemSelectedClassName={placesItemSelectedClass}
                        listEmptyClassName={placesEmptyClass}
                        listHintClassName={placesHintClass}
                        loaderClassName={placesLoaderClass}
                        listItemLocationClassName={placesItemLocationClass}
                        listItemBadgeClassName={placesItemBadgeClass}
                      />
                    </div>
                  </div>
                )}
                {block.type !== "accommodation" && (
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wider text-gray-400">
                      Description
                    </label>
                    <textarea
                      value={block.description}
                      onChange={(e) =>
                        updateBlock?.(block.id, { description: e.target.value })
                      }
                      rows={3}
                      className={`mt-1 w-full resize-y rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${inputFieldClass}`}
                      placeholder="Description"
                    />
                  </div>
                )}
                {block.type === "accommodation" && (
                  <>
                    <div className="mb-4">
                      <p className="text-sm text-gray-400 mb-3">
                        Click a vibe to see our hotel recs or type in the hotel you would like to stay at.
                      </p>

                      {vibeTags && vibeTags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {vibeTags.map((tag, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() =>
                                updateBlock?.(block.id, {
                                  title: tag.hotel,
                                  description: `Enjoy a stay at ${tag.hotel}, perfectly selected for its ${tag.vibe}.`,
                                  location: stringToRichLocation(tag.hotel),
                                  googlePlaceId: undefined,
                                  lat: undefined,
                                  lng: undefined,
                                  price: undefined,
                                  rateKey: undefined,
                                  rateType: undefined,
                                  bookingStatus: undefined,
                                })
                              }
                              className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-full text-sm font-medium transition-colors cursor-pointer"
                            >
                              {tag.vibe}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wider text-gray-400">
                        Search for Official Hotel:
                      </label>
                    <LiveHotelSearch
                      inputClassName={placesSearchInputClass}
                      listClassName={placesSearchListClass}
                      listItemClassName={placesSearchItemClass}
                      listItemSelectedClassName={placesItemSelectedClass}
                      listEmptyClassName={placesEmptyClass}
                      listHintClassName={placesHintClass}
                      loaderClassName={placesLoaderClass}
                      listItemLocationClassName={placesItemLocationClass}
                      listItemBadgeClassName={placesItemBadgeClass}
                      value={accommodationHotelFieldValue}
                      onSelect={async (hotel: HotelSearchResult) => {
                        const rich = await richLocationFromPlaceSelection(hotel);
                        updateBlock?.(block.id, {
                          title: hotel.name,
                          googlePlaceId: hotel.id,
                          location: rich,
                          lat: rich.lat,
                          lng: rich.lng,
                          priceNote: undefined,
                          price: undefined,
                          rateKey: undefined,
                          rateType: undefined,
                          bookingStatus: undefined,
                        });
                      }}
                      placeholder="Search our recommendations here..."
                    />
                  </div>
                  </>
                )}
                <div>
                  {block.type === "accommodation" && block.bookingStatus === "booked" ? (
                    /* Area 4: Confirmed Voucher UI (post-booking) */
                    <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 backdrop-blur-sm p-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                        Confirmed Voucher
                      </p>
                      <dl className="grid gap-1.5 text-sm">
                        <div>
                          <dt className="text-gray-400">Hotel</dt>
                          <dd className="font-medium text-white">{block.title || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-400">Lead Guest</dt>
                          <dd className="font-medium text-white">Test User</dd>
                        </div>
                        <div>
                          <dt className="text-gray-400">Check-in</dt>
                          <dd className="font-medium text-white">{block.date || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-400">Check-out</dt>
                          <dd className="font-medium text-white">{block.endDate ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-400">Conf Code</dt>
                          <dd className="font-mono font-medium text-white">{block.confirmationCode ?? "—"}</dd>
                        </div>
                      </dl>
                      <p className="text-[11px] text-gray-400 leading-relaxed pt-1 border-t border-emerald-400/20">
                        Payable through Hotelbeds, acting as agent for the service operating company, details of which can be provided upon request. VAT: {block.supplierVat ?? "ESB28906881"} Reference: {block.confirmationCode ?? ""}
                      </p>
                      {block.confirmationCode && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (isCancelling) return;
                            setIsCancelling(true);
                            try {
                              const res = await fetch(
                                `/api/hotels/cancel?reference=${encodeURIComponent(block.confirmationCode!)}`,
                                { method: "DELETE" }
                              );
                              const data = await res.json().catch(() => ({}));
                              if (res.ok) {
                                updateBlock?.(block.id, {
                                  confirmationCode: undefined,
                                  bookingStatus: "cancelled",
                                  rateKey: undefined,
                                  rateType: undefined,
                                  supplierName: undefined,
                                  supplierVat: undefined,
                                });
                              } else {
                                const errMsg =
                                  (data && typeof data === "object" && (data.error || data.message)) ||
                                  "Cancel failed";
                                throw new Error(typeof errMsg === "string" ? errMsg : "Cancel failed");
                              }
                            } catch (err) {
                              alert(err instanceof Error ? err.message : String(err));
                            } finally {
                              setIsCancelling(false);
                            }
                          }}
                          disabled={isCancelling}
                          className="text-sm font-medium text-red-300 hover:text-red-200 hover:underline disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          {isCancelling ? "Cancelling…" : "Cancel booking"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="text-xs font-medium uppercase tracking-wider text-gray-400">
                          Estimated Price ($)
                        </label>
                        <div className="mt-1 flex flex-row flex-wrap items-center gap-4">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={block.price ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const num = raw === "" ? undefined : parseFloat(raw);
                              updateBlock?.(block.id, {
                                price: num !== undefined && Number.isFinite(num) ? num : undefined,
                              });
                            }}
                            placeholder="e.g. 450"
                            className={`w-full max-w-[8rem] shrink-0 rounded-lg px-3 py-2 text-sm ${inputFieldClass}`}
                          />
                          <p className="min-w-0 flex-1 text-sm italic leading-snug text-gray-400">
                            Live Wholesale Pricing — We are currently connecting to{" "}
                            {LIVE_WHOLESALE_API_PHRASE[block.type]} to bring you live, bookable rates.
                          </p>
                        </div>
                      </div>
                      {block.type === "accommodation" && ENABLE_LIVE_BOOKING && (
                        <div className="flex flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-gray-400">Adults</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={9}
                                    value={adults}
                                    onChange={(e) =>
                                      setAdults(Math.min(9, Math.max(1, parseInt(e.target.value, 10) || 1)))
                                    }
                                    className={`w-14 rounded px-2 py-1 text-sm ${inputFieldClass}`}
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-gray-400">Children</label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={9}
                                    value={children}
                                    onChange={(e) => {
                                      const n = Math.min(9, Math.max(0, parseInt(e.target.value, 10) || 0));
                                      setChildren(n);
                                      setChildAges((prev) =>
                                        n > prev.length
                                          ? [...prev, ...Array(n - prev.length).fill(8)]
                                          : prev.slice(0, n)
                                      );
                                    }}
                                    className={`w-14 rounded px-2 py-1 text-sm ${inputFieldClass}`}
                                  />
                                </div>
                                {children > 0 && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    {Array.from({ length: children }, (_, i) => (
                                      <div key={i} className="flex items-center gap-1">
                                        <label className="text-[11px] text-gray-400">Child {i + 1} age</label>
                                        <input
                                          type="number"
                                          min={0}
                                          max={17}
                                          value={childAges[i] ?? ""}
                                          onChange={(e) => {
                                            const val = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
                                            setChildAges((prev) => {
                                              const next = [...prev];
                                              next[i] = Math.min(17, Math.max(0, val || 0));
                                              return next;
                                            });
                                          }}
                                          className={`w-12 rounded px-1.5 py-0.5 text-sm ${inputFieldClass}`}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {cancellationNote && (
                                <p className="text-xs text-amber-300/90">
                                  {cancellationNote}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!block.googlePlaceId) return;
                                    if (!block.lat || !block.lng) {
                                      alert(
                                        "Please select a valid hotel from the dropdown first to get coordinates"
                                      );
                                      return;
                                    }
                                    if (!block.endDate) {
                                      alert("Please select a Check-Out date first");
                                      return;
                                    }
                                    if (block.rateType === "RECHECK") {
                                      setIsCheckingPrice(true);
                                      try {
                                        const res = await fetch("/api/hotels/checkrate", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({
                                            rateKey: block.rateKey,
                                            ...(typeof block.price === "number"
                                              ? { previousPrice: block.price }
                                              : {}),
                                          }),
                                        });
                                        const data = await res.json().catch(() => ({}));
                                        if (res.ok && data.rateType === "BOOKABLE") {
                                          const policies = data.cancellationPolicies;
                                          const cancellationPolicy =
                                            Array.isArray(policies) && policies.length > 0
                                              ? policies[0]
                                              : policies ?? undefined;
                                          updateBlock?.(block.id, {
                                            price: data.price,
                                            rateKey: data.rateKey,
                                            rateType: "BOOKABLE",
                                            cancellationPolicy:
                                              typeof cancellationPolicy === "string" ||
                                              (cancellationPolicy &&
                                                typeof cancellationPolicy === "object")
                                                ? cancellationPolicy
                                                : undefined,
                                            cancellationPolicies: Array.isArray(policies) ? policies : undefined,
                                          });
                                        } else if (res.ok && data.message === "Not Implemented") {
                                          alert("CheckRate API not yet implemented. Proceed to Book when ready.");
                                        } else if (!res.ok) {
                                          const errMsg =
                                            (data && typeof data === "object" && (data.error || data.message)) ||
                                            "Check rate failed";
                                          throw new Error(
                                            typeof errMsg === "string" ? errMsg : "Check rate failed"
                                          );
                                        }
                                      } catch (err) {
                                        alert(err instanceof Error ? err.message : String(err));
                                      } finally {
                                        setIsCheckingPrice(false);
                                      }
                                      return;
                                    }
                                    if (block.rateType === "BOOKABLE" && block.rateKey && block.price != null) {
                                      setIsCheckingPrice(true);
                                      try {
                                        const res = await fetch("/api/hotels/book", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({
                                            rateKey: block.rateKey,
                                            adults,
                                            children,
                                            childAges,
                                          }),
                                        });
                                        const data = await res.json().catch(() => ({}));
                                        if (res.ok && data.confirmationCode != null) {
                                          updateBlock?.(block.id, {
                                            bookingStatus: "booked",
                                            confirmationCode: data.confirmationCode,
                                            supplierName: data.supplierName,
                                            supplierVat: data.supplierVat,
                                          });
                                        } else if (!res.ok) {
                                          const errMsg =
                                            (data && typeof data === "object" && (data.error || data.message)) ||
                                            "Booking failed";
                                          throw new Error(typeof errMsg === "string" ? errMsg : "Booking failed");
                                        }
                                      } catch (err) {
                                        alert(err instanceof Error ? err.message : String(err));
                                      } finally {
                                        setIsCheckingPrice(false);
                                      }
                                      return;
                                    }
                                    setIsCheckingPrice(true);
                                    try {
                                      const res = await fetch("/api/hotels/price", {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                          lat: block.lat ?? 0,
                                          lng: block.lng ?? 0,
                                          hotelName: block.title,
                                          checkIn: block.date,
                                          checkOut: block.endDate,
                                          adults,
                                          children,
                                          childAges,
                                        }),
                                      });
                                      if (res.status === 404) {
                                        alert(
                                          "No test inventory found in this specific area. Try searching a major tourist hub like London, Orlando, or Las Vegas to test the pricing engine."
                                        );
                                        return;
                                      }
                                      if (!res.ok) {
                                        const errData = await res.json().catch(() => ({}));
                                        throw new Error(errData.error || errData.message || "Price fetch failed");
                                      }
                                      const data = await res.json();
                                      console.log("Received from API:", data);
                                      const policies = data.cancellationPolicies;
                                      const cancellationPolicy =
                                        Array.isArray(policies) && policies.length > 0
                                          ? policies[0]
                                          : undefined;
                                      updateBlock?.(block.id, {
                                        price: data.price,
                                        rateKey: data.rateKey,
                                        rateType: data.rateType,
                                        cancellationPolicy:
                                          typeof cancellationPolicy === "string" ||
                                          (cancellationPolicy && typeof cancellationPolicy === "object")
                                            ? cancellationPolicy
                                            : undefined,
                                        cancellationPolicies: Array.isArray(policies) ? policies : undefined,
                                        bookingStatus: "searched",
                                        ...(data.isFallback === true
                                          ? {
                                              priceNote:
                                                "Test environment price (nearest hotel in radius)",
                                            }
                                          : { priceNote: undefined }),
                                      });
                                    } catch (err) {
                                      alert(err instanceof Error ? err.message : String(err));
                                    } finally {
                                      setIsCheckingPrice(false);
                                    }
                                  }}
                                  disabled={
                                    !block.googlePlaceId ||
                                    !block.lat ||
                                    !block.lng ||
                                    isCheckingPrice ||
                                    block.bookingStatus === "booked"
                                  }
                                  className={`w-fit px-3 py-1.5 text-sm font-medium rounded-md transition disabled:opacity-70 disabled:cursor-not-allowed ${
                                    block.bookingStatus === "booked"
                                      ? "bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 cursor-default"
                                      : "bg-white/10 border border-white/10 text-white hover:bg-white/20"
                                  }`}
                                >
                                  {isCheckingPrice
                                    ? "Checking…"
                                    : block.bookingStatus === "booked"
                                      ? `Conf: ${block.confirmationCode ?? "—"}`
                                      : block.rateType === "BOOKABLE" && block.rateKey && block.price != null
                                        ? "Book Now"
                                        : block.rateType === "RECHECK"
                                          ? "Check Final Rate"
                                          : block.price != null
                                            ? "Update Price"
                                            : "Get Live Price"}
                                </button>
                              </div>
                              <p className="text-xs text-gray-400">
                                {block.googlePlaceId
                                  ? "✅ Official Hotel Linked"
                                  : "⚠️ Search and select a hotel above to check live prices"}
                              </p>
                              {block.priceNote && (
                                <p className="text-xs text-amber-300/90">
                                  {block.priceNote}
                                </p>
                              )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => toggleIncludeInItinerary?.(block.id)}
                    className={`rounded-xl p-2 transition ${
                      block.isIncluded === false
                        ? "bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-400/20"
                        : "text-gray-400 hover:bg-white/10 hover:text-gray-300 border border-transparent"
                    }`}
                    aria-label={
                      block.isIncluded === false
                        ? "Discarded — click to keep"
                        : "Discard from itinerary"
                    }
                    aria-pressed={block.isIncluded === false}
                  >
                    <Trash2
                      className="h-5 w-5"
                      strokeWidth={block.isIncluded === false ? 2.5 : 1.5}
                      fill={block.isIncluded === false ? "currentColor" : "none"}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/20 border border-white/10 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-white/30"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteBlock?.(block.id)}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-500/20"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFlipped(false)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 transition hover:bg-white/10"
                    aria-label="Cancel without saving"
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
