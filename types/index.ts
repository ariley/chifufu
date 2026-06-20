export type CategoryKey = 'go-out' | 'order-in' | 'grocery' | 'under5' | 'under10';
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

export type RootStackParamList = {
  Home: undefined;
  Results: { category: CategoryKey; location: string };
  Detail: { item: ResultItem; location: string };
};
