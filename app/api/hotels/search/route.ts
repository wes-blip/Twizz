import { NextResponse } from "next/server";

export const runtime = "nodejs";

export type HotelSearchResult = {
  id: string;
  name: string;
  location: string;
  isVIP: boolean;
};

/** Fora partner names (substring match on suggestion name → isVIP) */
const VIP_HOTELS = [
  "St. Regis",
  "Grand Velas",
  "Four Seasons",
  "Aman",
  "Rosewood",
  "One&Only",
  "Viceroy",
  "Las Ventanas",
];

type GoogleSuggestion = {
  placePrediction?: {
    placeId?: string;
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
  };
};

function getQueryFromRequest(request: Request): string {
  const url = new URL(request.url);
  const q = url.searchParams.get("query");
  if (typeof q === "string") return q.trim();
  return "";
}

export async function GET(request: Request) {
  try {
    const query = getQueryFromRequest(request);

    if (!query) {
      return NextResponse.json([]);
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json([], { status: 500 });
    }

    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({
        input: query,
        includedPrimaryTypes: ["hotel", "resort_hotel", "lodging"],
      }),
    });

    if (!res.ok) {
      return NextResponse.json([], { status: 500 });
    }

    const data = (await res.json()) as { suggestions?: GoogleSuggestion[] };
    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];

    const results: HotelSearchResult[] = suggestions
      .filter((s): s is GoogleSuggestion & { placePrediction: NonNullable<GoogleSuggestion["placePrediction"]> } =>
        Boolean(s?.placePrediction?.placeId && s?.placePrediction?.structuredFormat?.mainText?.text)
      )
      .map((s) => {
        const pp = s.placePrediction!;
        const name = pp.structuredFormat!.mainText!.text ?? "";
        const location = pp.structuredFormat?.secondaryText?.text ?? "";
        const isVIP = VIP_HOTELS.some((vip) => name.includes(vip));
        return {
          id: pp.placeId!,
          name,
          location,
          isVIP,
        };
      })
      .slice(0, 5);

    return NextResponse.json(results);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
