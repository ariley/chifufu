import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'chifufu:preferences';

export interface Preferences {
  shopSingleStore: boolean;
}

const DEFAULT_PREFERENCES: Preferences = {
  shopSingleStore: false,
};

export function usePreferences() {
  const [preferences, setPreferencesState] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const stored = raw ? JSON.parse(raw) : {};
        setPreferencesState({ ...DEFAULT_PREFERENCES, ...stored });
      })
      .catch(() => setPreferencesState(DEFAULT_PREFERENCES))
      .finally(() => setLoaded(true));
  }, []);

  const setPreferences = useCallback((next: Preferences) => {
    setPreferencesState(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const setShopSingleStore = useCallback((shopSingleStore: boolean) => {
    setPreferencesState((current) => {
      const next = { ...current, shopSingleStore };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { preferences, loaded, setPreferences, setShopSingleStore };
}
