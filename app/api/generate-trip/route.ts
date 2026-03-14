import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";

export const runtime = "nodejs";

type FormDataPayload = {
  destination: string;
  startDate: string;
  endDate: string;
  people: number;
  vibe: string;
};

type ItineraryBlock = {
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
  /** Full detail for card back (accommodation: hotel names + vibes; others: 1-sentence vibe) */
  description: string;
};

/**
 * Strips markdown code fences and stray backticks, then parses JSON.
 * Uses try/catch and multiple fallback strategies for robustness.
 */
function parseJsonFromGemini(text: string): { itineraryBlocks: ItineraryBlock[]; creativeTripName: string } {
  let raw = String(text ?? "").trim();

  // Bulletproof markdown strip: remove all ```json and ``` so we never parse code fences
  const cleanedResponse = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  raw = cleanedResponse;

  // Strip any remaining leading/trailing backticks that snuck through
  raw = raw.replace(/^`+|`+$/g, "").trim();

  function tryParse(s: string): unknown {
    return JSON.parse(s);
  }

  function repairUnescapedNewlinesInStrings(s: string): string {
    // Fix unescaped literal newlines inside double-quoted JSON strings (common LLM mistake)
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
      // Fallback: try to extract first {...} substring and parse (optionally with newline repair)
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

  // Normalize each block to ensure required fields exist as strings
  const itineraryBlocks: ItineraryBlock[] = blocks.map((b: unknown) => {
    const block = b as Record<string, unknown>;
    const endDate = typeof block.endDate === "string" ? block.endDate.trim() : undefined;
    const summary = typeof block.summary === "string" ? block.summary.trim() : undefined;
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
    };
  });

  return { itineraryBlocks, creativeTripName };
}

const SYSTEM_INSTRUCTION = `You are an elite travel agent with deep knowledge of destinations, pacing, and group dynamics.

——— JSON OUTPUT (UNBREAKABLE) ———
You MUST return ONLY valid, minified JSON. No markdown (no \`\`\`json or code fences). No explanation, preamble, or text before or after the JSON. Returning valid JSON is required. For any multi-line strings (e.g. accommodation description), you MUST use escaped newline characters (\\n) inside the string—never literal line breaks inside quoted strings, or parsing will fail.

The JSON object must have exactly two top-level keys: "creativeTripName" (string) and "itineraryBlocks" (array).

——— creativeTripName ———
A catchy, evocative trip name in 3–4 words max using destination and vibe. Examples: "Cabo Sunny Escape", "Paris Romance Affair". Do NOT use generic names like "My Trip".

——— PROGRESSIVE DISCLOSURE: summary (card front) vs description (card back) ———
Every block MUST have both "summary" and "description". Use escaped newlines (\\n) in strings; never literal line breaks inside JSON strings.

——— ACCOMMODATION ———
summary (STRICTLY two sentences): Replace the bracketed variables with the actual vibes of the chosen hotels.
Template: "Hotels with [vibe 1], [vibe 2], and [vibe 3] vibes available. Click in to see specifically curated recommendations."
If group size (people) > 4, use "Vacation rentals" instead of "Hotels" in that sentence.

description (the inside / edit view): STRICTLY hotel names and vibes, one per line, then the instruction line. Format:
[Hotel 1] - [vibe 1]
[Hotel 2] - [vibe 2]
[Hotel 3] - [vibe 3]
\\nFind pricing by searching these or others.

Example description (use \\n before "Find pricing"):
Piccolo - local vibes
Cheval - pure luxury
Paso Robles Inn - lower cost option
\\nFind pricing by searching these or others.

Adjust recommendations for group size: hotels for <=4 people, Vrbos/villas for >4 people. No extra words in description—only name and 1-3 word vibe per line.

——— ACTIVITY / DINING / LOGISTICS (other blocks) ———
summary: A 3–5 word TLDR only (e.g. "Sunset acoustic sailing", "Speakeasy craft cocktails").
description: Exactly one short sentence—the vibe detail. No paragraphs or history.
Examples: description "Chill acoustic vibes with open bar." or "Dark, moody, craft cocktails."

——— Accommodation block (traveler count) ———
Use the "people" field. If people <= 4, recommend HOTELS only. If people > 4, recommend LARGE VACATION RENTALS / VRBO-style properties only. Never mix.

——— Accommodation block title ———
For accommodation blocks, set "title" to exactly "Where to Stay". No hotel names in the title.

——— Activity count ———
Minimum 3, maximum 10 Activity blocks total for the entire itinerary. Curate only the best; do not fill every hour.

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
- "title": short title. For accommodation only: exactly "Where to Stay".
- "summary": Accommodation = two sentences per template (Hotels/Vacation rentals + vibes; "Click in to see..."). Activity/logistics = 3–5 word TLDR.
- "description": Accommodation = [Name] - [vibe] per line, then \\nFind pricing by searching these or others. Activity/logistics = one short sentence, vibe only.

Build a coherent day-by-day flow. Every block: date, location, type, title, summary, description. Accommodation blocks: also endDate.`;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  let formData: FormDataPayload;
  try {
    const body = await request.json();
    formData = {
      destination: String(body.destination ?? ""),
      startDate: String(body.startDate ?? ""),
      endDate: String(body.endDate ?? ""),
      people: Number(body.people) || 0,
      vibe: String(body.vibe ?? ""),
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const userPrompt = `Plan a trip with these details (use them to shape the itinerary and accommodation suggestions):
${JSON.stringify(formData, null, 2)}

Return ONLY valid minified JSON (no markdown, no code fences). Multi-line strings MUST use \\n—never literal newlines inside quotes. JSON with:
1. "creativeTripName": catchy 3–4 word trip name (destination + vibe).
2. "itineraryBlocks": each block has date, location, type, title, summary, description. Accommodation: summary = two sentences (Hotels/Vacation rentals + vibes; "Click in to see..."); description = [Name] - [vibe] per line, then \\nFind pricing by searching these or others. Activity/logistics: summary = 3–5 word TLDR; description = one short sentence. Accommodation blocks must include date and endDate.`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const text = result.response.text();
    let itineraryBlocks: ItineraryBlock[];
    let creativeTripName: string;
    try {
      const parsed = parseJsonFromGemini(text);
      itineraryBlocks = parsed.itineraryBlocks;
      creativeTripName = parsed.creativeTripName;
    } catch (parseErr) {
      const parseMessage =
        parseErr instanceof Error ? parseErr.message : "Parse failed";
      return NextResponse.json(
        { error: `Failed to parse itinerary: ${parseMessage}` },
        { status: 502 }
      );
    }

    const withIds = itineraryBlocks.map((block) => ({
      ...block,
      id: uuidv4(),
    }));

    return NextResponse.json({
      itineraryBlocks: withIds,
      creativeTripName: creativeTripName || undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate itinerary";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
