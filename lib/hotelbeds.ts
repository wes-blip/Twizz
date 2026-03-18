import crypto from 'crypto';

export function getHotelbedsHeaders() {
  const apiKey = process.env.HOTELBEDS_HOTEL_API_KEY;
  const secret = process.env.HOTELBEDS_HOTEL_SECRET;

  if (!apiKey || !secret) {
    throw new Error(
      'Missing Hotelbeds credentials: HOTELBEDS_HOTEL_API_KEY and HOTELBEDS_HOTEL_SECRET must be set in .env.local'
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash('sha256')
    .update(apiKey + secret + timestamp)
    .digest('hex');

  return {
    'Api-key': apiKey,
    'X-Signature': signature,
    Accept: 'application/json',
  };
}

/**
 * Audit wrapper for Hotelbeds API calls. Satisfies Technical Rule 1 (Accept-Encoding: gzip)
 * and logs Endpoint, Method, X-Signature, Request Body, and Status Code for APItude certification.
 */
export async function hotelbedsFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase();
  const body = options.body ?? null;
  const headers = new Headers(options.headers ?? undefined);
  headers.set('Accept-Encoding', 'gzip');
  const xSignature = headers.get('X-Signature') ?? headers.get('x-signature') ?? '(not set)';

  const requestBody =
    body == null ? undefined : typeof body === 'string' ? body : '[Body]';
  console.log('[Hotelbeds Audit]', {
    Endpoint: url,
    Method: method,
    'X-Signature': xSignature,
    'Request Body': requestBody,
  });

  const response = await fetch(url, { ...options, headers });
  console.log('[Hotelbeds Audit]', {
    Endpoint: url,
    'Status Code': response.status,
  });
  return response;
}
