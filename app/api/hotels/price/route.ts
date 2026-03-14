import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const googlePlaceId = searchParams.get("googlePlaceId") ?? "";
  const checkIn = searchParams.get("checkIn") ?? "";
  const checkOut = searchParams.get("checkOut") ?? "";

  if (!googlePlaceId) {
    return NextResponse.json({ error: "Missing googlePlaceId" }, { status: 400 });
  }

  // Mock: return a random realistic price (400–1200) until RateHawk is integrated.
  const price = Math.floor(400 + Math.random() * (1200 - 400 + 1));

  return NextResponse.json({ price });
}
