import React, { createContext, useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './screens/HomeScreen';
import ResultsScreen from './screens/ResultsScreen';
import DetailScreen from './screens/DetailScreen';
import BucketScreen from './screens/BucketScreen';
import { useSaved } from './hooks/useSaved';
import { useBucket } from './hooks/useBucket';
import { BucketItem, ResultItem, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

// ── Saved context ──────────────────────────────────────────────
interface SavedContextValue {
  saved: ResultItem[];
  isSaved: (id: string) => boolean;
  toggle: (item: ResultItem) => void;
  remove: (id: string) => void;
  loaded: boolean;
}
export const SavedContext = createContext<SavedContextValue>({
  saved: [], isSaved: () => false, toggle: () => {}, remove: () => {}, loaded: false,
});
export function useSavedContext() { return useContext(SavedContext); }

// ── Bucket context ─────────────────────────────────────────────
interface BucketContextValue {
  items: BucketItem[];
  isInBucket: (id: string) => boolean;
  add: (item: ResultItem) => void;
  remove: (id: string) => void;
  setQuantity: (id: string, qty: number) => void;
  clear: () => void;
  count: number;
  loaded: boolean;
}
export const BucketContext = createContext<BucketContextValue>({
  items: [], isInBucket: () => false, add: () => {}, remove: () => {},
  setQuantity: () => {}, clear: () => {}, count: 0, loaded: false,
});
export function useBucketContext() { return useContext(BucketContext); }

// ── App ────────────────────────────────────────────────────────
export default function App() {
  const savedState = useSaved();
  const bucketState = useBucket();

  return (
    <SavedContext.Provider value={savedState}>
      <BucketContext.Provider value={bucketState}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Results" component={ResultsScreen} />
            <Stack.Screen name="Detail" component={DetailScreen} />
            <Stack.Screen name="Bucket" component={BucketScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </BucketContext.Provider>
    </SavedContext.Provider>
  );
}
