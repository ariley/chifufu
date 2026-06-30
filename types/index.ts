export interface GroceryItem {
  id: string;
  upc: string;
  name: string;
  brand: string;
  productSize?: string | null;
  size: string;
  price: string | null;
  priceValue: number | null;
  regularPrice: string | null;
  onSale: boolean;
  savings: string | null;
  imageUrl: string | null;
  ingredients?: string | null;
  calories?: string | null;
  nutrition?: ProductNutrition | null;
  detailQuery?: string;
  badges: string[];
  rating?: number;
  source?: string;
  isLivePrice?: boolean;
  // store context (added client-side)
  storeName?: string;
  storeId?: string;
  storeAddress?: string;
}

export interface ProductNutrition {
  calories?: string;
  fat?: string;
  carbs?: string;
  sugars?: string;
  fiber?: string;
  protein?: string;
  saturatedFat?: string;
  transFat?: string;
  cholesterol?: string;
  sodium?: string;
  calcium?: string;
  iron?: string;
  potassium?: string;
  servingSize?: string;
  nutriScore?: string | null;
}

export interface ProductDetails {
  query: string;
  name: string;
  brand?: string | null;
  productSize?: string | null;
  imageUrl?: string | null;
  ingredients?: string | null;
  calories?: string | null;
  nutrition?: ProductNutrition | null;
  allergens?: string[];
  labels?: string[];
  source?: string;
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
  Detail: { item: GroceryItem };
  Bucket: undefined;
  Settings: undefined;
  Auth: { verified?: boolean; email?: string } | undefined;
  Profile: undefined;
};
