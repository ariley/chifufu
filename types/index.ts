export type CategoryKey = 'go-out' | 'order-in' | 'grocery' | 'under5' | 'under10' | 'pet-stores';

export interface SearchHistoryEntry {
  query: string;
  category: CategoryKey;
  location: string;
  timestamp: number;
}
export type BadgeKey = 'deal' | 'fast' | 'close';

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

export interface BucketItem extends ResultItem {
  quantity: number;
}

export type RootStackParamList = {
  Home: undefined;
  Results: { category: CategoryKey; location: string; searchQuery?: string; lat?: number; lng?: number };
  Detail: { item: ResultItem; location: string };
  Bucket: undefined;
  Settings: undefined;
  Auth: undefined;
  Profile: undefined;
};
