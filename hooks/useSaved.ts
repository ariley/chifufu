import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ResultItem } from '../types';

const STORAGE_KEY = 'cheapEats:saved';

export function useSaved() {
  const [saved, setSaved] = useState<ResultItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setSaved(JSON.parse(raw));
      })
      .finally(() => setLoaded(true));
  }, []);

  const persist = useCallback((items: ResultItem[]) => {
    setSaved(items);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, []);

  const isSaved = useCallback(
    (id: string) => saved.some((s) => s.id === id),
    [saved],
  );

  const toggle = useCallback(
    (item: ResultItem) => {
      persist(
        isSaved(item.id)
          ? saved.filter((s) => s.id !== item.id)
          : [item, ...saved],
      );
    },
    [saved, isSaved, persist],
  );

  const remove = useCallback(
    (id: string) => persist(saved.filter((s) => s.id !== id)),
    [saved, persist],
  );

  return { saved, isSaved, toggle, remove, loaded };
}
