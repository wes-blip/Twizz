/**
 * Shared types, system prompt, and JSON parsing for Gemini itinerary generation.
 * Used by full-trip and single custom-block routes.
 */

export type ItineraryBlockPayload = {
  id?: string;
  /** YYYY-MM-DD based on trip start date */
  date: string;
  /** YYYY-MM-DD optional check-out for accommodation */
  endDate?: string;
  /** City or area for this leg */
  location: string;
  type: "accommodation" | "activity" | "logistics";
  title: string;
  /** Teaser for card front (accommodation: 2 sentences; others: 3–5 word TLDR) */
  summary?: string;
  /** Full detail for card back */
  description: string;
  /** Optional: for Accommodation blocks, exactly 3 options as "Hotel Name - Vibe" per line */
  recommendations?: string;
};

export const ITINERARY_SYSTEM_INSTRUCTION = `You are an elite travel agent with deep knowledge of destinations, pacing, and group dynamics.

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
summary: 3–5 word TLDR only (e.g. "Airport pickup arranged", "Ferry to island").
description: Exactly one short sentence—practical vibe or note. No paragraphs.

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
- "location": city or area.
- "type": "accommodation" | "activity" | "logistics"
- "title": For accommodation only: exactly "Where to Stay". For activity: hyper-specific real place or experience name per ACTIVITY section—never generic. For logistics: short practical title.
- "summary": Accommodation = two sentences per template (Hotels/Vacation rentals + vibes; "Click in to see..."). Activity = 3–5 word specific TLDR. Logistics = 3–5 word TLDR.
- "description": Accommodation = short generic sentence only (e.g. "Hotels with great vibes available. Click in to see specifically curated recommendations."). Activity = 1–2 short sentences max, dense and specific, no fluff (see ACTIVITY section). Logistics = one short sentence.
- "recommendations": (REQUIRED for type "accommodation" only) string with exactly 3 options, one per line, format "Hotel Name - Vibe". Use \\n between lines. Omit for activity/logistics.

Build a coherent day-by-day flow. Every block: date, location, type, title, summary, description. Accommodation blocks: also endDate and recommendations. For each trip day: 2–3 Activity blocks as distinct optional cards (over-provision model).`;

export const SINGLE_BLOCK_MODE_APPENDIX = `

——— SINGLE CUSTOM BLOCK (MODE OVERRIDE) ———
The user is adding ONE optional block to an existing trip. Return JSON with the same top-level keys: "creativeTripName" (use an empty string "") and "itineraryBlocks" with EXACTLY ONE element.
Ignore instructions about multiple activities per day, building a full trip-wide itinerary, or over-provisioning several cards per day—only produce this single block.
The user message supplies the exact "type", "date", and "endDate" (when accommodation). Your output MUST use those exact "type", "date", and "endDate" values.
LOCATION (CRITICAL): For the block's "location" field, do NOT merely copy the trip destination string. Infer the most specific real neighborhood, district, island, marina, station, or venue area that matches the user's intent and the block type (e.g. named dive shop region for scuba, specific terminal or city pair for logistics). Use the trip destination only as regional context.`;

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
    return {
      date: typeof block.date === "string" ? block.date : "",
      ...(endDate ? { endDate } : {}),
      location: typeof block.location === "string" ? block.location : "",
      type:
        block.type === "accommodation" || block.type === "logistics"
          ? block.type
          : "activity",
      title: typeof block.title === "string" ? block.title : "",
      ...(summary ? { summary } : {}),
      description: typeof block.description === "string" ? block.description : "",
      ...(recommendations ? { recommendations } : {}),
    };
  });

  return { itineraryBlocks, creativeTripName };
}
