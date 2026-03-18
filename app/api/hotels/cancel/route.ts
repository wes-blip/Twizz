import { NextResponse } from "next/server";
import { getHotelbedsHeaders, hotelbedsFetch } from "@/lib/hotelbeds";

export const runtime = "nodejs";

/**
 * Cancellation (void) for test bookings. Fulfills Hotelbeds certification Rule 6.2.
 * DELETE /api/hotels/cancel?reference=XXX
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get("reference");

    if (!reference) {
      return NextResponse.json(
        { error: "Missing reference (confirmation code)" },
        { status: 400 }
      );
    }

    const headers = getHotelbedsHeaders();
    const url = `https://api.test.hotelbeds.com/hotel-api/1.0/bookings/${reference}?cancellationFlag=CANCELLATION`;

    const response = await hotelbedsFetch(url, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: (data as { error?: string })?.error ?? "Cancellation failed",
          details: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      status: 200,
      message: "Booking cancelled successfully",
      reference,
    });
  } catch (err) {
    console.error("[hotels/cancel]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cancellation failed" },
      { status: 500 }
    );
  }
}
