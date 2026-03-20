import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import {
  ITINERARY_SYSTEM_INSTRUCTION,
  ITINERARY_TRIP_RESPONSE_SCHEMA,
  buildFullTripOriginRoutingRule,
  parseJsonFromGemini,
  type ItineraryBlockPayload,
} from "@/lib/itinerary-gemini-shared";

export const runtime = "nodejs";

type FormDataPayload = {
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  people: number;
  vibe: string;
};

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  let formData: FormDataPayload;
  let originForRouting: string;
  try {
    const body = await request.json();
    const {
      origin,
      destination,
      startDate,
      endDate,
      people,
      vibe,
    } = body as Record<string, unknown>;
    const originTrimmed =
      typeof origin === "string" && origin.trim() ? origin.trim() : "";
    originForRouting = originTrimmed || "Unknown Origin";
    formData = {
      origin: originForRouting,
      destination: String(destination ?? ""),
      startDate: String(startDate ?? ""),
      endDate: String(endDate ?? ""),
      people: Number(people) || 0,
      vibe: String(vibe ?? ""),
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!formData.destination.trim()) {
    return NextResponse.json(
      { error: "Destination is required" },
      { status: 400 }
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const systemInstruction = `${ITINERARY_SYSTEM_INSTRUCTION}\n\n${buildFullTripOriginRoutingRule(originForRouting)}`;
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction,
  });

  const userPrompt = `Plan a trip with these details (use them to shape the itinerary and accommodation suggestions):
${JSON.stringify(formData, null, 2)}

Return ONLY valid minified JSON (no markdown, no code fences). Multi-line strings MUST use \\n—never literal newlines inside quotes. JSON with:
1. "creativeTripName": catchy 3–4 word trip name (destination + vibe).
2. "itineraryBlocks": each block MUST include "location", "startLocation", and "endLocation" (each { "name", "lat", "lng" }; optional "placeId": ""). Per system instruction: for activity/accommodation duplicate the same geo into all three; for logistics use real endpoints and set "location" = "startLocation". Obey STRICT LOGISTICS & ROUTING RULES and ORIGIN-LOCKED LOGISTICS in the system message—no separate Activity for airport arrival; one Logistics per journey with both endpoints. First outbound leg: origin from JSON "origin" → destination airport. Accommodation blocks also have "recommendations" (exactly 3 lines, "Hotel Name - Vibe" per line), endDate, and date. Accommodation: summary = two sentences; description = short generic text only; recommendations = the 3 hotel options. Activity: 2–3 blocks per trip day, hyper-specific real titles (no generic labels), summary = 3–5 word TLDR, description = 1–2 short sentences max, aligned with vibe + destination. Logistics: summary = 3–5 word TLDR; description = one short sentence. Follow system instruction CRITICAL SPATIAL REQUIREMENT for all coordinates and venue names.`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: ITINERARY_TRIP_RESPONSE_SCHEMA,
      },
    });

    const text = result.response.text();
    let itineraryBlocks: ItineraryBlockPayload[];
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
