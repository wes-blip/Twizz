import { NextResponse } from "next/server";

export const runtime = "nodejs";

export type PlaceAutocompleteResult = {
  id: string;
  name: string;
  location: string;
  isVIP: boolean;
};

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

/** General Places Autocomplete (not limited to lodging) for activities, areas, and logistics endpoints. */
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
      }),
    });

    if (!res.ok) {
      return NextResponse.json([], { status: 500 });
    }

    const data = (await res.json()) as { suggestions?: GoogleSuggestion[] };
    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];

    const results: PlaceAutocompleteResult[] = suggestions
      .filter((s): s is GoogleSuggestion & { placePrediction: NonNullable<GoogleSuggestion["placePrediction"]> } =>
        Boolean(s?.placePrediction?.placeId && s?.placePrediction?.structuredFormat?.mainText?.text)
      )
      .map((s) => {
        const pp = s.placePrediction!;
        const name = pp.structuredFormat!.mainText!.text ?? "";
        const location = pp.structuredFormat?.secondaryText?.text ?? "";
        return {
          id: pp.placeId!,
          name,
          location,
          isVIP: false,
        };
      })
      .slice(0, 8);

    return NextResponse.json(results);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
