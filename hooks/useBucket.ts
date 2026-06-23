import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BucketItem, GroceryItem } from '../types';

const STORAGE_KEY = 'cheapEats:bucket';

export function useBucket() {
  const [items, setItems] = useState<BucketItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => { if (raw) setItems(JSON.parse(raw)); })
      .finally(() => setLoaded(true));
  }, []);

  const persist = useCallback((next: BucketItem[]) => {
    setItems(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const isInBucket = useCallback((id: string) => items.some((i) => i.id === id), [items]);

  const add = useCallback((item: GroceryItem) => {
    const existing = items.find((i) => i.id === item.id);
    if (existing) {
      persist(items.map((i) => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      persist([...items, { ...item, quantity: 1 }]);
    }
  }, [items, persist]);

  const remove = useCallback((id: string) => {
    persist(items.filter((i) => i.id !== id));
  }, [items, persist]);

  const setQuantity = useCallback((id: string, qty: number) => {
    if (qty <= 0) {
      persist(items.filter((i) => i.id !== id));
    } else {
      persist(items.map((i) => i.id === id ? { ...i, quantity: qty } : i));
    }
  }, [items, persist]);

  const clear = useCallback(() => persist([]), [persist]);

  const replaceAll = useCallback((next: BucketItem[]) => persist(next), [persist]);

  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return { items, isInBucket, add, remove, setQuantity, clear, replaceAll, count, loaded };
}
