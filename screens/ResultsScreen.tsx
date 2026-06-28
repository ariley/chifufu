import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useThemeContext } from '../contexts/ThemeContext';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { GroceryItem, GroceryStore, RootStackParamList } from '../types';
import { fetchNearbyGroceryStores, fetchNearbyStores, searchGroceries } from '../lib/api';
import { useBucketContext } from '../App';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Results'>;
type Route = RouteProp<RootStackParamList, 'Results'>;

const SALE_GREEN = '#1D9E75';

interface StoreInfo {
  locationId: string;
  name: string;
  chain: string;
  address: string;
  lat: number;
  lng: number;
}

export default function ResultsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { query, lat, lng, locationLabel } = route.params;
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const { bg, bgSec, text, textSec, textTer, border, accent, accentLight } = useThemeContext();

  const [results, setResults] = useState<GroceryItem[]>([]);
  const [groceryStores, setGroceryStores] = useState<GroceryStore[]>([]);
  const [liveStores, setLiveStores] = useState<StoreInfo[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceLoading, setPriceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultsLocationLabel = locationLabel?.trim() || 'your selected location';
  const selectedLiveStore = selectedStoreId
    ? liveStores.find(candidate => candidate.locationId === selectedStoreId) ?? null
    : null;

  const { isInBucket, add: addToBucket, count: bucketCount } = useBucketContext();

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSeq = useRef(0);
  const hasLoadedStoreContext = useRef(false);

  function showToast() {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1100),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }

  function handleAddToList(item: GroceryItem) {
    addToBucket(item);
    showToast();
  }

  const loadResults = useCallback(async () => {
    const seq = loadSeq.current + 1;
    loadSeq.current = seq;
    const fullScreenLoad = !hasLoadedStoreContext.current;

    setLoading(fullScreenLoad);
    setPriceLoading(!fullScreenLoad);
    setError(null);
    setResults([]);
    setStore(null);
    try {
      const [nearbyGroceryStores, stores]: [GroceryStore[], StoreInfo[]] = await Promise.all([
        fetchNearbyGroceryStores(lat, lng, locationLabel),
        fetchNearbyStores(lat, lng),
      ]);
      if (seq !== loadSeq.current) return;

      setGroceryStores(nearbyGroceryStores ?? []);

      if (!stores || stores.length === 0) {
        if (!nearbyGroceryStores || nearbyGroceryStores.length === 0) {
          setError('No grocery stores found near you.');
        }
        return;
      }
      const preferredStores = preferStoresForLocation(stores, locationLabel);
      setLiveStores(preferredStores);
      hasLoadedStoreContext.current = true;

      const selectedStores = selectedStoreId
        ? preferredStores.filter(candidate => candidate.locationId === selectedStoreId)
        : [];
      if (selectedStoreId && selectedStores.length === 0) {
        setSelectedStoreId(null);
        return;
      }
      const searchStores = selectedStores.length > 0 ? selectedStores : preferredStores;
      let fallbackStore = searchStores[0];
      setStore(fallbackStore);
      const nextResults: GroceryItem[] = [];

      for (const candidate of searchStores) {
        const rawItems = await searchGroceries(query, candidate.locationId);
        if (seq !== loadSeq.current) return;
        const items: GroceryItem[] = (rawItems ?? []).map((item: GroceryItem) => ({
          ...item,
          storeName: candidate.name,
          storeId: candidate.locationId,
          storeAddress: candidate.address,
        }));

        nextResults.push(...items);
      }

      nextResults.sort((a, b) => a.priceValue - b.priceValue);
      setStore(nextResults[0]?.storeId
        ? searchStores.find(candidate => candidate.locationId === nextResults[0].storeId) ?? fallbackStore
        : fallbackStore);
      setResults(nextResults);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
        setPriceLoading(false);
      }
    }
  }, [query, lat, lng, locationLabel, selectedStoreId]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  function renderStoreCard(storeItem: GroceryStore) {
    return (
      <View key={`${storeItem.name}-${storeItem.address}`} style={[styles.storeCard, { backgroundColor: bgSec, borderColor: border }]}>
        <View style={styles.storeCardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.storeCardName, { color: text }]} numberOfLines={1}>
              {storeItem.name}
            </Text>
            <Text style={[styles.storeCardAddress, { color: textSec }]} numberOfLines={1}>
              {storeItem.address}
            </Text>
          </View>
          <Text style={[styles.storeDistance, { color: accent }]}>{storeItem.distMi} mi</Text>
        </View>
        <Text style={[styles.storeMeta, { color: textTer }]}>
          {storeItem.rating ? `${storeItem.rating.toFixed(1)} stars` : 'Grocery store'}
          {storeItem.priceLevel != null ? ` · ${'$'.repeat(Math.max(1, storeItem.priceLevel))}` : ''}
        </Text>
      </View>
    );
  }

  function renderLiveStorePicker() {
    if (liveStores.length === 0) return null;

    return (
      <View style={styles.liveStorePicker}>
        <Text style={[styles.storeHeader, { color: textTer }]}>
          Search live prices at
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.liveStoreChips}
        >
          <TouchableOpacity
            style={[
              styles.liveStoreChip,
              { borderColor: selectedStoreId === null ? accent : border, backgroundColor: selectedStoreId === null ? accent : bgSec },
            ]}
            onPress={() => setSelectedStoreId(null)}
            disabled={priceLoading}
            accessibilityRole="button"
            accessibilityLabel="Search all live stores"
            accessibilityState={{ selected: selectedStoreId === null, disabled: priceLoading }}
          >
            <Text style={[styles.liveStoreChipText, { color: selectedStoreId === null ? accentLight : textSec }]}>
              All live stores
            </Text>
          </TouchableOpacity>
          {liveStores.map(candidate => {
            const selected = selectedStoreId === candidate.locationId;
            return (
              <TouchableOpacity
                key={candidate.locationId}
                style={[
                  styles.liveStoreChip,
                  { borderColor: selected ? accent : border, backgroundColor: selected ? accent : bgSec },
                ]}
                onPress={() => setSelectedStoreId(candidate.locationId)}
                disabled={priceLoading}
                accessibilityRole="button"
                accessibilityLabel={`Search ${candidate.name}`}
                accessibilityState={{ selected, disabled: priceLoading }}
              >
                <Text style={[styles.liveStoreChipText, { color: selected ? accentLight : textSec }]} numberOfLines={1}>
                  {candidate.name.replace(/^Foodsco - /, '')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  function renderCard({ item }: { item: GroceryItem }) {
    const inList = isInBucket(item.id);
    return (
      <View style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
        {/* Sale badge */}
        {item.onSale && (
          <View style={styles.saleBadge}>
            <Text style={styles.saleBadgeText}>SALE</Text>
            {item.savings ? (
              <Text style={styles.savingsText}>{item.savings}</Text>
            ) : null}
          </View>
        )}

        <View style={styles.cardBody}>
          {/* Product image */}
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.productImage}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.productImagePlaceholder, { backgroundColor: bgSec }]}>
              <Text style={{ fontSize: 28 }}>🛒</Text>
            </View>
          )}

          <View style={styles.cardInfo}>
            <View style={styles.cardTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardName, { color: text }]} numberOfLines={2}>
                  {item.brand ? `${item.brand} ` : ''}{item.name}
                </Text>
                <Text style={[styles.cardSize, { color: textSec }]} numberOfLines={1}>
                  {item.size}
                </Text>
              </View>
              <View style={styles.priceCol}>
                <Text style={[styles.cardPrice, { color: accent }]}>{item.price}</Text>
                {item.onSale && item.regularPrice && item.regularPrice !== item.price ? (
                  <Text style={[styles.regularPrice, { color: textTer }]}>{item.regularPrice}</Text>
                ) : null}
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.addBtn,
                { borderColor: inList ? accent : border },
                inList && { backgroundColor: accent },
              ]}
              onPress={() => handleAddToList(item)}
              accessibilityRole="button"
              accessibilityLabel={inList ? 'In your list' : 'Add to list'}
            >
              <Text style={[styles.addBtnText, { color: inList ? accentLight : textSec }]}>
                {inList ? '✓ In list' : '+ Add to list'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />

      {/* Nav bar */}
      <View style={[styles.nav, { backgroundColor: bg, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Text style={[styles.backChevron, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.navCenter}>
          <Text style={[styles.navTitle, { color: text }]} numberOfLines={1}>
            "{query}"
          </Text>
          <Text style={[styles.navSub, { color: textTer }]} numberOfLines={1}>
            {resultsLocationLabel}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('Bucket')}
          style={styles.bucketBtn}
          accessibilityLabel={`My List — ${bucketCount} items`}
        >
          <Text style={styles.bucketIcon}>🛒</Text>
          {bucketCount > 0 && (
            <View style={[styles.bucketBadge, { backgroundColor: accent }]}>
              <Text style={styles.bucketBadgeText}>{bucketCount > 9 ? '9+' : bucketCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <SkeletonList dark={dark} />
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={[styles.errorTitle, { color: text }]}>Couldn't load results</Text>
          <Text style={[styles.errorMsg, { color: textSec }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: accent }]}
            onPress={loadResults}
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.storeId ?? 'store'}-${item.id}`}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <View style={styles.priceSectionHeader}>
              {renderLiveStorePicker()}
              <Text style={[styles.storeHeader, { color: textTer }]}>
                {priceLoading ? 'Loading live prices...' : 'Live item prices'}
              </Text>
              {store && results.length > 0 ? (
                <Text style={[styles.priceSource, { color: textTer }]} numberOfLines={1}>
                  {selectedLiveStore ? `Searching ${selectedLiveStore.name}` : 'Showing matches from live stores'}
                </Text>
              ) : null}
            </View>
          }
          ListFooterComponent={
            groceryStores.length > 0 ? (
              <View style={styles.storeSection}>
                <Text style={[styles.storeHeader, { color: textTer }]}>
                  Grocery stores near {locationLabel || 'you'}
                </Text>
                {groceryStores.slice(0, 8).map(renderStoreCard)}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View>
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={[styles.emptyTitle, { color: text }]}>
                  No live prices for "{query}"
                </Text>
                <Text style={[styles.emptyMsg, { color: textSec }]}>
                  {selectedLiveStore ? `at ${selectedLiveStore.name}` : `near ${resultsLocationLabel}`}
                </Text>
                <Text style={[styles.emptyHint, { color: textTer }]}>
                  Nearby stores are listed below. Live item prices are only available where a store API provides them.
                </Text>
              </View>
              {groceryStores.length > 0 ? (
                <View style={styles.storeSection}>
                  <Text style={[styles.storeHeader, { color: textTer }]}>
                    Grocery stores near {locationLabel || 'you'}
                  </Text>
                  {groceryStores.slice(0, 8).map(renderStoreCard)}
                </View>
              ) : null}
            </View>
          }
        />
      )}

      <Animated.View style={[styles.toast, { opacity: toastOpacity }]} pointerEvents="none">
        <Text style={styles.toastText}>✓  Added to list</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

function preferStoresForLocation(stores: StoreInfo[], locationLabel?: string) {
  const city = locationLabel?.split(',')[0]?.trim().toLowerCase();
  if (!city) return stores;

  const cityStores = stores.filter(store => {
    const text = `${store.name} ${store.address}`.toLowerCase();
    return text.includes(city);
  });

  return cityStores.length > 0 ? cityStores : stores;
}

// ── Skeleton loading cards ─────────────────────────────────────
function SkeletonCard({ dark }: { dark: boolean }) {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, [anim]);
  const shimmer = dark ? '#2C2C2E' : '#E5E5EA';
  return (
    <Animated.View
      style={[
        skStyles.card,
        {
          opacity: anim,
          borderColor: dark ? '#38383A' : '#E5E5EA',
          backgroundColor: dark ? '#1C1C1E' : '#F2F2F7',
        },
      ]}
    >
      <View style={[skStyles.image, { backgroundColor: shimmer }]} />
      <View style={skStyles.lines}>
        <View style={[skStyles.line, { width: '70%', backgroundColor: shimmer }]} />
        <View style={[skStyles.line, { width: '40%', marginTop: 6, backgroundColor: shimmer }]} />
        <View style={[skStyles.line, { width: '30%', marginTop: 10, height: 10, backgroundColor: shimmer }]} />
      </View>
    </Animated.View>
  );
}
function SkeletonList({ dark }: { dark: boolean }) {
  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <View style={[{ height: 12, width: 140, borderRadius: 6, marginBottom: 4, backgroundColor: dark ? '#2C2C2E' : '#E5E5EA' }]} />
      {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} dark={dark} />)}
    </View>
  );
}
const skStyles = StyleSheet.create({
  card: { borderRadius: 12, padding: 14, borderWidth: 0.5, flexDirection: 'row', gap: 12 },
  image: { width: 64, height: 64, borderRadius: 8 },
  lines: { flex: 1, justifyContent: 'center' },
  line: { height: 14, borderRadius: 7 },
});

const styles = StyleSheet.create({
  safe: { flex: 1 },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  backChevron: { fontSize: 28, lineHeight: 32, marginRight: 8 },
  navCenter: { flex: 1 },
  navTitle: { fontSize: 16, fontWeight: '500' },
  navSub: { fontSize: 11, marginTop: 1 },
  bucketBtn: { position: 'relative', padding: 2 },
  bucketIcon: { fontSize: 22 },
  bucketBadge: {
    position: 'absolute', top: -4, right: -6,
    borderRadius: 8,
    minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bucketBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  listContent: { padding: 16, paddingBottom: 40 },
  storeHeader: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  priceSectionHeader: { marginBottom: 2 },
  priceSource: { fontSize: 12, marginTop: -6, marginBottom: 10 },
  liveStorePicker: { marginBottom: 14 },
  liveStoreChips: { gap: 8, paddingRight: 16 },
  liveStoreChip: {
    borderRadius: 8,
    borderWidth: 0.5,
    paddingHorizontal: 12,
    height: 34,
    justifyContent: 'center',
    maxWidth: 180,
  },
  liveStoreChipText: { fontSize: 13, fontWeight: '600' },
  storeSection: { marginBottom: 2 },
  storeCard: {
    borderRadius: 10,
    borderWidth: 0.5,
    padding: 12,
    marginBottom: 8,
  },
  storeCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  storeCardName: { fontSize: 15, fontWeight: '600' },
  storeCardAddress: { fontSize: 12, marginTop: 3 },
  storeDistance: { fontSize: 13, fontWeight: '600' },
  storeMeta: { fontSize: 11, marginTop: 8 },
  separator: { height: 10 },
  card: {
    borderRadius: 12,
    borderWidth: 0.5,
    padding: 14,
  },
  saleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  saleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: SALE_GREEN,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  savingsText: {
    fontSize: 11,
    color: SALE_GREEN,
    fontWeight: '500',
  },
  cardBody: {
    flexDirection: 'row',
    gap: 12,
  },
  productImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  productImagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1 },
  cardTopRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  cardName: { fontSize: 14, fontWeight: '500', lineHeight: 18 },
  cardSize: { fontSize: 12, marginTop: 2 },
  priceCol: { alignItems: 'flex-end' },
  cardPrice: { fontSize: 16, fontWeight: '600' },
  regularPrice: {
    fontSize: 11,
    textDecorationLine: 'line-through',
    marginTop: 2,
  },
  addBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  addBtnText: { fontSize: 13, fontWeight: '500' },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  errorIcon: { fontSize: 40, marginBottom: 4 },
  errorTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  errorMsg: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  retryBtn: {
    marginTop: 12, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10,
  },
  retryText: { color: '#fff', fontWeight: '500', fontSize: 14 },
  emptyWrap: { alignItems: 'center', marginTop: 56, padding: 24, gap: 6 },
  emptyIcon: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptyMsg: { fontSize: 14, textAlign: 'center', fontWeight: '500' },
  emptyHint: { fontSize: 13, textAlign: 'center' },
  toast: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: SALE_GREEN,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '500' },
});
