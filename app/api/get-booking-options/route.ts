import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

type ItineraryBlock = {
  type: string;
  title: string;
  location: string;
  description: string;
  date?: string;
};

type BookingOption = {
  providerName: string;
  url: string;
  why: string;
};

type BookingOptionsResponse = {
  options: BookingOption[];
};

const SYSTEM_PROMPT = `You are a travel booking concierge that generates exactly ONE hyper-specific Google link per request. You must strictly follow these rules:

1. OUTPUT EXACTLY ONE (1) booking option. Return an "options" array with exactly one item. Do not generate multiple or redundant links.

2. EXTRACT THE EXACT ENTITY NAME: Read block.title and block.description carefully to identify the EXACT name of the specific hotel, tour, transit provider, or venue (e.g., "Trunk Hotel Tokyo", "Belize City Water Taxi", "Shinkansen", "Tokyo Skytree"). Do NOT use generic terms like "hotel in Tokyo" or "tours in Belize". The entity name must be the precise business or service name mentioned in the block.

3. DO NOT recommend generic homepages (e.g., booking.com, tripadvisor.com, expedia.com) or generic location searches. Only output one Google-based link that targets the EXACT specific entity.

4. BUILD A HIGHLY TARGETED URL: The URL must be a Google Search or Google Travel link for that EXACT entity and block.date. Format examples:
   - Google Search: https://www.google.com/search?q=[Exact+Entity+Name]+[Location]+tickets+[Date] (spaces as +, include the exact name from block.title/description, block.location, and block.date).
   - Google Hotels (accommodations only): https://www.google.com/travel/search?q=[Exact+Hotel+Name]+[Location] (use the exact hotel name from the block, not a generic area search).
   Never return a link that would yield generic results; the query must uniquely identify the specific entity.

5. Each option must have: providerName (e.g., "Google Search" or "Google Hotels"), url (the single buildable URL), and why (a short sentence noting the link targets their specific entity and dates).

6. The "why" string must mention that the link is pre-loaded with the specific entity name and dates for easy comparison.

Return only valid JSON with an "options" array containing exactly one item. No generic OTA links. No redundant or multiple options.`;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  let block: ItineraryBlock;
  try {
    const body = await request.json();
    block = {
      type: String(body.type ?? ""),
      title: String(body.title ?? ""),
      location: String(body.location ?? ""),
      description: String(body.description ?? ""),
      date: body.date != null ? String(body.date) : undefined,
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
  });

  const userPrompt = `Analyze this itinerary block and return the best booking options as JSON with an "options" array:\n\n${JSON.stringify(block, null, 2)}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const text = result.response.text();
    let parsed: BookingOptionsResponse;

    try {
      const raw = String(text ?? "").trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/m, "")
        .trim();
      parsed = JSON.parse(raw) as BookingOptionsResponse;
    } catch {
      return NextResponse.json(
        { error: "Failed to parse booking options from AI response" },
        { status: 502 }
      );
    }

    if (!Array.isArray(parsed.options)) {
      return NextResponse.json(
        { error: "AI response missing options array" },
        { status: 502 }
      );
    }

    const options: BookingOption[] = parsed.options
      .slice(0, 1)
      .filter(
        (o): o is BookingOption =>
          typeof o?.providerName === "string" &&
          typeof o?.url === "string" &&
          typeof o?.why === "string"
      )
      .map((o) => ({
        providerName: o.providerName,
        url: o.url,
        why: o.why,
      }));

    return NextResponse.json({ options });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to get booking options";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
