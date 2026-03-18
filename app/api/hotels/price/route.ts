import { NextResponse } from "next/server";
import { getHotelbedsHeaders, hotelbedsFetch } from "@/lib/hotelbeds";

export const runtime = "nodejs";

type HotelbedsOfferOrRate = {
  rateKey?: string;
  rateType?: string;
  net?: number;
  cancellationPolicies?: unknown[];
  [key: string]: unknown;
};

type HotelbedsRoom = {
  rates?: HotelbedsOfferOrRate[];
  [key: string]: unknown;
};

type HotelbedsHotel = {
  name?: string;
  minRate?: number;
  currency?: string;
  rooms?: HotelbedsRoom[];
  offers?: HotelbedsOfferOrRate[];
  rates?: HotelbedsOfferOrRate[];
  [key: string]: unknown;
};

type HotelbedsResponse = {
  hotels?: {
    hotels?: HotelbedsHotel[];
  };
};

/** APItude path: hotel.rooms[0].rates[0] for rateKey, rateType, cancellationPolicies, net */
function extractRateFromHotel(hotel: HotelbedsHotel) {
  const firstRoom = hotel.rooms?.[0];
  const firstRate = firstRoom?.rates?.[0];

  // Make sure this line exists!
  const rateKey = firstRate?.rateKey ?? null;

  const rateType = firstRate?.rateType ?? "UNKNOWN";

  const cancellationPolicies = firstRate?.cancellationPolicies ?? null;
  const price = firstRate?.net ?? hotel.minRate;

  return { firstRate, rateKey, rateType, cancellationPolicies, price };
}

async function fetchGuaranteedTestPrice(
  checkIn: string,
  checkOut: string,
  occupancy: { rooms: number; adults: number; children: number; paxes?: Array<{ type: string; age: number }> },
  headers: Record<string, string>
) {
  const fallbackPayload = {
    stay: { checkIn, checkOut },
    occupancies: [occupancy],
    hotels: { hotel: [1, 10, 20, 30, 40, 50, 60] },
  };
  const res = await hotelbedsFetch(
    "https://api.test.hotelbeds.com/hotel-api/1.0/hotels",
    {
      method: "POST",
      headers,
      body: JSON.stringify(fallbackPayload),
    }
  );
  return res.json() as Promise<HotelbedsResponse>;
}

export async function POST(request: Request) {
  try {
    const { lat, lng, hotelName, checkIn, checkOut, adults = 2, children = 0, childAges = [] } = await request.json();

    const occupancy: { rooms: number; adults: number; children: number; paxes?: Array<{ type: string; age: number }> } = {
      rooms: 1,
      adults: Number(adults) || 2,
      children: Number(children) || 0,
    };
    if (occupancy.children > 0 && Array.isArray(childAges)) {
      occupancy.paxes = childAges.map((age: unknown) => ({
        type: "CH",
        age: Number(age),
      }));
    }

    const payload = {
      stay: {
        checkIn,
        checkOut,
      },
      occupancies: [occupancy],
      geolocation: {
        latitude: Number(lat),
        longitude: Number(lng),
        radius: 5,
        unit: "km",
      },
    };

    const headers = {
      ...getHotelbedsHeaders(),
      "Content-Type": "application/json",
    };
    const response = await hotelbedsFetch(
      "https://api.test.hotelbeds.com/hotel-api/1.0/hotels",
      {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }
    );

    const data = (await response.json()) as HotelbedsResponse;

    if (!data.hotels?.hotels || data.hotels.hotels.length === 0) {
      console.log("Radius search empty. Triggering guaranteed sandbox fallback...");
      const fallbackData = await fetchGuaranteedTestPrice(checkIn, checkOut, occupancy, headers);
      if (!fallbackData.hotels?.hotels || fallbackData.hotels.hotels.length === 0) {
        return NextResponse.json(
          { error: "Even the guaranteed fallback failed. Check dates or API keys." },
          { status: 500 }
        );
      }
      const fbHotel = fallbackData.hotels.hotels[0];
      const { rateKey, rateType, cancellationPolicies, price } = extractRateFromHotel(fbHotel);
      console.log("Extracted Rate Data:", { rateKey, rateType });
      return NextResponse.json({
        status: 200,
        price,
        currency: fbHotel.currency,
        name: fbHotel.name,
        rateKey,
        rateType,
        cancellationPolicies,
        isFallback: true,
      });
    }

    const hotels = data.hotels.hotels;
    const searchName = typeof hotelName === "string" ? hotelName.trim().toLowerCase() : "";

    const matchedHotel = searchName
      ? hotels.find((h) => (h.name ?? "").toLowerCase().includes(searchName))
      : null;

    const hotel = matchedHotel ?? hotels[0];
    const { rateKey, rateType, cancellationPolicies, price } = extractRateFromHotel(hotel);
    console.log("Extracted Rate Data:", { rateKey, rateType });
    return NextResponse.json({
      status: 200,
      price,
      currency: hotel.currency,
      name: hotel.name,
      rateKey,
      rateType,
      cancellationPolicies,
      isFallback: false,
    });
  } catch (err) {
    console.error("[hotels/price]", err);
    return NextResponse.json(
      { error: "Failed to fetch hotel availability" },
      { status: 500 }
    );
  }
}
