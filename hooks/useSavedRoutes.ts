import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BucketItem } from '../types';

const STORAGE_KEY = 'chifufu:savedRoutes';

export interface SavedRoute {
  id: string;
  name: string;
  items: BucketItem[];
  savedAt: number;
}

export function useSavedRoutes() {
  const [routes, setRoutes] = useState<SavedRoute[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => { if (raw) setRoutes(JSON.parse(raw)); });
  }, []);

  const persist = useCallback((next: SavedRoute[]) => {
    setRoutes(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const save = useCallback((name: string, items: BucketItem[]) => {
    const route: SavedRoute = {
      id: `route-${Date.now()}`,
      name: name.trim() || 'My Route',
      items,
      savedAt: Date.now(),
    };
    const updated = [route, ...routes.filter((r) => r.name !== route.name)];
    persist(updated);
    return route;
  }, [routes, persist]);

  const remove = useCallback((id: string) => {
    persist(routes.filter((r) => r.id !== id));
  }, [routes, persist]);

  return { routes, save, remove };
}
