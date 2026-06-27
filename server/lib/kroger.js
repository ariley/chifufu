// Use certification environment until production access is granted
const KROGER_BASE = process.env.KROGER_ENV === 'production'
  ? 'https://api.kroger.com/v1'
  : 'https://api-ce.kroger.com/v1';

// Token cache — Kroger tokens last 30 minutes
let _token = null;
let _tokenExpiresAt = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiresAt - 60_000) return _token;

  const clientId = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('KROGER_CLIENT_ID / KROGER_CLIENT_SECRET not set');

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${KROGER_BASE}/connect/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=product.compact',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Kroger auth failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  _token = data.access_token;
  _tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return _token;
}

// Find the nearest Kroger-family store — returns { locationId, name, address, distMi }
async function findNearestStore(lat, lng, radiusMiles = 10) {
  const token = await getToken();
  const params = new URLSearchParams({
    'filter.latLong.near': `${lat},${lng}`,
    'filter.radiusInMiles': String(radiusMiles),
    'filter.limit': '5',
  });

  const res = await fetch(`${KROGER_BASE}/locations?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;

  const data = await res.json();
  const stores = data.data ?? [];
  if (stores.length === 0) return null;

  return stores.map(s => ({
    locationId: s.locationId,
    name: s.name,
    chain: s.chain,
    address: [s.address?.addressLine1, s.address?.city, s.address?.state].filter(Boolean).join(', '),
    lat: s.geolocation?.latitude,
    lng: s.geolocation?.longitude,
  }));
}

// Search products — locationId filter only works in production (cert env has no per-store inventory)
async function searchProducts(query, locationId, limit = 20) {
  const token = await getToken();
  const inProd = process.env.KROGER_ENV === 'production';
  const params = new URLSearchParams({
    'filter.term': query,
    'filter.limit': String(limit),
  });
  if (inProd && locationId) {
    params.set('filter.locationId', locationId);
    params.set('filter.fulfillment', 'ais');
  }

  const res = await fetch(`${KROGER_BASE}/products?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return [];

  const data = await res.json();
  return (data.data ?? []).map(p => {
    const item = p.items?.[0] ?? {};
    const regularPrice = item.price?.regular;
    const promoPrice = item.price?.promo;
    const price = promoPrice && promoPrice < regularPrice ? promoPrice : regularPrice;
    const onSale = promoPrice && promoPrice < regularPrice;
    const size = item.size ?? '';

    return {
      id: p.productId,
      upc: p.upc,
      name: p.description,
      brand: p.brand ?? '',
      size,
      price: price != null ? `$${price.toFixed(2)}` : null,
      priceValue: price ?? null,
      regularPrice: regularPrice != null ? `$${regularPrice.toFixed(2)}` : null,
      onSale,
      savings: onSale ? `$${(regularPrice - promoPrice).toFixed(2)} off` : null,
      imageUrl: p.images?.find(i => i.perspective === 'front')?.sizes?.find(s => s.size === 'medium')?.url ?? null,
      badges: [
        onSale && 'sale',
        p.brand?.toLowerCase().includes('kroger') && 'store brand',
      ].filter(Boolean),
    };
  })
  .filter(p => p.priceValue != null)
  .sort((a, b) => a.priceValue - b.priceValue);
}

module.exports = { findNearestStore, searchProducts };
