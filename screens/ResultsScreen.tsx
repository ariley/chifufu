import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  SafeAreaView,
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
import { GroceryItem, RootStackParamList } from '../types';
import { fetchPricedGroceryOptions, fetchProductDetails, PricedStoreOption } from '../lib/api';
import { useBucketContext } from '../App';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Results'>;
type Route = RouteProp<RootStackParamList, 'Results'>;

const SALE_GREEN = '#1D9E75';

function toGroceryItem(option: PricedStoreOption): GroceryItem {
  const storeKey = `${option.name}-${option.address ?? 'unknown'}`;
  return {
    id: `${storeKey}-${option.id}`,
    upc: '',
    name: option.description,
    brand: option.brand ?? '',
    productSize: option.productSize ?? null,
    size: option.distance,
    price: option.price,
    priceValue: option.priceValue,
    regularPrice: '',
    onSale: option.badges?.includes('deal') ?? false,
    savings: null,
    imageUrl: option.imageUrl ?? null,
    ingredients: option.ingredients ?? null,
    calories: option.calories ?? null,
    nutrition: option.nutrition ?? null,
    productUrl: option.productUrl ?? null,
    detailQuery: option.detailQuery ?? option.description,
    badges: option.badges ?? [],
    rating: option.rating,
    storeName: option.name,
    storeId: storeKey,
    storeAddress: option.address,
  };
}

function displayNameWithBrand(item: GroceryItem) {
  const brand = item.brand.trim();
  if (!brand) return item.name;
  return item.name.toLowerCase().startsWith(`${brand.toLowerCase()} `)
    ? item.name
    : `${brand} ${item.name}`;
}

export default function ResultsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { query, lat, lng, locationLabel } = route.params;
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const { bg, bgSec, text, textSec, textTer, border, accent, accentLight } = useThemeContext();

  const [results, setResults] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saleOnly, setSaleOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const resultsLocationLabel = locationLabel?.trim() || 'your selected location';

  const { isInBucket, add: addToBucket, count: bucketCount } = useBucketContext();

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSeq = useRef(0);

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

  function toggleSelected(id: string) {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSelectVisible(items: GroceryItem[]) {
    setSelectedIds(current => {
      const next = new Set(current);
      const allVisibleSelected = items.length > 0 && items.every(item => next.has(item.id));
      items.forEach(item => {
        if (allVisibleSelected) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
      });
      return next;
    });
  }

  function handleAddSelected() {
    const selectedItems = results.filter(item => selectedIds.has(item.id) && !isInBucket(item.id));
    selectedItems.forEach(addToBucket);
    setSelectedIds(new Set());
    showToast();
  }

  const loadResults = useCallback(async () => {
    const seq = loadSeq.current + 1;
    loadSeq.current = seq;

    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const pricedOptions = await fetchPricedGroceryOptions(query, resultsLocationLabel, lat, lng);
      if (seq !== loadSeq.current) return;
      const nextResults = (pricedOptions ?? []).map(toGroceryItem);
      setResults(nextResults);

      const detailQueries = [...new Set(nextResults
        .filter(item => !item.imageUrl || !item.ingredients || !item.calories)
        .map(item => item.detailQuery || [item.brand, item.name].filter(Boolean).join(' '))
        .filter(Boolean))];

      if (detailQueries.length > 0) {
        Promise.allSettled(detailQueries.map(detailQuery => fetchProductDetails(detailQuery)))
          .then((settledDetails) => {
            if (seq !== loadSeq.current) return;
            const detailsByQuery = new Map<string, Awaited<ReturnType<typeof fetchProductDetails>>>();
            settledDetails.forEach((result, index) => {
              if (result.status === 'fulfilled') {
                detailsByQuery.set(detailQueries[index], result.value);
              }
            });
            setResults(current => current.map(item => {
              const detailQuery = item.detailQuery || [item.brand, item.name].filter(Boolean).join(' ');
              const details = detailsByQuery.get(detailQuery);
              if (!details) return item;
              return {
                ...item,
                imageUrl: item.imageUrl || details.imageUrl || null,
                ingredients: item.ingredients || details.ingredients || null,
                calories: item.calories || details.calories || null,
                nutrition: item.nutrition || details.nutrition || null,
                productUrl: item.productUrl || details.productUrl || null,
                productSize: item.productSize || details.productSize || null,
              };
            }));
          })
          .catch(() => {});
      }
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
      }
    }
  }, [query, lat, lng, resultsLocationLabel]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  useEffect(() => {
    setSelectedIds(current => {
      const validIds = new Set(results.map(item => item.id));
      const next = new Set([...current].filter(id => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [results]);

  const saleCount = results.filter(item => item.onSale).length;
  const visibleResults = saleOnly ? results.filter(item => item.onSale) : results;
  const visibleSelectedCount = visibleResults.filter(item => selectedIds.has(item.id)).length;
  const selectedCount = selectedIds.size;

  function renderCard({ item }: { item: GroceryItem }) {
    const inList = isInBucket(item.id);
    const selected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: bg, borderColor: border }]}
        onPress={() => navigation.navigate('Detail', { item })}
        accessibilityRole="button"
        accessibilityLabel={`Learn more about ${item.name}`}
      >
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
          <TouchableOpacity
            style={[
              styles.checkbox,
              { borderColor: selected ? accent : border, backgroundColor: selected ? accent : 'transparent' },
            ]}
            onPress={(event) => {
              event.stopPropagation();
              toggleSelected(item.id);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${displayNameWithBrand(item)}`}
          >
            {selected ? <Text style={[styles.checkboxMark, { color: accentLight }]}>✓</Text> : null}
          </TouchableOpacity>

          {/* Product image */}
          <TouchableOpacity
            onPress={() => navigation.navigate('Detail', { item })}
            accessibilityRole="button"
            accessibilityLabel={`Learn more about ${item.name}`}
          >
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
          </TouchableOpacity>

          <View style={styles.cardInfo}>
            <View style={styles.cardTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardName, { color: text }]} numberOfLines={2}>
                  {displayNameWithBrand(item)}
                </Text>
                <Text style={[styles.cardSize, { color: textSec }]} numberOfLines={1}>
                  {[item.productSize, item.size].filter(Boolean).join(' · ')}
                </Text>
                {item.storeName ? (
                  <Text style={[styles.cardStore, { color: textTer }]} numberOfLines={1}>
                    {item.storeName}{item.rating ? ` · ${item.rating.toFixed(1)} stars` : ''}{item.storeAddress ? ` · ${item.storeAddress}` : ''}
                  </Text>
                ) : null}
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
              onPress={(event) => {
                event.stopPropagation();
                handleAddToList(item);
              }}
              accessibilityRole="button"
              accessibilityLabel={inList ? 'In your list' : 'Add to list'}
            >
              <Text style={[styles.addBtnText, { color: inList ? accentLight : textSec }]}>
                {inList ? '✓ In list' : '+ Add to list'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
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
          data={visibleResults}
          keyExtractor={(item) => `${item.storeId ?? 'store'}-${item.id}`}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            results.length > 0 ? (
              <View style={styles.resultsTools}>
                <Text style={[styles.storeHeader, { color: textTer }]}>
                  {saleOnly ? 'Sale items across supermarkets' : 'Priced options across supermarkets'}
                </Text>
                <View style={styles.filterRow}>
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      { borderColor: !saleOnly ? accent : border, backgroundColor: !saleOnly ? accent : bgSec },
                    ]}
                    onPress={() => setSaleOnly(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Show all priced options"
                  >
                    <Text style={[styles.filterChipText, { color: !saleOnly ? accentLight : textSec }]}>
                      All {results.length}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      { borderColor: saleOnly ? SALE_GREEN : border, backgroundColor: saleOnly ? SALE_GREEN : bgSec },
                    ]}
                    onPress={() => setSaleOnly(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Show sale items"
                  >
                    <Text style={[styles.filterChipText, { color: saleOnly ? '#fff' : textSec }]}>
                      Sale {saleCount}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.selectVisibleBtn, { borderColor: border }]}
                    onPress={() => handleSelectVisible(visibleResults)}
                    accessibilityRole="button"
                    accessibilityLabel={visibleSelectedCount === visibleResults.length ? 'Clear visible selections' : 'Select visible items'}
                    disabled={visibleResults.length === 0}
                  >
                    <Text style={[styles.selectVisibleText, { color: visibleResults.length === 0 ? textTer : accent }]}>
                      {visibleSelectedCount === visibleResults.length && visibleResults.length > 0 ? 'Clear visible' : 'Select visible'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={[styles.emptyTitle, { color: text }]}>
                {saleOnly ? `No sale items for "${query}"` : `No priced options for "${query}"`}
              </Text>
              <Text style={[styles.emptyMsg, { color: textSec }]}>
                near {resultsLocationLabel}
              </Text>
              <Text style={[styles.emptyHint, { color: textTer }]}>
                Try a broader product name.
              </Text>
            </View>
          }
        />
      )}

      {selectedCount > 0 && (
        <View style={[styles.bulkBar, { backgroundColor: bgSec, borderTopColor: border }]}>
          <TouchableOpacity
            style={styles.bulkClearBtn}
            onPress={() => setSelectedIds(new Set())}
            accessibilityRole="button"
            accessibilityLabel="Clear selections"
          >
            <Text style={[styles.bulkClearText, { color: textSec }]}>Clear</Text>
          </TouchableOpacity>
          <Text style={[styles.bulkCount, { color: text }]}>{selectedCount} selected</Text>
          <TouchableOpacity
            style={[styles.bulkAddBtn, { backgroundColor: accent }]}
            onPress={handleAddSelected}
            accessibilityRole="button"
            accessibilityLabel={`Add ${selectedCount} selected items to list`}
          >
            <Text style={[styles.bulkAddText, { color: accentLight }]}>Add selected</Text>
          </TouchableOpacity>
        </View>
      )}

      <Animated.View style={[styles.toast, { opacity: toastOpacity }]} pointerEvents="none">
        <Text style={styles.toastText}>✓  Added to list</Text>
      </Animated.View>
    </SafeAreaView>
  );
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
  listContent: { padding: 16, paddingBottom: 96 },
  resultsTools: {
    marginBottom: 12,
  },
  storeHeader: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterChip: {
    height: 34,
    minWidth: 72,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  selectVisibleBtn: {
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  selectVisibleText: {
    fontSize: 12,
    fontWeight: '700',
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
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  checkboxMark: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
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
  cardStore: { fontSize: 11, marginTop: 3 },
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
  bulkBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 66,
    borderTopWidth: 0.5,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bulkClearBtn: {
    height: 42,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkClearText: {
    fontSize: 14,
    fontWeight: '600',
  },
  bulkCount: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  bulkAddBtn: {
    height: 42,
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkAddText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
