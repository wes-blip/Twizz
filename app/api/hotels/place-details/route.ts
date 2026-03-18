import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GooglePlaceLocation = {
  latitude?: number;
  longitude?: number;
};

type GooglePlaceResponse = {
  location?: GooglePlaceLocation;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const placeId = url.searchParams.get("placeId")?.trim();
    if (!placeId) {
      return NextResponse.json({ error: "Missing placeId" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Places API not configured" },
        { status: 500 }
      );
    }

    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "location",
        },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("[hotels/place-details]", res.status, err);
      return NextResponse.json(
        { error: "Failed to fetch place details" },
        { status: res.status >= 500 ? 500 : 400 }
      );
    }

    const data = (await res.json()) as GooglePlaceResponse;
    const lat = data?.location?.latitude;
    const lng = data?.location?.longitude;

    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return NextResponse.json(
        { error: "Place has no valid coordinates" },
        { status: 404 }
      );
    }

    return NextResponse.json({ lat, lng });
  } catch (err) {
    console.error("[hotels/place-details]", err);
    return NextResponse.json(
      { error: "Failed to fetch place details" },
      { status: 500 }
    );
  }
}
