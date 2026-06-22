import React, { createContext, useContext, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import HomeScreen from './screens/HomeScreen';
import ResultsScreen from './screens/ResultsScreen';
import DetailScreen from './screens/DetailScreen';
import BucketScreen from './screens/BucketScreen';
import AuthScreen from './screens/AuthScreen';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import { useSaved } from './hooks/useSaved';
import { useBucket } from './hooks/useBucket';
import { useSavedRoutes, SavedRoute } from './hooks/useSavedRoutes';
import { BucketItem, ResultItem, RootStackParamList } from './types';
import { loadSharedCart } from './utils/anthropic';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

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

// ── Saved Routes context ───────────────────────────────────────
interface SavedRoutesContextValue {
  routes: SavedRoute[];
  save: (name: string, items: BucketItem[]) => SavedRoute;
  remove: (id: string) => void;
}
export const SavedRoutesContext = createContext<SavedRoutesContextValue>({
  routes: [], save: () => ({ id: '', name: '', items: [], savedAt: 0 }), remove: () => {},
});
export function useSavedRoutesContext() { return useContext(SavedRoutesContext); }

// ── Bucket context ─────────────────────────────────────────────
interface BucketContextValue {
  items: BucketItem[];
  isInBucket: (id: string) => boolean;
  add: (item: ResultItem) => void;
  remove: (id: string) => void;
  setQuantity: (id: string, qty: number) => void;
  clear: () => void;
  replaceAll: (items: BucketItem[]) => void;
  count: number;
  loaded: boolean;
}
export const BucketContext = createContext<BucketContextValue>({
  items: [], isInBucket: () => false, add: () => {}, remove: () => {},
  setQuantity: () => {}, clear: () => {}, replaceAll: () => {}, count: 0, loaded: false,
});
export function useBucketContext() { return useContext(BucketContext); }

// ── App ────────────────────────────────────────────────────────
export default function App() {
  const savedState = useSaved();
  const bucketState = useBucket();
  const savedRoutesState = useSavedRoutes();

  // Keep a ref so the link handler always sees the latest replaceAll
  const replaceAllRef = useRef(bucketState.replaceAll);
  replaceAllRef.current = bucketState.replaceAll;

  useEffect(() => {
    function handleURL(url: string | null) {
      if (!url) return;
      try {
        const parsed = Linking.parse(url);
        const code = parsed.queryParams?.code as string | undefined;
        if (parsed.hostname === 'cart' && code) {
          importSharedCart(code);
        }
      } catch (_) {}
    }

    async function importSharedCart(code: string) {
      try {
        const items = await loadSharedCart(code);
        if (!items?.length) {
          Alert.alert('Empty cart', 'The shared cart has no items.');
          return;
        }
        Alert.alert(
          'Shared Cart',
          `Your friend shared ${items.length} item${items.length === 1 ? '' : 's'}. Import it?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Add to my cart',
              onPress: () => replaceAllRef.current(items),
            },
          ],
        );
      } catch {
        Alert.alert('Cart not found', 'This shared cart may have expired.');
      }
    }

    // Cold start: app opened via link
    Linking.getInitialURL().then(handleURL);

    // Warm start: link received while app is running
    const sub = Linking.addEventListener('url', ({ url }) => handleURL(url));
    return () => sub.remove();
  }, []);

  return (
    <ThemeProvider>
    <AuthProvider>
      <SavedContext.Provider value={savedState}>
        <SavedRoutesContext.Provider value={savedRoutesState}>
          <BucketContext.Provider value={bucketState}>
            <NavigationContainer>
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Home" component={HomeScreen} />
                <Stack.Screen name="Results" component={ResultsScreen} />
                <Stack.Screen name="Detail" component={DetailScreen} />
                <Stack.Screen name="Bucket" component={BucketScreen} />
                <Stack.Screen name="Settings" component={SettingsScreen} />
                <Stack.Screen name="Auth" component={AuthScreen} />
                <Stack.Screen name="Profile" component={ProfileScreen} />
              </Stack.Navigator>
            </NavigationContainer>
          </BucketContext.Provider>
        </SavedRoutesContext.Provider>
      </SavedContext.Provider>
    </AuthProvider>
    </ThemeProvider>
  );
}
