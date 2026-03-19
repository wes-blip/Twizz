import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import {
  ITINERARY_SYSTEM_INSTRUCTION,
  SINGLE_BLOCK_MODE_APPENDIX,
  parseJsonFromGemini,
  type ItineraryBlockPayload,
} from "@/lib/itinerary-gemini-shared";

export const runtime = "nodejs";

type CustomBlockRequest = {
  type: "accommodation" | "activity" | "logistics";
  date: string;
  endDate?: string;
  /** Trip destination; regional context only—model must refine location */
  tripDestination: string;
  people: number;
  vibe: string;
  /** User intent: vibe text, activity description, or logistics details */
  intent: string;
  /** Optional structured logistics hints */
  logistics?: {
    mode: string;
    fromLocation: string;
    toLocation: string;
  };
};

function accommodationSummaryFromRecs(recommendations: string, people: number): string {
  const lines = recommendations
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const vibes = lines
    .map((line) => {
      const idx = line.indexOf("-");
      return idx >= 0 ? line.slice(idx + 1).trim() : line;
    })
    .filter(Boolean)
    .slice(0, 3);
  const head = people > 4 ? "Vacation rentals" : "Hotels";
  if (vibes.length >= 3) {
    return `${head} with ${vibes[0]}, ${vibes[1]}, and ${vibes[2]} vibes available. Click in to see specifically curated recommendations.`;
  }
  if (vibes.length === 2) {
    return `${head} with ${vibes[0]} and ${vibes[1]} vibes available. Click in to see specifically curated recommendations.`;
  }
  if (vibes.length === 1) {
    return `${head} with ${vibes[0]} vibes available. Click in to see specifically curated recommendations.`;
  }
  return `${head} with curated stays for this leg. Click in to see specifically curated recommendations.`;
}

function normalizeSingleBlock(body: CustomBlockRequest, raw: ItineraryBlockPayload): ItineraryBlockPayload {
  const people = Number(body.people) || 0;
  const useRentals = people > 4;

  const base: ItineraryBlockPayload = {
    ...raw,
    type: body.type,
    date: body.date.trim(),
    ...(body.type === "accommodation" && body.endDate?.trim()
      ? { endDate: body.endDate.trim() }
      : {}),
  };

  if (body.type === "accommodation") {
    const rec = (base.recommendations || "").trim();
    const desc = useRentals
      ? "Vacation rentals with great vibes available. Click in to see specifically curated recommendations."
      : "Hotels with great vibes available. Click in to see specifically curated recommendations.";
    const summary =
      base.summary && base.summary.includes("Click in to see")
        ? base.summary
        : accommodationSummaryFromRecs(rec, people);
    return {
      ...base,
      title: "Where to Stay",
      description: desc,
      recommendations: rec,
      summary,
    };
  }

  return {
    ...base,
    title: base.title.trim(),
    location: base.location.trim() || body.tripDestination.trim(),
    summary: (base.summary || "").trim(),
    description: (base.description || "").trim(),
  };
}

function validationError(body: CustomBlockRequest, b: ItineraryBlockPayload): string | null {
  if (!b.location?.trim()) return "Generated block missing location";
  if (!b.title?.trim()) return "Generated block missing title";
  if (!b.summary?.trim()) return "Generated block missing summary";
  if (!b.description?.trim()) return "Generated block missing description";
  if (body.type === "accommodation" && !b.recommendations?.trim()) {
    return "Generated accommodation block missing recommendations";
  }
  return null;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  let body: CustomBlockRequest;
  try {
    const json = await request.json();
    const type = json.type;
    if (type !== "accommodation" && type !== "activity" && type !== "logistics") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    const logistics =
      json.logistics && typeof json.logistics === "object"
        ? {
            mode: String((json.logistics as { mode?: string }).mode ?? "").trim(),
            fromLocation: String(
              (json.logistics as { fromLocation?: string }).fromLocation ?? ""
            ).trim(),
            toLocation: String((json.logistics as { toLocation?: string }).toLocation ?? "").trim(),
          }
        : undefined;
    let intent = String(json.intent ?? "").trim();
    if (type === "logistics" && logistics && !intent) {
      intent = `${logistics.mode}: ${logistics.fromLocation} → ${logistics.toLocation}`;
    }
    body = {
      type,
      date: String(json.date ?? "").trim(),
      endDate: typeof json.endDate === "string" ? json.endDate.trim() : undefined,
      tripDestination: String(json.tripDestination ?? "").trim(),
      people: Number(json.people) || 0,
      vibe: String(json.vibe ?? "").trim(),
      intent,
      logistics,
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }
  if (body.type === "accommodation" && !body.endDate) {
    return NextResponse.json({ error: "endDate is required for accommodation" }, { status: 400 });
  }
  if (!body.intent.trim()) {
    return NextResponse.json({ error: "intent is required" }, { status: 400 });
  }
  if (body.type === "logistics") {
    const l = body.logistics;
    if (!l?.mode || !l.fromLocation || !l.toLocation) {
      return NextResponse.json(
        { error: "logistics mode, fromLocation, and toLocation are required" },
        { status: 400 }
      );
    }
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: ITINERARY_SYSTEM_INSTRUCTION + SINGLE_BLOCK_MODE_APPENDIX,
  });

  const payloadForPrompt = {
    type: body.type,
    date: body.date,
    ...(body.endDate ? { endDate: body.endDate } : {}),
    tripDestination: body.tripDestination || "Unknown",
    people: body.people,
    vibe: body.vibe || "general",
    intent: body.intent,
    ...(body.logistics ? { logistics: body.logistics } : {}),
  };

  const userPrompt = `Generate exactly ONE itinerary block for a user adding to an existing trip. Follow ALL bulk itinerary rules (hyper-specific activity titles—not generic; location must be the most specific real area/venue context for the intent, not just repeating tripDestination; description max 1–2 short sentences for activities; logistics one short sentence; accommodation title exactly "Where to Stay" with recommendations template and generic description).

User payload:
${JSON.stringify(payloadForPrompt, null, 2)}

Return ONLY valid minified JSON (no markdown, no code fences). Multi-line strings MUST use \\n—never literal newlines inside quotes.
Shape: { "creativeTripName": "", "itineraryBlocks": [ ONE object with date, location, type, title, summary, description, and for accommodation only endDate and recommendations ] }
Use these exact values in the block: type="${body.type}", date="${body.date}"${
    body.type === "accommodation" && body.endDate ? `, endDate="${body.endDate}"` : ""
  }.`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const text = result.response.text();
    let itineraryBlocks: ItineraryBlockPayload[];
    try {
      const parsed = parseJsonFromGemini(text);
      itineraryBlocks = parsed.itineraryBlocks;
    } catch (parseErr) {
      const parseMessage =
        parseErr instanceof Error ? parseErr.message : "Parse failed";
      return NextResponse.json(
        { error: `Failed to parse itinerary: ${parseMessage}` },
        { status: 502 }
      );
    }

    if (itineraryBlocks.length === 0) {
      return NextResponse.json({ error: "Model returned no blocks" }, { status: 502 });
    }

    const normalized = normalizeSingleBlock(body, itineraryBlocks[0]);
    const invalid = validationError(body, normalized);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 502 });
    }

    const withId = { ...normalized, id: uuidv4() };

    return NextResponse.json({
      creativeTripName: "",
      itineraryBlocks: [withId],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate block";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
