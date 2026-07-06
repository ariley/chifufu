import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GroceryItem } from '../types';

const STORAGE_KEY = 'cheapEats:saved';

function savedKey(item: GroceryItem) {
  return [
    item.upc,
    item.detailQuery,
    item.brand,
    item.name,
  ]
    .filter(Boolean)
    .join('|')
    .trim()
    .toLowerCase() || item.id;
}

export function useSaved() {
  const [saved, setSaved] = useState<GroceryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setSaved(JSON.parse(raw));
      })
      .finally(() => setLoaded(true));
  }, []);

  const persist = useCallback((items: GroceryItem[]) => {
    setSaved(items);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, []);

  const isSaved = useCallback(
    (idOrItem: string | GroceryItem) => {
      const id = typeof idOrItem === 'string' ? idOrItem : idOrItem.id;
      const key = typeof idOrItem === 'string' ? idOrItem : savedKey(idOrItem);
      return saved.some((s) => s.id === id || savedKey(s) === key);
    },
    [saved],
  );

  const toggle = useCallback(
    (item: GroceryItem) => {
      const key = savedKey(item);
      const existing = saved.find((s) => savedKey(s) === key || s.id === item.id);
      if (existing) {
        persist(saved.filter((s) => savedKey(s) !== key && s.id !== item.id));
        return;
      }

      persist([
        {
          ...item,
          savedAt: Date.now(),
          lastSeenAt: Date.now(),
          lookupCount: 1,
        },
        ...saved,
      ]);
    },
    [saved, persist],
  );

  const remember = useCallback(
    (item: GroceryItem) => {
      const key = savedKey(item);
      const existing = saved.find((s) => savedKey(s) === key || s.id === item.id);
      if (existing) {
        persist([
          {
            ...existing,
            ...item,
            savedAt: existing.savedAt ?? Date.now(),
            lastSeenAt: Date.now(),
            lookupCount: (existing.lookupCount ?? 1) + 1,
          },
          ...saved.filter((s) => savedKey(s) !== key && s.id !== item.id),
        ]);
        return;
      }

      persist([
        {
          ...item,
          savedAt: Date.now(),
          lastSeenAt: Date.now(),
          lookupCount: 1,
        },
        ...saved,
      ]);
    },
    [saved, persist],
  );

  const remove = useCallback(
    (id: string) => persist(saved.filter((s) => s.id !== id)),
    [saved, persist],
  );

  return { saved, isSaved, toggle, remember, remove, loaded };
}
