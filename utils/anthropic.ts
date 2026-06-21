import { CategoryKey, ResultItem } from '../types';

// In development, point at your local server. In production, set this to your Railway URL.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function fetchCheapFoodOptions(
  location: string,
  category: CategoryKey,
  searchQuery?: string,
): Promise<ResultItem[]> {
  const response = await fetch(`${BASE_URL}/api/results`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location, category, searchQuery }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error ?? `Server error ${response.status}`);
  }

  return response.json();
}
