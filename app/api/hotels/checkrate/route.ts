import { NextResponse } from "next/server";
import { getHotelbedsHeaders, hotelbedsFetch } from "@/lib/hotelbeds";

export const runtime = "nodejs";

/**
 * CheckRate (Quote) step for Hotelbeds APItude flow.
 * Accepts rateKey from Availability step and returns confirmed quote.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { rateKey, previousPrice } = body;

    if (!rateKey || typeof rateKey !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid rateKey" },
        { status: 400 }
      );
    }

    const headers = {
      ...getHotelbedsHeaders(),
      "Content-Type": "application/json",
    };

    const response = await hotelbedsFetch("https://api.test.hotelbeds.com/hotel-api/1.0/checkrates", {
      method: "POST",
      headers,
      body: JSON.stringify({ rooms: [{ rateKey }] }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      hotel?: {
        rooms?: Array<{
          rates?: Array<{
            rateKey?: string;
            net?: number;
            cancellationPolicies?: unknown;
          }>;
        }>;
        totalNet?: number;
      };
    };

    if (!response.ok) {
      return NextResponse.json(
        { error: (data as { error?: string })?.error ?? "CheckRate failed" },
        { status: response.status }
      );
    }

    const updatedHotel = data.hotel;
    const newRate = updatedHotel?.rooms?.[0]?.rates?.[0];
    const newRateKey = newRate?.rateKey ?? rateKey;
    const newPrice =
      newRate?.net ?? updatedHotel?.totalNet ?? null;
    const cancellationPolicies = newRate?.cancellationPolicies ?? null;

    console.log("[CheckRate] price changed?", {
      requestedRateKey: rateKey,
      newRateKey,
      newPrice,
      previousPrice: previousPrice ?? "(unknown)",
      changed:
        previousPrice != null && newPrice != null
          ? previousPrice !== newPrice
          : "(unknown)",
    });

    return NextResponse.json({
      status: 200,
      price: newPrice,
      rateKey: newRateKey,
      rateType: "BOOKABLE",
      cancellationPolicies,
    });
  } catch (err) {
    console.error("[CheckRate]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "CheckRate failed" },
      { status: 500 }
    );
  }
}
