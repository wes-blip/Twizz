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
  description: string;
};

/**
 * Strips markdown code fences and stray backticks, then parses JSON.
 * Uses try/catch and multiple fallback strategies for robustness.
 */
function parseJsonFromGemini(text: string): { itineraryBlocks: ItineraryBlock[] } {
  let raw = String(text ?? "").trim();

  // Remove markdown code fences (```json ... ``` or ``` ... ```)
  raw = raw.replace(/^```(?:json)?\s*/i, "");
  raw = raw.replace(/\s*```$/m, "");
  raw = raw.trim();

  // If still wrapped in a single fence block, extract inner content
  const fenceMatch = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  if (fenceMatch) {
    raw = fenceMatch[1].trim();
  }

  // Strip any remaining leading/trailing backticks that snuck through
  raw = raw.replace(/^`+|`+$/g, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fallback: try to extract first {...} or [...] substring and parse
    const objectMatch = raw.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        parsed = JSON.parse(objectMatch[0]);
      } catch {
        throw new Error("Could not parse JSON from model response");
      }
    } else {
      throw new Error("Could not parse JSON from model response");
    }
  }

  const obj = parsed as { itineraryBlocks?: unknown };
  const blocks = obj.itineraryBlocks;
  if (!Array.isArray(blocks)) {
    throw new Error("Response missing itineraryBlocks array");
  }

  // Normalize each block to ensure required fields exist as strings
  const itineraryBlocks: ItineraryBlock[] = blocks.map((b: unknown) => {
    const block = b as Record<string, unknown>;
    const endDate = typeof block.endDate === "string" ? block.endDate.trim() : undefined;
    return {
      date: typeof block.date === "string" ? block.date : "",
      ...(endDate ? { endDate } : {}),
      location: typeof block.location === "string" ? block.location : "",
      type:
        block.type === "accommodation" || block.type === "logistics"
          ? block.type
          : "activity",
      title: typeof block.title === "string" ? block.title : "",
      description: typeof block.description === "string" ? block.description : "",
    };
  });

  return { itineraryBlocks };
}

const SYSTEM_INSTRUCTION = `You are an elite travel agent with deep knowledge of destinations, pacing, and group dynamics.

You must respond with a single valid JSON object only—no markdown, no code fences, no explanation before or after.

The JSON object must have exactly one top-level key: "itineraryBlocks", whose value is an array.

STRICT RULE — Activity count: You must generate a minimum of 3 and a strict maximum of 10 Activity blocks total for the entire itinerary, regardless of how many days the trip is. Focus on high-quality, anchor experiences rather than filling every hour of the day. Do not generate multiple minor activities per day; curate only the best.

STRICT RULE — Accommodation (Fora Partner / luxury consortium): When recommending accommodations, you MUST prioritize properties that are part of luxury travel advisor networks (e.g., Virtuoso, Four Seasons Preferred, Rosewood Elite, Belmond Bellini, Hyatt Privé, Marriott Stars) or highly-rated independent boutique hotels. The user acts as a VIP travel advisor, so these specific partner properties are strictly preferred over generic chain hotels or budget options. For every accommodation block, ensure the title explicitly mentions the specific hotel name (e.g., "Four Seasons Resort Maui at Wailea" not "Luxury resort in Maui").

Each element of itineraryBlocks must be an object with:
- "date": string in YYYY-MM-DD format. Compute each block's date from the trip's startDate to endDate in the user message; assign blocks to calendar days in order so the itinerary is date-specific and multi-leg aware. For accommodation blocks, you may include an "endDate" (YYYY-MM-DD) for check-out when the stay spans multiple days.
- "location": string — city or area where this block takes place (may repeat or change per leg).
- "type": one of "accommodation", "activity", "logistics"
- "title": short, compelling title for the block. For accommodation blocks, the title MUST include the specific hotel/property name.
- "description": practical, specific details. For accommodations, prefer luxury advisor partner properties (Virtuoso, Four Seasons Preferred, Rosewood Elite, Belmond Bellini, Hyatt Privé, Marriott Stars) or top boutique hotels. If the traveler group size is greater than 4, consider VRBO or Airbnb-style stays only when they clearly outperform available partner hotels.

Build a coherent day-by-day flow that matches the trip length and vibe given in the user message. Every block must include date, location, type, title, and description.`;

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

Return only the JSON object with itineraryBlocks as specified. Each block must have date (YYYY-MM-DD from startDate to endDate), location, type, title, and description. Accommodation blocks may include endDate for check-out.`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const text = result.response.text();
    let itineraryBlocks: ItineraryBlock[];
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

    const withIds = itineraryBlocks.map((block) => ({
      ...block,
      id: uuidv4(),
    }));

    return NextResponse.json(withIds);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate itinerary";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
