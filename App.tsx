import React, { createContext, useContext, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import HomeScreen from './screens/HomeScreen';
import ResultsScreen from './screens/ResultsScreen';
import BucketScreen from './screens/BucketScreen';
import AuthScreen from './screens/AuthScreen';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import DetailScreen from './screens/DetailScreen';
import { useSaved } from './hooks/useSaved';
import { useBucket } from './hooks/useBucket';
import { useSavedRoutes, SavedRoute } from './hooks/useSavedRoutes';
import { BucketItem, GroceryItem, RootStackParamList } from './types';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

// ── Saved context ──────────────────────────────────────────────
interface SavedContextValue {
  saved: GroceryItem[];
  isSaved: (id: string) => boolean;
  toggle: (item: GroceryItem) => void;
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
  add: (item: GroceryItem) => void;
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
  const pendingVerifiedAuthRef = useRef(false);

  useEffect(() => {
    function handleURL(url: string | null) {
      if (!url) return;
      try {
        const parsed = Linking.parse(url);
        const code = parsed.queryParams?.code as string | undefined;
        const path = [parsed.hostname, parsed.path].filter(Boolean).join('/');
        if (path === 'auth/verified') {
          if (navigationRef.isReady()) {
            navigationRef.navigate('Auth', { verified: true });
          } else {
            pendingVerifiedAuthRef.current = true;
          }
          return;
        }
        if ((parsed.hostname === 'cart' || path === 'cart') && code) {
          void importSharedCart(code);
        }
      } catch (_) {}
    }

    async function importSharedCart(code: string) {
      try {
        // Shared cart support can be re-implemented if needed
        Alert.alert('Cart not found', 'This shared cart may have expired.');
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
            <NavigationContainer
              ref={navigationRef}
              onReady={() => {
                if (pendingVerifiedAuthRef.current) {
                  pendingVerifiedAuthRef.current = false;
                  navigationRef.navigate('Auth', { verified: true });
                }
              }}
            >
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
