"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";

const DEBOUNCE_MS = 300;

export type HotelSearchResult = {
  id: string;
  name: string;
  location: string;
  isVIP: boolean;
};

type LiveHotelSearchProps = {
  value: string;
  onSelect: (hotel: HotelSearchResult) => void;
  /** Fires when the user edits the input (clears committed selection in parent when needed). */
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  /** GET endpoint; `?query=` is appended. Default: hotel/lodging search. */
  searchApiBasePath?: string;
  /** Optional class for the search input (e.g. glass style) */
  inputClassName?: string;
  /** Optional class for the dropdown list container */
  listClassName?: string;
  /** Optional class for each list item */
  listItemClassName?: string;
  /** Optional class for the selected list item */
  listItemSelectedClassName?: string;
  /** Optional class for empty state message */
  listEmptyClassName?: string;
  /** Optional class for the hint line at bottom of list */
  listHintClassName?: string;
  /** Optional class for the loading spinner wrapper */
  loaderClassName?: string;
  /** Optional class for the location line inside each result item */
  listItemLocationClassName?: string;
  /** Optional class for the VIP/Fora badge inside each result item */
  listItemBadgeClassName?: string;
  /** Shown when the list is open, search returned nothing, and query is long enough */
  emptyMessage?: string;
  /** Bottom hint inside the list; set to empty string to hide */
  hintMessage?: string;
  autoFocus?: boolean;
  /** For <label htmlFor="…"> association */
  inputId?: string;
};

function normalizePlaceholderTitle(v: string): string {
  return v === "Where to stay" || v === "Where to Stay" ? "" : v ?? "";
}

const defaultInputClass =
  "mt-1 w-full rounded-lg border border-stone-200 bg-white py-2 pl-3 pr-10 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200";
const defaultListClass =
  "absolute z-50 w-full bg-white mt-1 max-h-60 overflow-auto rounded-lg border border-stone-200 py-1 shadow-lg ring-1 ring-black/5";
const defaultItemClass =
  "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm transition text-stone-800 hover:bg-stone-50";
const defaultItemSelectedClass = "bg-amber-50 text-stone-900";
const defaultEmptyClass = "px-3 py-2 text-sm text-stone-500";
const defaultHintClass =
  "px-3 py-2 text-sm text-stone-400 select-none pointer-events-none border-t border-stone-100 mt-1 pt-2";
const defaultLoaderClass = "text-stone-400";

const DEFAULT_SEARCH_API = "/api/hotels/search";

export function LiveHotelSearch({
  value,
  onSelect,
  onQueryChange,
  searchApiBasePath = DEFAULT_SEARCH_API,
  placeholder = "Search our recommendations here...",
  inputClassName = defaultInputClass,
  listClassName = defaultListClass,
  listItemClassName = defaultItemClass,
  listItemSelectedClassName = defaultItemSelectedClass,
  listEmptyClassName = defaultEmptyClass,
  listHintClassName = defaultHintClass,
  loaderClassName = defaultLoaderClass,
  listItemLocationClassName = "text-stone-500",
  listItemBadgeClassName = "shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200/80",
  emptyMessage = "No hotels found. Keep typing.",
  hintMessage = "Type a name to search all properties...",
  autoFocus = false,
  inputId,
}: LiveHotelSearchProps) {
  const [inputValue, setInputValue] = useState(() => normalizePlaceholderTitle(value));
  const [results, setResults] = useState<HotelSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const syncValue = useCallback((v: string) => {
    setInputValue(normalizePlaceholderTitle(v));
  }, []);

  useEffect(() => {
    syncValue(value);
  }, [value, syncValue]);

  const runSearch = useCallback(async (q: string) => {
    setIsSearching(true);
    try {
      const sep = searchApiBasePath.includes("?") ? "&" : "?";
      const res = await fetch(
        `${searchApiBasePath}${sep}query=${encodeURIComponent(q)}`
      );
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : data?.results ?? [];
      setResults(
        list.map((item: { id: string; name: string; location?: string; isVIP?: boolean }) => ({
          id: item.id,
          name: item.name,
          location: item.location ?? "",
          isVIP: Boolean(item.isVIP),
        }))
      );
      setIsOpen(true);
      setSelectedIndex(-1);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchApiBasePath]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      runSearch(inputValue.trim());
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, runSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (hotel: HotelSearchResult) => {
      onSelect(hotel);
      setInputValue(hotel.name);
      setIsOpen(false);
      setResults([]);
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || results.length === 0) {
        if (e.key === "Escape") setIsOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i < results.length - 1 ? i + 1 : i));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i > 0 ? i - 1 : -1));
        return;
      }
      if (e.key === "Enter" && selectedIndex >= 0 && results[selectedIndex]) {
        e.preventDefault();
        handleSelect(results[selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    },
    [isOpen, results, selectedIndex, handleSelect]
  );

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <input
          id={inputId}
          type="text"
          value={inputValue}
          onChange={(e) => {
            const next = e.target.value;
            setInputValue(next);
            onQueryChange?.(next);
          }}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
            if (!inputValue.trim()) runSearch("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={inputClassName}
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="hotel-search-results"
          aria-activedescendant={
            selectedIndex >= 0 && results[selectedIndex]
              ? `hotel-result-${selectedIndex}`
              : undefined
          }
        />
        {isSearching && (
          <span
            className={`absolute right-3 top-1/2 -translate-y-1/2 ${loaderClassName}`}
            aria-hidden
          >
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
          </span>
        )}
      </div>
      {isOpen && (results.length > 0 || inputValue.trim().length >= 3) && (
        <ul
          id="hotel-search-results"
          role="listbox"
          className={listClassName}
        >
          {results.length === 0 ? (
            <li className={listEmptyClassName}>{emptyMessage}</li>
          ) : (
            <>
              {results.map((item, i) => (
                <li
                  key={item.id}
                  id={`hotel-result-${i}`}
                  role="option"
                  aria-selected={selectedIndex === i}
                  className={`${listItemClassName} ${
                    selectedIndex === i ? listItemSelectedClassName : ""
                  }`}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => handleSelect(item)}
                >
                  <div className="min-w-0 flex-1">
                    <span className="block min-w-0 truncate">{item.name}</span>
                    {item.location ? (
                      <span className={`block min-w-0 truncate text-xs ${listItemLocationClassName}`}>{item.location}</span>
                    ) : null}
                  </div>
                  {item.isVIP && (
                    <span className={listItemBadgeClassName}>
                      ✨ Fora Partner
                    </span>
                  )}
                </li>
              ))}
              {hintMessage ? (
                <li className={listHintClassName} aria-hidden>
                  {hintMessage}
                </li>
              ) : null}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
