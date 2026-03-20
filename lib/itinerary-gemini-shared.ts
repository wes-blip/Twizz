/**
 * Shared types, system prompt, and JSON parsing for Gemini itinerary generation.
 * Used by full-trip and single custom-block routes.
 */

import { SchemaType, type ObjectSchema } from "@google/generative-ai";

/** Geo payload from the model; aligns with frontend ItineraryRichLocation (placeId optional / ""). */
export type GeminiGeoPlace = {
  name: string;
  lat: number;
  lng: number;
  placeId?: string;
};

export type ItineraryBlockPayload = {
  id?: string;
  /** YYYY-MM-DD based on trip start date */
  date: string;
  /** YYYY-MM-DD optional check-out for accommodation */
  endDate?: string;
  type: "accommodation" | "activity" | "logistics";
  title: string;
  /** Teaser for card front (accommodation: 2 sentences; others: 3–5 word TLDR) */
  summary?: string;
  /** Full detail for card back */
  description: string;
  /** Optional: for Accommodation blocks, exactly 3 options as "Hotel Name - Vibe" per line */
  recommendations?: string;
  /** accommodation & activity: primary map pin */
  location?: GeminiGeoPlace;
  /** logistics: route endpoints (both required for type logistics) */
  startLocation?: GeminiGeoPlace;
  endLocation?: GeminiGeoPlace;
};

const GEO_PLACE_SCHEMA: ObjectSchema = {
  type: SchemaType.OBJECT,
  description:
    "Geographic object: name (string), lat and lng (WGS84 decimals). Required keys on every instance.",
  properties: {
    name: { type: SchemaType.STRING },
    lat: { type: SchemaType.NUMBER, format: "double" },
    lng: { type: SchemaType.NUMBER, format: "double" },
    placeId: { type: SchemaType.STRING },
  },
  required: ["name", "lat", "lng"],
};

/** Same shape as GEO_PLACE_SCHEMA; extra description for structured-output emphasis. */
const LOGISTICS_ENDPOINT_SCHEMA: ObjectSchema = {
  ...GEO_PLACE_SCHEMA,
  description:
    'For type "logistics" this is a mandatory journey endpoint (not optional). Must include name, lat, lng.',
};

/** Fallback geo when logistics endpoint is missing or unusable (map skips 0,0). */
const DEFAULT_LOGISTICS_START: GeminiGeoPlace = {
  name: "Origin",
  lat: 0,
  lng: 0,
  placeId: "",
};
const DEFAULT_LOGISTICS_END: GeminiGeoPlace = {
  name: "Destination",
  lat: 0,
  lng: 0,
  placeId: "",
};
const DEFAULT_ACTIVITY_ACCOMMODATION_LOCATION: GeminiGeoPlace = {
  name: "TBD",
  lat: 0,
  lng: 0,
  placeId: "",
};

function finalizeLogisticsEndpoint(
  normalized: GeminiGeoPlace,
  role: "start" | "end"
): GeminiGeoPlace {
  if (geoPlaceIsUsable(normalized)) return normalized;
  const n = String(normalized.name ?? "").trim();
  if (n) {
    return {
      name: n,
      lat: 0,
      lng: 0,
      placeId: typeof normalized.placeId === "string" ? normalized.placeId : "",
    };
  }
  return role === "start" ? DEFAULT_LOGISTICS_START : DEFAULT_LOGISTICS_END;
}

function finalizeActivityOrAccommodationLocation(normalized: GeminiGeoPlace): GeminiGeoPlace {
  if (geoPlaceIsUsable(normalized)) return normalized;
  const n = String(normalized.name ?? "").trim();
  if (n) {
    return {
      name: n,
      lat: 0,
      lng: 0,
      placeId: typeof normalized.placeId === "string" ? normalized.placeId : "",
    };
  }
  return DEFAULT_ACTIVITY_ACCOMMODATION_LOCATION;
}

/**
 * Gemini structured output schema for full-trip generation (generate-trip route).
 * startLocation/endLocation/location are all required on every item so the API always materializes
 * logistics endpoints; for activity/accommodation the prompt instructs identical copies for the three objects.
 */
export const ITINERARY_TRIP_RESPONSE_SCHEMA: ObjectSchema = {
  type: SchemaType.OBJECT,
  properties: {
    creativeTripName: { type: SchemaType.STRING },
    itineraryBlocks: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        description:
          'Every block must include location, startLocation, and endLocation. For type "logistics", startLocation and endLocation are the real journey endpoints (required; name+lat+lng each). For "activity" and "accommodation", set all three geo objects to the same name/lat/lng as location.',
        properties: {
          date: { type: SchemaType.STRING },
          endDate: { type: SchemaType.STRING },
          location: {
            ...GEO_PLACE_SCHEMA,
            description:
              'Primary pin for accommodation and activity. For logistics, duplicate startLocation.',
          },
          startLocation: {
            ...LOGISTICS_ENDPOINT_SCHEMA,
            description:
              'For type "logistics": departure endpoint (name, lat, lng)—required. For activity/accommodation: same object as location.',
          },
          endLocation: {
            ...LOGISTICS_ENDPOINT_SCHEMA,
            description:
              'For type "logistics": arrival endpoint (name, lat, lng)—required. For activity/accommodation: same object as location.',
          },
          type: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["accommodation", "activity", "logistics"],
          },
          title: { type: SchemaType.STRING },
          summary: { type: SchemaType.STRING },
          description: { type: SchemaType.STRING },
          recommendations: { type: SchemaType.STRING },
        },
        required: [
          "date",
          "type",
          "title",
          "summary",
          "description",
          "location",
          "startLocation",
          "endLocation",
        ],
      },
    },
  },
  required: ["creativeTripName", "itineraryBlocks"],
};

/** True when a geo object has a non-empty name and finite non-zero lat/lng (map-ready; parser uses fallbacks when false). */
export function geoPlaceIsUsable(p: GeminiGeoPlace | undefined): boolean {
  if (!p) return false;
  if (!String(p.name ?? "").trim()) return false;
  if (typeof p.lat !== "number" || !Number.isFinite(p.lat)) return false;
  if (typeof p.lng !== "number" || !Number.isFinite(p.lng)) return false;
  if (p.lat === 0 && p.lng === 0) return false;
  return true;
}

function parseFiniteNumber(n: unknown): number | null {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string" && n.trim() !== "") {
    const x = Number(n);
    if (Number.isFinite(x)) return x;
  }
  return null;
}

function normalizeGeoPlace(
  v: unknown,
  fallbackName: string
): GeminiGeoPlace {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const name =
      typeof o.name === "string" && o.name.trim()
        ? o.name.trim()
        : fallbackName.trim();
    const lat = parseFiniteNumber(o.lat);
    const lng = parseFiniteNumber(o.lng);
    const placeId =
      typeof o.placeId === "string" && o.placeId.trim()
        ? o.placeId.trim()
        : "";
    if (lat !== null && lng !== null) {
      return { name, lat, lng, placeId };
    }
    return { name, lat: 0, lng: 0, placeId };
  }
  if (typeof v === "string" && v.trim()) {
    return { name: v.trim(), lat: 0, lng: 0, placeId: "" };
  }
  return {
    name: fallbackName.trim(),
    lat: 0,
    lng: 0,
    placeId: "",
  };
}

export const ITINERARY_SYSTEM_INSTRUCTION = `You are an elite travel agent with deep knowledge of destinations, pacing, and group dynamics.

CRITICAL SPATIAL REQUIREMENT: You must provide real, highly accurate latitude and longitude (WGS84, decimal degrees) for EVERY location. Do not use generic city names as the only geographic anchor. You must select specific, real-world venues, airports, stations, and hotels (e.g., "Haneda International Airport (HND)" instead of "Tokyo", or "The Ritz-Carlton, Kyoto" instead of "Hotel"). Coordinates must match the named place (use your best knowledge of real positions; do not invent fictional venues).

——— JSON OUTPUT (UNBREAKABLE) ———
You MUST return ONLY valid, minified JSON. No markdown (no \`\`\`json or code fences). No explanation, preamble, or text before or after the JSON. Returning valid JSON is required. For any multi-line strings (e.g. accommodation description), you MUST use escaped newline characters (\\n) inside the string—never literal line breaks inside quoted strings, or parsing will fail.

The JSON object must have exactly two top-level keys: "creativeTripName" (string) and "itineraryBlocks" (array).

——— creativeTripName ———
A catchy, evocative trip name in 3–4 words max using destination and vibe. Examples: "Cabo Sunny Escape", "Paris Romance Affair". Do NOT use generic names like "My Trip".

——— PROGRESSIVE DISCLOSURE: summary (card front) vs description (card back) ———
Every block MUST have both "summary" and "description". Use escaped newlines (\\n) in strings; never literal line breaks inside JSON strings.

——— ACCOMMODATION ———
For Accommodation blocks, you MUST provide exactly 3 hotel options in the "recommendations" field, formatted strictly as "Hotel Name - Vibe" with one per line. Do NOT put these in the description.

Example recommendations (one string with \\n between lines):
Aman Tokyo - Minimalist Luxury\\nPark Hyatt - Iconic City Views\\nHoshinoya - Urban Ryokan

summary (STRICTLY two sentences): Replace the bracketed variables with the actual vibes of the chosen hotels.
Template: "Hotels with [vibe 1], [vibe 2], and [vibe 3] vibes available. Click in to see specifically curated recommendations."
If group size (people) > 4, use "Vacation rentals" instead of "Hotels" in that sentence.

description (the inside / edit view): Keep it SHORT and GENERIC. Do NOT list hotel names here—those go in recommendations only.
Use exactly: "Hotels with great vibes available. Click in to see specifically curated recommendations."
(If people > 4, use "Vacation rentals" instead of "Hotels" in that sentence.)

Adjust recommendations for group size: hotels for <=4 people, Vrbos/villas for >4 people. No extra words in recommendations—only "Name - vibe" per line.

——— ACTIVITY blocks (over-provision and prune; type === "activity" ONLY) ———
Philosophy: The user reviews the itinerary and deletes options they do not want. Over-provision with 2–3 concrete alternatives per day—not one generic filler per slot.

Per calendar day: Include 2–3 separate Activity blocks (each its own object in "itineraryBlocks", same "date" allowed). Each block is one distinct optional card (real venue, trail, tour, class, reservation, etc.). Never merge multiple ideas into one Activity block.

Count across the trip: Every calendar day from startDate through endDate must have 2–3 Activity blocks (choose 2 or 3 per day as fits pacing; never one generic activity replacing multiple options). Light travel or arrival days still get 2–3 concrete options when plausible.

Titles (STRICT): NEVER generic or placeholder labels. Forbidden examples: "Welcome Dinner", "Scenic Hike", "Local Food Tour", "Explore the City", "Beach Day". REQUIRED: Hyper-specific, real-world names tied to the trip "location" and destination context—actual restaurant or winery names, named trails and parks, specific tour operators or ticketed experiences, reputable businesses. Good examples: "Private Tasting at Domaine Serene", "Hike the Misery Ridge Trail at Smith Rock", "Dinner at Maty's Miami". If uncertain between two real places, pick the more specific verifiable option; do not invent fake businesses—use well-known or plausibly real names for the destination.

summary: 3–5 word TLDR only, specific to that card (e.g. "Smith Rock ridge hike", "Domaine Serene tasting").

description: Highly descriptive, zero fluff. Maximum 1–2 short sentences total—no paragraphs, history lessons, or filler. Say what they do, why it fits, timing/feel if useful—tight.

Vibe alignment (STRICT): Use the request "vibe" field. Luxury → private tastings, chef's tables, small-group premium tours, high-end stays-adjacent dining; Adventure → named rugged trails, guided climbs, rafting/outfitters, backcountry or technical options; Relaxation → spas with names, slow scenic routes, low-key beaches; Foodie → specific markets, reservations, regional tastings; Nightlife → named bars/clubs/venues; Culture → specific museums, galleries, performances, historic sites. Every Activity must obviously belong to that vibe AND the destination—not generic travel filler.

Do NOT apply these Activity-only rules to "accommodation" or "logistics".

——— LOGISTICS blocks (type === "logistics" ONLY) ———
STRICT LOGISTICS & ROUTING RULES:

You MUST NOT create separate 'Activity' items for arriving at an airport or checking in. The entire journey (e.g., flying from LAX to HND) MUST be consolidated into a single 'Logistics' item.

EVERY SINGLE 'Logistics' item MUST have both a \`startLocation\` and \`endLocation\` object. Do not skip them.

Mid-trip logistics (like a bullet train) must also have exact start and end stations (e.g., \`startLocation\`: Tokyo Station, \`endLocation\`: Kyoto Station).

The first outbound logistics leg and final return leg are further locked to the user's origin in a follow-on paragraph in this system message when generating a full trip (read it immediately after this section).

STRUCTURED JSON GEO (API): The response schema requires every itinerary block to include "location", "startLocation", and "endLocation" as full objects { "name", "lat", "lng" } (optional "placeId": ""). For type "logistics", "startLocation" and "endLocation" are the real journey endpoints; set "location" to the exact same object as "startLocation". For "activity" and "accommodation", set "startLocation" and "endLocation" to exact duplicates of "location" (same name, lat, lng)—the app reads "location" for those types, but both endpoints must still be present in JSON.

MANDATORY GEO (NON-NEGOTIABLE): For logistics, never omit either endpoint, never use a bare string, and never substitute only "location" for the route. Optional "placeId": "" on each if unknown.

LOGISTICS ROUTING RULES: Logistics items represent travel. Obey the origin-locked paragraph when present. Otherwise: the very first logistics item (e.g. a flight) MUST have "startLocation" at the user's home or origin airport—if the user did not specify one, choose a plausible major international hub for their region (e.g. LAX, SFO, or JFK)—and "endLocation" at the destination airport (or the primary airport for the trip destination). Middle-of-trip logistics MUST connect the previous place in the itinerary narrative to the next with real terminals/stations. The final return flight (if included) MUST use the trip region's departure airport as "startLocation" and the same origin hub you used for the outbound leg as "endLocation". Coordinates must match the named places per CRITICAL SPATIAL REQUIREMENT.

summary: 3–5 word TLDR only (e.g. "Airport pickup arranged", "Ferry to island").
description: Exactly one short sentence—practical vibe or note. No paragraphs.

EXAMPLE LOGISTICS BLOCK (copy this pattern exactly—both endpoints filled, valid JSON types, lowercase type enum):
{
"type": "logistics",
"title": "Flight LAX to Haneda",
"summary": "Direct flight to Tokyo",
"description": "Direct flight via ANA.",
"date": "2026-05-22",
"location": { "name": "Los Angeles International Airport (LAX)", "lat": 33.9416, "lng": -118.4085 },
"startLocation": { "name": "Los Angeles International Airport (LAX)", "lat": 33.9416, "lng": -118.4085 },
"endLocation": { "name": "Haneda Airport (HND)", "lat": 35.5494, "lng": 139.7798 }
}

——— Accommodation block (traveler count) ———
Use the "people" field. If people <= 4, recommend HOTELS only. If people > 4, recommend LARGE VACATION RENTALS / VRBO-style properties only. Never mix.

——— Accommodation block title ———
For accommodation blocks, set "title" to exactly "Where to Stay". No hotel names in the title.

——— Accommodation (Fora Partner / luxury) ———
For hotels (people <= 4): prefer luxury advisor networks (Virtuoso, Four Seasons Preferred, Rosewood Elite, Belmond Bellini, Hyatt Privé, Marriott Stars) or top boutique hotels. For large rentals (people > 4): prefer high-end villas and whole-home listings.

——— Accommodation blocks (date fields) ———
If type is "accommodation", you MUST include both "date" (check-in, YYYY-MM-DD) and "endDate" (check-out, YYYY-MM-DD). Never omit endDate.

——— itineraryBlocks schema ———
Each element must have:
- "date": YYYY-MM-DD. Compute from trip startDate/endDate; assign blocks to calendar days. Accommodation blocks also need "endDate".
- "endDate": (REQUIRED for type "accommodation" only) YYYY-MM-DD check-out.
- "type": "accommodation" | "activity" | "logistics"
- "title": For accommodation only: exactly "Where to Stay". For activity: hyper-specific real place or experience name per ACTIVITY section—never generic. For logistics: short practical title.
- "summary": Accommodation = two sentences per template (Hotels/Vacation rentals + vibes; "Click in to see..."). Activity = 3–5 word specific TLDR. Logistics = 3–5 word TLDR.
- "description": Accommodation = short generic sentence only (e.g. "Hotels with great vibes available. Click in to see specifically curated recommendations."). Activity = 1–2 short sentences max, dense and specific, no fluff (see ACTIVITY section). Logistics = one short sentence.
- "recommendations": (REQUIRED for type "accommodation" only) string with exactly 3 options, one per line, format "Hotel Name - Vibe". Use \\n between lines. Omit for activity/logistics.

GEO (REQUIRED BY TYPE — matches API schema):
- Every block MUST include three objects: "location", "startLocation", and "endLocation", each with required "name", "lat", "lng" (optional "placeId": "").
- For "accommodation" and "activity": "location" is the primary pin (hyper-specific; not bare city-only). Set "startLocation" and "endLocation" to exact duplicates of "location" (same name, lat, lng).
- For "logistics": "startLocation" and "endLocation" are the real journey endpoints (both mandatory). Set "location" to the same object as "startLocation". Use named terminals, stations, piers—not bare city-only labels. Follow STRICT LOGISTICS & ROUTING RULES above.

Build a coherent day-by-day flow. Every block: date, type, title, summary, description, location, startLocation, endLocation, and type-specific fields. Accommodation blocks: also endDate and recommendations. For each trip day: 2–3 Activity blocks as distinct optional cards (over-provision model).`;

/**
 * Appended to the system instruction for full-trip generation only.
 * Keeps the main prompt (and JSON examples) static; this layer anchors first/last logistics to the user's origin.
 */
export function buildFullTripOriginRoutingRule(origin: string): string {
  const o = String(origin ?? "").trim() || "Unknown Origin";
  const oInQuotes = o.replace(/'/g, "′");
  return `ORIGIN-LOCKED LOGISTICS (FULL TRIP):

The first Logistics item must have \`startLocation\` as the user's origin (${o}) and \`endLocation\` as the destination airport (e.g., Haneda Airport).

The VERY FIRST 'Logistics' item in the itinerary (e.g., the outbound flight or train) MUST have its \`startLocation.name\` set to an appropriate airport or station matching '${oInQuotes}'. The final return Logistics item at the end of the trip MUST have its \`endLocation.name\` returning to '${oInQuotes}'.`;
}

export const SINGLE_BLOCK_MODE_APPENDIX = `

——— SINGLE CUSTOM BLOCK (MODE OVERRIDE) ———
The user is adding ONE optional block to an existing trip. Return JSON with the same top-level keys: "creativeTripName" (use an empty string "") and "itineraryBlocks" with EXACTLY ONE element.
Ignore instructions about multiple activities per day, building a full trip-wide itinerary, or over-provisioning several cards per day—only produce this single block.
The user message supplies the exact "type", "date", and "endDate" (when accommodation). Your output MUST use those exact "type", "date", and "endDate" values.
LOCATION (CRITICAL): Do NOT merely copy the trip destination string. Infer the most specific real neighborhood, district, island, marina, station, or venue that matches the user's intent and the block type. Use the trip destination only as regional context.
- For "accommodation" and "activity": set "location" to { "name", "lat", "lng" } (and "placeId": "" if unknown) per CRITICAL SPATIAL REQUIREMENT.
- For "logistics": obey STRICT LOGISTICS & ROUTING RULES from the main instruction—one consolidated Logistics card per journey; both "startLocation" and "endLocation" as full objects { "name", "lat", "lng" }. Also include "location" duplicated from "startLocation" to satisfy the API schema. Never only generic city names.`;

/**
 * Strips markdown code fences and stray backticks, then parses JSON.
 * Uses try/catch and multiple fallback strategies for robustness.
 */
export function parseJsonFromGemini(
  text: string
): { itineraryBlocks: ItineraryBlockPayload[]; creativeTripName: string } {
  let raw = String(text ?? "").trim();

  const cleanedResponse = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  raw = cleanedResponse;

  raw = raw.replace(/^`+|`+$/g, "").trim();

  function tryParse(s: string): unknown {
    return JSON.parse(s);
  }

  function repairUnescapedNewlinesInStrings(s: string): string {
    return s.replace(/"([^"\\]|\\.)*"/g, (match) =>
      match.replace(/\n/g, "\\n").replace(/\r/g, "\\r")
    );
  }

  let parsed: unknown;
  try {
    parsed = tryParse(raw);
  } catch {
    try {
      parsed = tryParse(repairUnescapedNewlinesInStrings(raw));
    } catch {
      const objectMatch = raw.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        const candidate = objectMatch[0];
        try {
          parsed = tryParse(candidate);
        } catch {
          try {
            parsed = tryParse(repairUnescapedNewlinesInStrings(candidate));
          } catch {
            throw new Error("Could not parse JSON from model response");
          }
        }
      } else {
        throw new Error("Could not parse JSON from model response");
      }
    }
  }

  const obj = parsed as { itineraryBlocks?: unknown; creativeTripName?: unknown };
  const blocks = obj.itineraryBlocks;
  if (!Array.isArray(blocks)) {
    throw new Error("Response missing itineraryBlocks array");
  }

  const creativeTripName =
    typeof obj.creativeTripName === "string" && obj.creativeTripName.trim()
      ? obj.creativeTripName.trim()
      : "";

  const itineraryBlocks: ItineraryBlockPayload[] = blocks.map((b: unknown) => {
    const block = b as Record<string, unknown>;
    const endDate = typeof block.endDate === "string" ? block.endDate.trim() : undefined;
    const summary = typeof block.summary === "string" ? block.summary.trim() : undefined;
    const recommendations =
      typeof block.recommendations === "string" ? block.recommendations.trim() : undefined;
    const type: ItineraryBlockPayload["type"] =
      block.type === "accommodation" || block.type === "logistics" ? block.type : "activity";

    const base: ItineraryBlockPayload = {
      date: typeof block.date === "string" ? block.date : "",
      ...(endDate ? { endDate } : {}),
      type,
      title: typeof block.title === "string" ? block.title : "",
      ...(summary ? { summary } : {}),
      description: typeof block.description === "string" ? block.description : "",
      ...(recommendations ? { recommendations } : {}),
    };

    if (type === "logistics") {
      const start = finalizeLogisticsEndpoint(
        normalizeGeoPlace(block.startLocation, ""),
        "start"
      );
      const end = finalizeLogisticsEndpoint(normalizeGeoPlace(block.endLocation, ""), "end");
      return {
        ...base,
        startLocation: start,
        endLocation: end,
      };
    }

    const loc = finalizeActivityOrAccommodationLocation(
      normalizeGeoPlace(block.location, "")
    );
    return {
      ...base,
      location: loc,
    };
  });

  return { itineraryBlocks, creativeTripName };
}
