export interface GroceryItem {
  id: string;
  upc: string;
  name: string;
  brand: string;
  size: string;
  price: string;        // "$9.99"
  priceValue: number;   // 9.99
  regularPrice: string;
  onSale: boolean;
  savings: string | null;
  imageUrl: string | null;
  badges: string[];
  rating?: number;
  // store context (added client-side)
  storeName?: string;
  storeId?: string;
  storeAddress?: string;
}

export interface GroceryStore {
  name: string;
  type: string;
  address: string;
  lat: number;
  lng: number;
  distMi: string;
  rating?: number;
  priceLevel?: number;
}

export interface BucketItem extends GroceryItem {
  quantity: number;
}

export type RootStackParamList = {
  Home: undefined;
  Results: { query: string; lat?: number; lng?: number; locationLabel?: string };
  Bucket: undefined;
  Settings: undefined;
  Auth: { verified?: boolean; email?: string } | undefined;
  Profile: undefined;
};
