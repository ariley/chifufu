import { BucketItem } from '../types';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

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
