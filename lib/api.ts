const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function fetchNearbyStores(lat: number, lng: number) {
  const res = await fetch(`${BASE}/api/kroger/stores?lat=${lat}&lng=${lng}`);
  return res.json();
}

export async function fetchNearbyGroceryStores(lat: number, lng: number, locationLabel?: string) {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  });
  if (locationLabel) params.set('location', locationLabel);

  const res = await fetch(`${BASE}/api/grocery/stores?${params}`);
  return res.json();
}

export async function searchGroceries(query: string, locationId: string) {
  const res = await fetch(
    `${BASE}/api/kroger/search?q=${encodeURIComponent(query)}&locationId=${locationId}`,
  );
  return res.json();
}
