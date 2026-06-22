import { CategoryKey, ResultItem, RouteItem } from "./types";

const BASE = "https://cheap-food-production.up.railway.app";

export async function fetchResults(
  location: string,
  category: CategoryKey,
  searchQuery?: string,
  lat?: number,
  lng?: number
): Promise<ResultItem[]> {
  const res = await fetch(`${BASE}/api/results`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location, category, searchQuery, lat, lng }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Server error ${res.status}`);
  }
  return res.json();
}

export async function shareCart(
  items: RouteItem[]
): Promise<{ code: string; webUrl: string; deepLink: string }> {
  const res = await fetch(`${BASE}/api/cart/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.json();
}

export async function fetchCart(code: string): Promise<{ items: RouteItem[] }> {
  const res = await fetch(`${BASE}/api/cart/${code}`);
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.json();
}
