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
  // store context (added client-side)
  storeName?: string;
  storeId?: string;
  storeAddress?: string;
}

export interface BucketItem extends GroceryItem {
  quantity: number;
}

export type RootStackParamList = {
  Home: undefined;
  Results: { query: string; lat: number; lng: number };
  Bucket: undefined;
  Settings: undefined;
  Auth: undefined;
  Profile: undefined;
};
