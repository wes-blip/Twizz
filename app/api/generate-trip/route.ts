import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import {
  ITINERARY_SYSTEM_INSTRUCTION,
  parseJsonFromGemini,
  type ItineraryBlockPayload,
} from "@/lib/itinerary-gemini-shared";

export const runtime = "nodejs";

type FormDataPayload = {
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
    systemInstruction: ITINERARY_SYSTEM_INSTRUCTION,
  });

  const userPrompt = `Plan a trip with these details (use them to shape the itinerary and accommodation suggestions):
${JSON.stringify(formData, null, 2)}

Return ONLY valid minified JSON (no markdown, no code fences). Multi-line strings MUST use \\n—never literal newlines inside quotes. JSON with:
1. "creativeTripName": catchy 3–4 word trip name (destination + vibe).
2. "itineraryBlocks": each block has date, location, type, title, summary, description; Accommodation blocks also have "recommendations" (exactly 3 lines, "Hotel Name - Vibe" per line). Accommodation: summary = two sentences; description = short generic text only; recommendations = the 3 hotel options. Activity: 2–3 blocks per trip day, hyper-specific real titles (no generic labels), summary = 3–5 word TLDR, description = 1–2 short sentences max, aligned with vibe + destination. Logistics: summary = 3–5 word TLDR; description = one short sentence. Accommodation blocks must include date, endDate, and recommendations.`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
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
