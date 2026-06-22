export type CategoryKey =
  | "go-out"
  | "order-in"
  | "grocery"
  | "under5"
  | "under10"
  | "pet-stores";

export type BadgeKey = "deal" | "fast" | "close";

export interface ResultItem {
  id: string;
  name: string;
  description: string;
  price: string;
  priceValue: number;
  distance: string;
  badges: BadgeKey[];
  address?: string;
  platform?: string;
  lat?: number;
  lng?: number;
}

export interface RouteItem extends ResultItem {
  quantity: number;
}

export interface StoreGroup {
  storeName: string;
  address?: string;
  lat?: number;
  lng?: number;
  items: RouteItem[];
}
