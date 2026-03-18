import { NextResponse } from "next/server";
import { getHotelbedsHeaders, hotelbedsFetch } from "@/lib/hotelbeds";

export const runtime = "nodejs";

const BOOKINGS_URL = "https://api.test.hotelbeds.com/hotel-api/1.0/bookings";

/**
 * Booking (Checkout) step for Hotelbeds APItude flow.
 * Accepts rateKey, calls Hotelbeds Book API, returns confirmation.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { rateKey, adults = 2, children = 0, childAges = [] } = body;

    if (!rateKey || typeof rateKey !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid rateKey" },
        { status: 400 }
      );
    }

    const numAdults = Math.max(1, Math.min(9, Number(adults) || 2));
    const numChildren = Math.max(0, Math.min(9, Number(children) || 0));
    const ages = Array.isArray(childAges) ? childAges.map((a: unknown) => Number(a)) : [];

    const paxes: Array<{ roomId: number; type: string; name: string; surname: string; age?: number }> = [];
    for (let i = 0; i < numAdults; i++) {
      paxes.push({ roomId: 1, type: "AD", name: "Adult", surname: String(i + 1) });
    }
    for (let i = 0; i < numChildren; i++) {
      paxes.push({
        roomId: 1,
        type: "CH",
        name: "Child",
        surname: String(i + 1),
        age: ages[i] ?? 8,
      });
    }

    const headers = {
      ...getHotelbedsHeaders(),
      "Content-Type": "application/json",
    };

    const payload = {
      holder: { name: "Test", surname: "User" },
      rooms: [
        {
          rateKey,
          paxes,
        },
      ],
      clientReference: `TWZ-${Math.floor(Date.now() / 1000)}`,
    };

    const response = await hotelbedsFetch(BOOKINGS_URL, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || (data as { error?: unknown })?.error) {
      console.log(
        "🚨 HOTELBEDS REJECTION REASON:",
        JSON.stringify(data, null, 2)
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: (data as { error?: string })?.error ?? "Booking request failed",
          details: data,
        },
        { status: response.status }
      );
    }

    const booking = (data as { booking?: { reference?: string; supplier?: { name?: string; vatNumber?: string } } })?.booking;
    const confirmationCode = booking?.reference ?? null;
    const supplierName = booking?.supplier?.name ?? "Hotelbeds";
    const supplierVat = booking?.supplier?.vatNumber ?? "ESB28906881";

    return NextResponse.json({
      status: 200,
      confirmationCode,
      bookingStatus: "booked",
      supplierName,
      supplierVat,
      fullResponse: data,
    });
  } catch (err) {
    console.error("[Book API]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Booking failed" },
      { status: 500 }
    );
  }
}
