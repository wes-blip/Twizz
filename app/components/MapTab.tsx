"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import Map, { Marker, Source, Layer, type MapRef } from "react-map-gl/mapbox";
import { ChevronDown, Home, Navigation } from "lucide-react";

function isValidLngLat(lng: unknown, lat: unknown): boolean {
  return (
    typeof lng === "number" &&
    typeof lat === "number" &&
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lng === 0 && lat === 0)
  );
}

function collectCoordinatePairs(items: any[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (const item of items) {
    if (item?.type === "logistics") {
      const start = item?.startLocation;
      const end = item?.endLocation;
      if (isValidLngLat(start?.lng, start?.lat)) {
        pairs.push([start.lng, start.lat]);
      }
      if (isValidLngLat(end?.lng, end?.lat)) {
        pairs.push([end.lng, end.lat]);
      }
    } else {
      const loc = item?.location;
      if (isValidLngLat(loc?.lng, loc?.lat)) {
        pairs.push([loc.lng, loc.lat]);
      }
    }
  }
  return pairs;
}

function extractUniqueDatesSorted(items: any[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const d = String(item?.date ?? "").trim();
    if (d) set.add(d);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function itemMatchesSelectedDate(item: any, selectedDate: string | "All"): boolean {
  if (selectedDate === "All") return true;
  const d = String(item?.date ?? "").trim();
  return d === selectedDate;
}

function boundsFromPairs(pairs: [number, number][]): [[number, number], [number, number]] | null {
  if (pairs.length === 0) return null;
  let minLng = pairs[0][0];
  let minLat = pairs[0][1];
  let maxLng = pairs[0][0];
  let maxLat = pairs[0][1];
  for (const [lng, lat] of pairs) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  if (minLng === maxLng && minLat === maxLat) {
    const pad = 0.02;
    minLng -= pad;
    minLat -= pad;
    maxLng += pad;
    maxLat += pad;
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export default function MapTab({
  itineraryItems,
}: {
  itineraryItems: any[];
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mapRef = useRef<MapRef | null>(null);
  const dayDropdownRef = useRef<HTMLDivElement | null>(null);

  const uniqueDates = useMemo(
    () => extractUniqueDatesSorted(itineraryItems),
    [itineraryItems]
  );

  const [selectedDate, setSelectedDate] = useState<string | "All">("All");
  const [isOpen, setIsOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const filteredItems = useMemo(
    () => itineraryItems.filter((item) => itemMatchesSelectedDate(item, selectedDate)),
    [itineraryItems, selectedDate]
  );

  const dayMenuOptions = useMemo(() => {
    const opts: { value: string | "All"; label: string }[] = [
      { value: "All", label: "Full Trip" },
    ];
    uniqueDates.forEach((date, i) => {
      opts.push({ value: date, label: `Day ${i + 1}` });
    });
    return opts;
  }, [uniqueDates]);

  const selectedDayLabel = useMemo(() => {
    if (selectedDate === "All") return "Full Trip";
    const idx = uniqueDates.indexOf(selectedDate);
    if (idx >= 0) return `Day ${idx + 1}`;
    return "Full Trip";
  }, [selectedDate, uniqueDates]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = dayDropdownRef.current;
      if (el && !el.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const initialViewState = useMemo(() => {
    const pairs = collectCoordinatePairs(itineraryItems);
    if (pairs.length === 0) {
      return {
        longitude: -98.5795,
        latitude: 39.8283,
        zoom: 2.5,
      };
    }
    const b = boundsFromPairs(pairs);
    if (!b) {
      return {
        longitude: -98.5795,
        latitude: 39.8283,
        zoom: 2.5,
      };
    }
    return {
      bounds: b,
      fitBoundsOptions: { padding: 60 },
    };
  }, [itineraryItems]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    const pairs = collectCoordinatePairs(filteredItems);
    const bounds = boundsFromPairs(pairs);
    if (!bounds) return;
    map.fitBounds(bounds, { padding: 80, duration: 1200 });
  }, [filteredItems, mapReady]);

  const logisticsGeoJson = useMemo((): GeoJSON.FeatureCollection => {
    const features: GeoJSON.Feature[] = [];
    for (const item of filteredItems) {
      if (item?.type !== "logistics") continue;
      const start = item?.startLocation;
      const end = item?.endLocation;
      if (
        !isValidLngLat(start?.lng, start?.lat) ||
        !isValidLngLat(end?.lng, end?.lat)
      ) {
        continue;
      }
      features.push({
        type: "Feature",
        properties: { id: String(item?.id ?? "") },
        geometry: {
          type: "LineString",
          coordinates: [
            [start.lng, start.lat],
            [end.lng, end.lat],
          ],
        },
      });
    }
    return { type: "FeatureCollection", features };
  }, [filteredItems]);

  if (!token?.trim()) {
    return (
      <div className="flex h-[600px] w-full items-center justify-center rounded-2xl border border-white/10 bg-slate-900/40 md:h-[700px]">
        <p className="text-center text-sm text-slate-400">
          Add{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">
            NEXT_PUBLIC_MAPBOX_TOKEN
          </code>{" "}
          to show the map.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[600px] w-full overflow-hidden rounded-2xl border border-white/10 md:h-[700px]">
      <Map
        ref={mapRef}
        mapboxAccessToken={token}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        initialViewState={initialViewState}
        style={{ width: "100%", height: "100%" }}
        onLoad={() => setMapReady(true)}
      >
        {logisticsGeoJson.features.length > 0 && (
          <Source id="logistics-routes" type="geojson" data={logisticsGeoJson}>
            <Layer
              id="logistics-line"
              type="line"
              paint={{
                "line-color": "#14b8a6",
                "line-width": 2,
                "line-dasharray": [2, 2],
              }}
            />
            <Layer
              id="logistics-arrows"
              type="symbol"
              layout={{
                "symbol-placement": "line",
                "text-field": "▶",
                "text-size": 14,
                "symbol-spacing": 50,
                "text-font": [
                  "DIN Pro Medium",
                  "Arial Unicode MS Regular",
                ],
                "text-rotation-alignment": "map",
              }}
              paint={{
                "text-color": "#14b8a6",
              }}
            />
          </Source>
        )}

        {filteredItems.flatMap((item) => {
          const out: ReactElement[] = [];

          if (item?.type === "accommodation") {
            const loc = item?.location;
            const label =
              String(loc?.name ?? "").trim() ||
              String(item?.title ?? "Accommodation").trim();
            if (isValidLngLat(loc?.lng, loc?.lat)) {
              out.push(
                <Marker
                  key={`${item.id}-acc`}
                  longitude={loc.lng}
                  latitude={loc.lat}
                  anchor="center"
                >
                  <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-white px-2.5 py-1 text-xs font-medium text-slate-900 shadow-xl">
                    <Home size={14} strokeWidth={2} aria-hidden />
                    {label}
                  </div>
                </Marker>
              );
            }
            return out;
          }

          if (item?.type === "activity") {
            const loc = item?.location;
            const label =
              String(loc?.name ?? "").trim() ||
              String(item?.title ?? "Activity").trim();
            if (isValidLngLat(loc?.lng, loc?.lat)) {
              out.push(
                <Marker
                  key={`${item.id}-act`}
                  longitude={loc.lng}
                  latitude={loc.lat}
                  anchor="center"
                >
                  <div className="whitespace-nowrap rounded-full border border-white/20 bg-slate-800 px-2.5 py-1 text-xs font-medium text-white shadow-lg">
                    {label}
                  </div>
                </Marker>
              );
            }
            return out;
          }

          if (item?.type === "logistics") {
            const start = item?.startLocation;
            const end = item?.endLocation;
            if (isValidLngLat(start?.lng, start?.lat)) {
              out.push(
                <Marker
                  key={`${item.id}-log-start`}
                  longitude={start.lng}
                  latitude={start.lat}
                  anchor="center"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer rounded-full bg-teal-500 p-2 text-white transition-opacity hover:opacity-90"
                  >
                    <Navigation size={16} strokeWidth={2} aria-hidden />
                  </div>
                </Marker>
              );
            }
            if (isValidLngLat(end?.lng, end?.lat)) {
              out.push(
                <Marker
                  key={`${item.id}-log-end`}
                  longitude={end.lng}
                  latitude={end.lat}
                  anchor="center"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer rounded-full bg-teal-500 p-2 text-white transition-opacity hover:opacity-90"
                  >
                    <Navigation size={16} strokeWidth={2} aria-hidden />
                  </div>
                </Marker>
              );
            }
            return out;
          }

          return out;
        })}
      </Map>

      <div
        ref={dayDropdownRef}
        className="pointer-events-auto absolute left-4 top-4 z-20 max-w-[min(100%,18rem)]"
      >
        <button
          type="button"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label="Select map day"
          className="flex w-full min-w-[10.5rem] cursor-pointer items-center justify-between gap-2 rounded-full border border-white/10 bg-slate-900/90 px-4 py-2.5 text-left text-sm font-medium text-white shadow-lg backdrop-blur-md transition-colors hover:bg-slate-800/90"
          onClick={() => setIsOpen((o) => !o)}
        >
          <span className="truncate">{selectedDayLabel}</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-white/80 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
            strokeWidth={2}
            aria-hidden
          />
        </button>
        {isOpen && (
          <div
            role="listbox"
            aria-label="Trip days"
            className="absolute left-0 right-0 top-full z-20 mt-2 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/95 py-1 shadow-2xl backdrop-blur-md"
          >
            {dayMenuOptions.map(({ value, label }) => {
              const isSelected =
                value === "All"
                  ? selectedDate === "All"
                  : selectedDate === value;
              return (
                <button
                  key={value === "All" ? "full-trip" : value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`flex w-full cursor-pointer px-4 py-2.5 text-left text-sm transition-colors ${
                    isSelected
                      ? "bg-white font-bold text-slate-900"
                      : "text-white hover:bg-white/10"
                  }`}
                  onClick={() => {
                    setSelectedDate(value);
                    setIsOpen(false);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
