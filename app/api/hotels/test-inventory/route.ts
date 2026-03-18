import { NextResponse } from 'next/server';
import { getHotelbedsHeaders } from '@/lib/hotelbeds';

export async function GET() {
  const headers = getHotelbedsHeaders();
  const response = await fetch(
    'https://api.test.hotelbeds.com/hotel-content-api/1.0/hotels?fields=all&from=1&to=20&language=ENG',
    { headers }
  );
  const data = await response.json();

  const mappedHotels = data.hotels.map((h: { code: string; name: { content: string }; destinationCode: string; coordinates?: { latitude?: number; longitude?: number } }) => ({
    id: h.code,
    name: h.name.content,
    destination: h.destinationCode,
    lat: h.coordinates?.latitude,
    lng: h.coordinates?.longitude,
  }));

  return NextResponse.json({ total: data.total, hotels: mappedHotels });
}
