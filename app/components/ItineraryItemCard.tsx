"use client";

import React, { useState } from "react";
import {
  GripVertical,
  Trash2,
  Loader2,
  CheckCircle,
  ExternalLink,
  Sparkles,
  Bookmark,
  Pencil,
  X,
} from "lucide-react";

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
  description: string;
  bookingOptions?: BookingOption[];
  isBooked?: boolean;
  bookedName?: string;
  confirmationNumber?: string;
  cost?: string;
  actualBookingUrl?: string;
  isIncluded?: boolean;
};

type ItineraryItemCardProps = {
  block: ItineraryBlock;
  /** When true, only the front (read-only) content is shown; no drag/edit/bookmark. */
  readOnly?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement> | null;
  dragInnerRef?: (el: HTMLElement | null) => void;
  dragDraggableProps?: object;
  snapshot?: { isDragging: boolean };
  updateBlock?: (id: string, patch: Partial<ItineraryBlock>) => void;
  deleteBlock?: (id: string) => void;
  toggleIncludeInItinerary?: (blockId: string) => void;
  handleFindBookings?: (blockId: string, blockData: ItineraryBlock) => void;
  bookingOptionsLoadingBlockId?: string | null;
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
  handleFindBookings,
  bookingOptionsLoadingBlockId = null,
  typeBadgeClass,
}: ItineraryItemCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

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
        {block.description ? (
          <p className="mt-1 line-clamp-2 min-w-0 text-sm leading-relaxed text-stone-600">
            {block.description}
          </p>
        ) : null}
        {block.isBooked && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <CheckCircle className="h-3.5 w-3.5" strokeWidth={2} />
            Booked
          </div>
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
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleIncludeInItinerary?.(block.id);
                    }}
                    className={`rounded-xl p-2 transition ${
                      block.isIncluded !== false
                        ? "bg-amber-100 text-amber-600 hover:bg-amber-200"
                        : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                    }`}
                    aria-label={
                      block.isIncluded !== false
                        ? "Included in itinerary"
                        : "Include in itinerary"
                    }
                    aria-pressed={block.isIncluded !== false}
                  >
                    <Bookmark
                      className="h-5 w-5"
                      strokeWidth={block.isIncluded !== false ? 2.5 : 1.5}
                      fill={block.isIncluded !== false ? "currentColor" : "none"}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFlipped(true)}
                    className="rounded-xl p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"
                    aria-label="Edit"
                  >
                    <Pencil className="h-5 w-5" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
              <h3 className="mt-2 line-clamp-2 min-w-0 text-lg font-semibold tracking-tight text-stone-900">
                {block.isBooked ? (block.bookedName ?? block.title) : block.title || "Untitled"}
              </h3>
              {block.description ? (
                <p className="mt-1 line-clamp-3 min-w-0 text-sm leading-relaxed text-stone-600">
                  {block.description}
                </p>
              ) : null}
              {block.isBooked && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <CheckCircle className="h-3.5 w-3.5" strokeWidth={2} />
                  Booked
                </div>
              )}
              {block.bookingOptions && block.bookingOptions.length > 0 ? (
                <ul className="mt-3 flex min-w-0 flex-col gap-1">
                  {block.bookingOptions.slice(0, 2).map((opt, i) => (
                    <li key={i} className="min-w-0">
                      <a
                        href={opt.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 truncate text-sm text-stone-600 underline decoration-stone-300 hover:decoration-stone-500"
                      >
                        {opt.providerName}
                        <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </a>
                    </li>
                  ))}
                  {block.bookingOptions.length > 2 && (
                    <li className="text-xs text-stone-400">
                      +{block.bookingOptions.length - 2} more
                    </li>
                  )}
                </ul>
              ) : null}
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
                  <input
                    type="text"
                    value={
                      block.isBooked ? (block.bookedName ?? block.title) : block.title
                    }
                    onChange={(e) =>
                      block.isBooked
                        ? updateBlock?.(block.id, { bookedName: e.target.value })
                        : updateBlock?.(block.id, { title: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
                    placeholder="Title"
                  />
                </div>
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
                    className="mt-1 w-full resize-y rounded-lg border border-stone-200 bg-stone-50/50 px-3 py-2 text-sm leading-relaxed text-stone-600 placeholder:text-stone-400 focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-200"
                    placeholder="Description"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateBlock?.(block.id, { isBooked: !block.isBooked })
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${
                    block.isBooked
                      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                      : "bg-stone-50 text-stone-600 ring-stone-200 hover:bg-stone-100"
                  }`}
                  aria-pressed={block.isBooked}
                >
                  <CheckCircle
                    className={`h-3.5 w-3.5 ${block.isBooked ? "text-emerald-600" : "text-stone-400"}`}
                    strokeWidth={2}
                    aria-hidden
                  />
                  Mark as Booked
                </button>
                {block.isBooked && (
                  <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                      Confirmed Reservation Details
                    </span>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="sm:col-span-2">
                        <span className="mb-1 block text-xs font-medium text-stone-500">
                          Name (as booked)
                        </span>
                        <input
                          type="text"
                          value={block.bookedName ?? ""}
                          onChange={(e) =>
                            updateBlock?.(block.id, { bookedName: e.target.value })
                          }
                          placeholder={block.title || "Reservation name"}
                          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs font-medium text-stone-500">
                          Confirmation number
                        </span>
                        <input
                          type="text"
                          value={block.confirmationNumber ?? ""}
                          onChange={(e) =>
                            updateBlock?.(block.id, {
                              confirmationNumber: e.target.value,
                            })
                          }
                          placeholder="e.g. ABC123"
                          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs font-medium text-stone-500">
                          Cost
                        </span>
                        <input
                          type="text"
                          value={block.cost ?? ""}
                          onChange={(e) =>
                            updateBlock?.(block.id, { cost: e.target.value })
                          }
                          placeholder="e.g. $299"
                          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
                        />
                      </label>
                      <label className="sm:col-span-2">
                        <span className="mb-1 block text-xs font-medium text-stone-500">
                          Booking URL
                        </span>
                        <input
                          type="url"
                          value={block.actualBookingUrl ?? ""}
                          onChange={(e) =>
                            updateBlock?.(block.id, {
                              actualBookingUrl: e.target.value,
                            })
                          }
                          placeholder="https://..."
                          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
                        />
                      </label>
                    </div>
                  </div>
                )}
                {block.bookingOptions && block.bookingOptions.length > 0 ? (
                  <div className="space-y-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-stone-400">
                      Book with
                    </span>
                    <ul className="flex flex-col gap-2">
                      {block.bookingOptions.map((opt, i) => (
                        <li key={i}>
                          <a
                            href={opt.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-sm transition hover:border-stone-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="font-medium text-stone-900">
                                {opt.providerName}
                              </span>
                              <span className="mt-0.5 block text-sm text-stone-600">
                                {opt.why}
                              </span>
                            </span>
                            <ExternalLink
                              className="h-4 w-4 shrink-0 text-stone-400"
                              strokeWidth={1.5}
                            />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleFindBookings?.(block.id, block)}
                    disabled={bookingOptionsLoadingBlockId === block.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 hover:border-stone-300 disabled:opacity-70"
                  >
                    {bookingOptionsLoadingBlockId === block.id ? (
                      <Loader2
                        className="h-4 w-4 shrink-0 animate-spin"
                        strokeWidth={1.5}
                      />
                    ) : (
                      <Sparkles
                        className="h-4 w-4 shrink-0 text-amber-500"
                        strokeWidth={1.5}
                      />
                    )}
                    Find Bookings
                  </button>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => toggleIncludeInItinerary?.(block.id)}
                    className={`rounded-xl p-2 transition ${
                      block.isIncluded !== false
                        ? "bg-amber-100 text-amber-600 hover:bg-amber-200"
                        : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                    }`}
                    aria-label={
                      block.isIncluded !== false
                        ? "Included in itinerary"
                        : "Include in itinerary"
                    }
                    aria-pressed={block.isIncluded !== false}
                  >
                    <Bookmark
                      className="h-5 w-5"
                      strokeWidth={block.isIncluded !== false ? 2.5 : 1.5}
                      fill={block.isIncluded !== false ? "currentColor" : "none"}
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
