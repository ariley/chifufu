import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'chifufu:savedLocations';

export interface SavedLocation {
  id: string;
  name: string;
  label: string;
  lat: number;
  lng: number;
  savedAt: number;
}

function makeId(label: string, lat: number, lng: number) {
  return `${label.trim().toLowerCase()}:${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export function useSavedLocations() {
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => setLocations(raw ? JSON.parse(raw) : []))
      .catch(() => setLocations([]))
      .finally(() => setLoaded(true));
  }, []);

  const persist = useCallback((next: SavedLocation[]) => {
    setLocations(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const save = useCallback(
    (input: { name: string; label: string; lat: number; lng: number }) => {
      const id = makeId(input.label, input.lat, input.lng);
      const nextLocation: SavedLocation = {
        id,
        name: input.name.trim() || input.label,
        label: input.label.trim(),
        lat: input.lat,
        lng: input.lng,
        savedAt: Date.now(),
      };
      persist([nextLocation, ...locations.filter((location) => location.id !== id)].slice(0, 8));
      return nextLocation;
    },
    [locations, persist],
  );

  const remove = useCallback(
    (id: string) => persist(locations.filter((location) => location.id !== id)),
    [locations, persist],
  );

  return { locations, loaded, save, remove };
}
