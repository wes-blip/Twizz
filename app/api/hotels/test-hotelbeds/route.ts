import { getHotelbedsHeaders } from '@/lib/hotelbeds';

export async function GET() {
  const headers = getHotelbedsHeaders();

  const response = await fetch(
    'https://api.test.hotelbeds.com/hotel-api/1.0/status',
    { headers }
  );

  const data = await response.json();
  return Response.json(data);
}
