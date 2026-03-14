"use client";

import React, { useState } from "react";
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

  const handleSave = () => {
    // Data is already in parent state via updateBlock on each field change; flip back to front.
    // Front label (e.g. type) reads from block props so it updates immediately.
    setIsFlipped(false);
  };

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
            ${block.price.toLocaleString()}
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
                  ${block.price.toLocaleString()}
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
                          onChange={(e) => updateBlock?.(block.id, { date: e.target.value })}
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
                          onChange={(e) => updateBlock?.(block.id, { endDate: e.target.value || undefined })}
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
                      title="Title is set by selecting a hotel from the search below"
                      className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-stone-600 cursor-not-allowed placeholder:text-stone-400"
                      placeholder="Where to Stay — select a hotel below"
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
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
                    {block.type === "accommodation" ? "Recommendations" : "Description"}
                  </label>
                  <textarea
                    value={block.description}
                    onChange={(e) =>
                      updateBlock?.(block.id, { description: e.target.value })
                    }
                    rows={3}
                    className="mt-1 w-full resize-y rounded-lg border border-stone-200 bg-stone-50/50 px-3 py-2 text-sm leading-relaxed text-stone-600 placeholder:text-stone-400 focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-200 whitespace-pre-wrap"
                    placeholder={block.type === "accommodation" ? "Recommendations" : "Description"}
                  />
                </div>
                {block.type === "accommodation" && (
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
                      onSelect={(hotel: HotelSearchResult) => {
                        updateBlock?.(block.id, {
                          title: hotel.name,
                          googlePlaceId: hotel.id,
                        });
                      }}
                      placeholder="Search our recommendations here..."
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
                    Estimated Price ($)
                  </label>
                  <div className="mt-1 flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={block.price ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const num = raw === "" ? undefined : Number(raw);
                        updateBlock?.(block.id, {
                          price: num !== undefined && Number.isFinite(num) ? num : undefined,
                        });
                      }}
                      placeholder="e.g. 450"
                      className="w-full max-w-[8rem] rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
                    />
                    {block.type === "accommodation" && (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!block.googlePlaceId) return;
                            if (!block.endDate) {
                              alert("Please select a Check-Out date first");
                              return;
                            }
                            setIsCheckingPrice(true);
                            try {
                              const res = await fetch(
                                "/api/hotels/price?googlePlaceId=" +
                                  encodeURIComponent(block.googlePlaceId) +
                                  "&checkIn=" +
                                  encodeURIComponent(block.date) +
                                  "&checkOut=" +
                                  encodeURIComponent(block.endDate)
                              );
                              if (!res.ok) throw new Error("Price fetch failed");
                              const data = await res.json();
                              updateBlock?.(block.id, { price: data.price });
                            } finally {
                              setIsCheckingPrice(false);
                            }
                          }}
                          disabled={!block.googlePlaceId || isCheckingPrice}
                          className="w-fit px-3 py-1.5 text-sm font-medium bg-stone-100 border border-stone-200 rounded-md hover:bg-stone-200 transition disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          {isCheckingPrice
                            ? "Checking…"
                            : "Check Live Price"}
                        </button>
                        <p className="text-xs text-stone-500">
                          {block.googlePlaceId
                            ? "✅ Official Hotel Linked"
                            : "⚠️ Search and select a hotel above to check live prices"}
                        </p>
                      </div>
                    )}
                  </div>
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
