"use client";

import React, { useState, useMemo } from "react";
import {
  GripVertical,
  Trash2,
  Pencil,
  X,
} from "lucide-react";
import { LiveHotelSearch, type HotelSearchResult } from "./LiveHotelSearch";

type BookingOption = {
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
  location: string;
  type: "accommodation" | "activity" | "logistics";
  title: string;
  /** Teaser for card front (accommodation: 2 sentences; others: 3–5 word TLDR). Fallback to description for legacy. */
  summary?: string;
  description: string;
  bookingOptions?: BookingOption[];
  isBooked?: boolean;
  bookedName?: string;
  confirmationNumber?: string;
  cost?: string;
  actualBookingUrl?: string;
  isIncluded?: boolean;
  /** Estimated price in dollars (saved to Supabase JSON) */
  price?: number;
  /** Google Place ID when user selects a hotel (for Accommodation blocks) */
  googlePlaceId?: string;
  /** Latitude when user selects a hotel (required for live price check) */
  lat?: number;
  /** Longitude when user selects a hotel (required for live price check) */
  lng?: number;
  /** Note when price came from test/fallback (e.g. nearest hotel in radius) */
  priceNote?: string;
  /** Hotelbeds temporary rate identifier (Availability → CheckRate → Book flow) */
  rateKey?: string;
  /** Hotelbeds rate type: 'BOOKABLE' (direct book) or 'RECHECK' (must call CheckRate first) */
  rateType?: string;
  /** Cancellation policy from the rate (string or structured object) */
  cancellationPolicy?: string | Record<string, unknown>;
  /** Cancellation policies array from rate (for pre-booking display); items may have from, amount, etc. */
  cancellationPolicies?: Array<{ from?: string; amount?: number; [key: string]: unknown }>;
  /** APItude flow state: 'searched' | 'quoted' | 'booked' */
  bookingStatus?: string;
  /** Final booking reference from Hotelbeds after booking */
  confirmationCode?: string;
  /** Supplier name from booking (for voucher legal text) */
  supplierName?: string;
  /** Supplier VAT from booking (for voucher legal text) */
  supplierVat?: string;
  /** Multi-line recommendations for accommodation: "Hotel Name - Vibe" per line */
  recommendations?: string;
};

type ItineraryItemCardProps = {
  block: ItineraryBlock;
  /** When true, only the front (read-only) content is shown; no drag/edit/discard. */
  readOnly?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement> | null;
  dragInnerRef?: (el: HTMLElement | null) => void;
  dragDraggableProps?: object;
  snapshot?: { isDragging: boolean };
  updateBlock?: (id: string, patch: Partial<ItineraryBlock>) => void;
  deleteBlock?: (id: string) => void;
  toggleIncludeInItinerary?: (blockId: string) => void;
  typeBadgeClass: (type: ItineraryBlock["type"]) => string;
};

export function ItineraryItemCard({
  block,
  readOnly = false,
  dragHandleProps = null,
  dragInnerRef,
  dragDraggableProps = {},
  snapshot = { isDragging: false },
  updateBlock,
  deleteBlock,
  toggleIncludeInItinerary,
  typeBadgeClass,
}: ItineraryItemCardProps) {
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
      <div className="rounded-xl border border-stone-200/80 bg-white p-4 shadow-sm ring-1 ring-black/[0.03]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-stone-500">
            {block.endDate ? `${block.date} – ${block.endDate}` : block.date}
          </span>
          <span className="min-w-0 truncate text-sm text-stone-600">{block.location}</span>
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
          <p className="mt-1 line-clamp-2 text-sm text-ellipsis overflow-hidden text-stone-600">
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
      className={`rounded-2xl border border-stone-200/80 bg-white shadow-sm ring-1 ring-black/[0.03] transition-shadow ${
        snapshot.isDragging ? "shadow-lg ring-stone-200" : "hover:shadow-md"
      }`}
    >
      <div className="flex gap-3 p-4 sm:p-5">
        <div
          {...(dragHandleProps ?? {})}
          className="flex shrink-0 cursor-grab touch-none items-start pt-1 text-stone-300 hover:text-stone-500 active:cursor-grabbing"
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
                    <span className="text-sm text-stone-500">
                      {block.endDate ? `${block.date} – ${block.endDate}` : block.date}
                    </span>
                    <span className="text-stone-300">·</span>
                    <span className="min-w-0 truncate text-sm text-stone-600">{block.location}</span>
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
                    className="rounded-full p-2 text-blue-600 bg-blue-50 transition-colors hover:bg-blue-100"
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
                        ? "bg-red-50 text-red-600 hover:bg-red-100"
                        : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
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
              <h3 className="mt-2 line-clamp-2 min-w-0 text-lg font-semibold tracking-tight text-stone-900">
                {block.isBooked ? (block.bookedName ?? block.title) : block.title || "Untitled"}
              </h3>
              {(block.summary ?? block.description) ? (
                <p className="mt-1 line-clamp-2 text-sm text-ellipsis overflow-hidden text-stone-600">
                  {block.summary ?? block.description}
                </p>
              ) : null}
              {typeof block.price === "number" && block.price > 0 && (
                <span className="mt-2 inline-flex w-fit items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
                  ${block.price ? Number(block.price).toFixed(2) : "0.00"}
                </span>
              )}
            </div>

            {/* Back — edit form; permanently [transform:rotateY(180deg)] so text faces forward when parent flips */}
            <div
              className={`flex flex-col w-full overflow-y-auto rounded-2xl bg-white [backface-visibility:hidden] [transform:rotateY(180deg)] ${isFlipped ? "relative max-h-[70vh] sm:max-h-[500px]" : "absolute inset-0 top-0 left-0"}`}
            >
              <div className="space-y-3 p-1">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  {block.type === "accommodation" ? (
                    <>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
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
                          className="w-full max-w-[11rem] rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm text-stone-800 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
                        />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
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
                          className="w-full max-w-[11rem] rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm text-stone-800 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
                        Date
                      </label>
                      <input
                        type="date"
                        value={block.date}
                        onChange={(e) => updateBlock?.(block.id, { date: e.target.value })}
                        className="w-full max-w-[11rem] rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm text-stone-800 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 sm:min-w-[12rem]">
                    <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
                      Location
                    </label>
                    <input
                      type="text"
                      value={block.location}
                      onChange={(e) => updateBlock?.(block.id, { location: e.target.value })}
                      placeholder="City or area"
                      className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
                    Type
                  </label>
                  <select
                    value={block.type}
                    onChange={(e) =>
                      updateBlock?.(block.id, {
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
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
                    Title
                  </label>
                  {block.type === "accommodation" ? (
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={
                        block.isBooked
                          ? (block.bookedName ?? block.title)
                          : block.title === "Where to stay" || block.title === "Where to Stay"
                            ? ""
                            : block.title ?? ""
                      }
                      className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-stone-600 cursor-not-allowed placeholder:text-stone-400"
                      placeholder="Where to Stay"
                    />
                  ) : (
                    <input
                      type="text"
                      value={
                        block.isBooked
                          ? (block.bookedName ?? block.title)
                          : block.title
                      }
                      onChange={(e) =>
                        block.isBooked
                          ? updateBlock?.(block.id, {
                              bookedName: e.target.value,
                            })
                          : updateBlock?.(block.id, { title: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
                      placeholder="Title"
                    />
                  )}
                </div>
                {block.type !== "accommodation" && (
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
                      Description
                    </label>
                    <textarea
                      value={block.description}
                      onChange={(e) =>
                        updateBlock?.(block.id, { description: e.target.value })
                      }
                      rows={3}
                      className="mt-1 w-full resize-y rounded-lg border border-stone-200 bg-stone-50/50 px-3 py-2 text-sm leading-relaxed text-stone-600 placeholder:text-stone-400 focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-200 whitespace-pre-wrap"
                      placeholder="Description"
                    />
                  </div>
                )}
                {block.type === "accommodation" && (
                  <>
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 mb-3">
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
                                  ...block,
                                  title: tag.hotel,
                                  description: `Enjoy a stay at ${tag.hotel}, perfectly selected for its ${tag.vibe}.`,
                                })
                              }
                              className="px-4 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-full text-sm font-medium transition-colors cursor-pointer"
                            >
                              {tag.vibe}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
                        Search for Official Hotel:
                      </label>
                    <LiveHotelSearch
                      value={
                        block.title === "Where to stay" || block.title === "Where to Stay"
                          ? ""
                          : block.title ?? ""
                      }
                      onSelect={async (hotel: HotelSearchResult) => {
                        updateBlock?.(block.id, {
                          title: hotel.name,
                          googlePlaceId: hotel.id,
                          priceNote: undefined,
                          price: undefined,
                          rateKey: undefined,
                          rateType: undefined,
                          bookingStatus: undefined,
                        });
                        try {
                          const res = await fetch(
                            `/api/hotels/place-details?placeId=${encodeURIComponent(hotel.id)}`
                          );
                          if (res.ok) {
                            const { lat, lng } = await res.json();
                            if (
                              typeof lat === "number" &&
                              typeof lng === "number" &&
                              Number.isFinite(lat) &&
                              Number.isFinite(lng)
                            ) {
                              updateBlock?.(block.id, { lat, lng });
                            }
                          }
                        } catch {
                          // Coordinates optional; user can still edit manually or retry
                        }
                      }}
                      placeholder="Search our recommendations here..."
                    />
                  </div>
                  </>
                )}
                <div>
                  {block.type === "accommodation" && block.bookingStatus === "booked" ? (
                    /* Area 4: Confirmed Voucher UI (post-booking) */
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                        Confirmed Voucher
                      </p>
                      <dl className="grid gap-1.5 text-sm">
                        <div>
                          <dt className="text-stone-500">Hotel</dt>
                          <dd className="font-medium text-stone-900">{block.title || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-stone-500">Lead Guest</dt>
                          <dd className="font-medium text-stone-900">Test User</dd>
                        </div>
                        <div>
                          <dt className="text-stone-500">Check-in</dt>
                          <dd className="font-medium text-stone-900">{block.date || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-stone-500">Check-out</dt>
                          <dd className="font-medium text-stone-900">{block.endDate ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-stone-500">Conf Code</dt>
                          <dd className="font-mono font-medium text-stone-900">{block.confirmationCode ?? "—"}</dd>
                        </div>
                      </dl>
                      <p className="text-[11px] text-stone-500 leading-relaxed pt-1 border-t border-emerald-200/80">
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
                          className="text-sm font-medium text-red-600 hover:text-red-700 hover:underline disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          {isCancelling ? "Cancelling…" : "Cancel booking"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {block.type === "accommodation" && ENABLE_LIVE_BOOKING && (
                        <>
                          <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
                            Estimated Price ($)
                          </label>
                          <div className="mt-1 flex items-center gap-3">
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
                              className="w-full max-w-[8rem] rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
                            />
                            <div className="flex flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-stone-500">Adults</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={9}
                                    value={adults}
                                    onChange={(e) =>
                                      setAdults(Math.min(9, Math.max(1, parseInt(e.target.value, 10) || 1)))
                                    }
                                    className="w-14 rounded border border-stone-200 bg-white px-2 py-1 text-sm text-stone-800 focus:border-stone-400 focus:outline-none"
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-stone-500">Children</label>
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
                                    className="w-14 rounded border border-stone-200 bg-white px-2 py-1 text-sm text-stone-800 focus:border-stone-400 focus:outline-none"
                                  />
                                </div>
                                {children > 0 && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    {Array.from({ length: children }, (_, i) => (
                                      <div key={i} className="flex items-center gap-1">
                                        <label className="text-[11px] text-stone-400">Child {i + 1} age</label>
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
                                          className="w-12 rounded border border-stone-200 bg-white px-1.5 py-0.5 text-sm text-stone-800 focus:border-stone-400 focus:outline-none"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {cancellationNote && (
                                <p className="text-xs text-amber-700/90">
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
                                      ? "bg-emerald-100 border border-emerald-300 text-emerald-800 cursor-default"
                                      : "bg-stone-100 border border-stone-200 hover:bg-stone-200"
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
                              <p className="text-xs text-stone-500">
                                {block.googlePlaceId
                                  ? "✅ Official Hotel Linked"
                                  : "⚠️ Search and select a hotel above to check live prices"}
                              </p>
                              {block.priceNote && (
                                <p className="text-xs text-amber-600">
                                  {block.priceNote}
                                </p>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                      {block.type === "accommodation" && !ENABLE_LIVE_BOOKING && (
                        <div className="mt-4 p-4 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-700">Live Wholesale Pricing</p>
                            <p className="text-xs text-gray-500">We are currently connecting to global hotel APIs to bring you live, bookable rates.</p>
                          </div>
                          <span className="px-3 py-1 bg-gray-200 text-gray-600 text-xs font-semibold rounded-full uppercase tracking-wider">Coming Soon</span>
                        </div>
                      )}
                      {block.type !== "accommodation" && (
                        <>
                          <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
                            Estimated Price ($)
                          </label>
                          <div className="mt-1 flex items-center gap-3">
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
                              className="w-full max-w-[8rem] rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
                            />
                          </div>
                        </>
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
                        ? "bg-red-50 text-red-600 hover:bg-red-100"
                        : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
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
                    className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteBlock?.(block.id)}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFlipped(false)}
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-600 transition hover:bg-stone-50"
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
