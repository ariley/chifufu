import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'cheapEats:searchHistory';
const MAX_ENTRIES = 8;

export interface SearchHistoryEntry {
  query: string;
  timestamp: number;
}

export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => { if (raw) setHistory(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  const push = useCallback((query: string) => {
    if (!query.trim()) return;
    setHistory((prev) => {
      const filtered = prev.filter((e) => e.query.toLowerCase() !== query.toLowerCase());
      const next = [{ query: query.trim(), timestamp: Date.now() }, ...filtered].slice(0, MAX_ENTRIES);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const remove = useCallback((query: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.query !== query);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setHistory([]);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return { history, push, remove, clear };
}
