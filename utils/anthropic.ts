import { BucketItem, CategoryKey, ResultItem } from '../types';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function fetchCheapFoodOptions(
  location: string,
  category: CategoryKey,
  searchQuery?: string,
  lat?: number,
  lng?: number,
): Promise<ResultItem[]> {
  const response = await fetch(`${BASE_URL}/api/results`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location, category, searchQuery, lat, lng }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error ?? `Server error ${response.status}`);
  }

  return response.json();
}

export async function shareCart(items: BucketItem[]): Promise<{ code: string; webUrl: string; deepLink: string }> {
  const response = await fetch(`${BASE_URL}/api/cart/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) throw new Error('Failed to share cart');
  return response.json();
}

export async function loadSharedCart(code: string): Promise<BucketItem[]> {
  const response = await fetch(`${BASE_URL}/api/cart/${code.toUpperCase()}`);
  if (!response.ok) throw new Error('Cart not found or expired');
  const data = await response.json();
  return data.items;
}
