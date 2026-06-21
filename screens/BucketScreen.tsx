import React, { useMemo } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useBucketContext } from '../App';
import { BucketItem } from '../types';

const GREEN = '#1D9E75';
const GREEN_LIGHT = '#E1F5EE';

// Haversine distance in km
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface StoreGroup {
  storeName: string;
  address?: string;
  lat?: number;
  lng?: number;
  items: BucketItem[];
}

export default function BucketScreen() {
  const navigation = useNavigation();
  const { items, setQuantity, remove, clear, count } = useBucketContext();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';

  const c = {
    bg: dark ? '#000000' : '#FFFFFF',
    bgSec: dark ? '#1C1C1E' : '#F2F2F7',
    text: dark ? '#FFFFFF' : '#000000',
    textSec: dark ? '#ABABAB' : '#6C6C70',
    textTer: dark ? '#636366' : '#AEAEB2',
    border: dark ? '#38383A' : '#E5E5EA',
  };

  // Group items by store name
  const stores: StoreGroup[] = useMemo(() => {
    const map = new Map<string, StoreGroup>();
    for (const item of items) {
      const key = item.name;
      if (!map.has(key)) {
        map.set(key, { storeName: item.name, address: item.address, lat: item.lat, lng: item.lng, items: [] });
      }
      map.get(key)!.items.push(item);
    }
    return Array.from(map.values());
  }, [items]);

  async function buildRoute() {
    if (stores.length === 0) return;

    const withCoords = stores.filter((s) => s.lat != null && s.lng != null);
    const withAddress = stores.filter((s) => s.address);

    if (withAddress.length === 0 && withCoords.length === 0) {
      Alert.alert('No locations', 'None of your bucket items have addresses for routing.');
      return;
    }

    // Try to get user location to sort stores by distance
    let orderedStores = withAddress.length > 0 ? withAddress : withCoords;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude, longitude } = pos.coords;
        // Nearest-neighbor sort starting from user location
        const remaining = [...orderedStores.filter((s) => s.lat != null && s.lng != null)];
        const sorted: StoreGroup[] = [];
        let curLat = latitude, curLng = longitude;

        while (remaining.length > 0) {
          let nearest = 0;
          let nearestDist = Infinity;
          remaining.forEach((s, i) => {
            const d = haversine(curLat, curLng, s.lat!, s.lng!);
            if (d < nearestDist) { nearestDist = d; nearest = i; }
          });
          sorted.push(remaining.splice(nearest, 1)[0]);
          curLat = sorted[sorted.length - 1].lat!;
          curLng = sorted[sorted.length - 1].lng!;
        }

        // Add any stores without coords at the end
        const noCoords = orderedStores.filter((s) => s.lat == null || s.lng == null);
        orderedStores = [...sorted, ...noCoords];
      } catch (_) {
        // fall through with unsorted stores
      }
    }

    // Build Google Maps multi-stop URL
    const stops = orderedStores
      .map((s) => encodeURIComponent(s.address ?? `${s.storeName}`))
      .join('/');
    const url = `https://www.google.com/maps/dir/My+Location/${stops}/`;

    Linking.openURL(url).catch(() =>
      Alert.alert('Could not open Maps', 'Make sure Google Maps or a browser is installed.'),
    );
  }

  if (items.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <View style={[styles.nav, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back">
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.navTitle, { color: c.text }]}>Grocery Bucket</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={[styles.emptyTitle, { color: c.text }]}>Your bucket is empty</Text>
          <Text style={[styles.emptySub, { color: c.textSec }]}>
            Tap 🛒 on any result to add items here, then build a route to visit all stores.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />

      <View style={[styles.nav, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: c.text }]}>
          Grocery Bucket · {count} {count === 1 ? 'item' : 'items'}
        </Text>
        <TouchableOpacity onPress={() => {
          Alert.alert('Clear bucket?', 'This will remove all items.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: clear },
          ]);
        }}>
          <Text style={[styles.clearBtn, { color: '#FF3B30' }]}>Clear</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={stores}
        keyExtractor={(s) => s.storeName}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.storeSep} />}
        renderItem={({ item: store }) => (
          <View style={[styles.storeCard, { backgroundColor: c.bgSec, borderColor: c.border }]}>
            {/* Store header */}
            <View style={styles.storeHeader}>
              <Text style={styles.storeIcon}>🏪</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.storeName, { color: c.text }]}>{store.storeName}</Text>
                {store.address && (
                  <Text style={[styles.storeAddress, { color: c.textTer }]} numberOfLines={1}>
                    {store.address}
                  </Text>
                )}
              </View>
            </View>

            {/* Items in this store */}
            {store.items.map((item) => (
              <View key={item.id} style={[styles.itemRow, { borderTopColor: c.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: c.text }]} numberOfLines={1}>{item.description}</Text>
                  <Text style={styles.itemPrice}>{item.price} each</Text>
                </View>
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    style={[styles.qtyBtn, { borderColor: c.border }]}
                    onPress={() => setQuantity(item.id, item.quantity - 1)}
                  >
                    <Text style={[styles.qtyBtnText, { color: c.text }]}>−</Text>
                  </TouchableOpacity>
                  <Text style={[styles.qtyNum, { color: c.text }]}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={[styles.qtyBtn, { borderColor: c.border }]}
                    onPress={() => setQuantity(item.id, item.quantity + 1)}
                  >
                    <Text style={[styles.qtyBtnText, { color: GREEN }]}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
        ListFooterComponent={
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: c.textSec }]}>Estimated total</Text>
            <Text style={styles.totalAmount}>
              ${stores.flatMap(s => s.items).reduce((sum, i) => sum + i.priceValue * i.quantity, 0).toFixed(2)}
            </Text>
          </View>
        }
      />

      <View style={[styles.ctaWrap, { backgroundColor: c.bg }]}>
        <TouchableOpacity style={styles.cta} onPress={buildRoute} accessibilityRole="button">
          <Text style={styles.ctaText}>🗺️  Build Route — {stores.length} {stores.length === 1 ? 'stop' : 'stops'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  backChevron: { fontSize: 28, color: GREEN, lineHeight: 32, marginRight: 8 },
  navTitle: { flex: 1, fontSize: 16, fontWeight: '500' },
  clearBtn: { fontSize: 14 },
  list: { padding: 16, gap: 0, paddingBottom: 24 },
  storeSep: { height: 12 },
  storeCard: {
    borderRadius: 14,
    borderWidth: 0.5,
    overflow: 'hidden',
  },
  storeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  storeIcon: { fontSize: 22 },
  storeName: { fontSize: 15, fontWeight: '600' },
  storeAddress: { fontSize: 12, marginTop: 1 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    gap: 12,
  },
  itemName: { fontSize: 14, marginBottom: 2 },
  itemPrice: { fontSize: 12, color: GREEN, fontWeight: '500' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 28, height: 28,
    borderRadius: 14, borderWidth: 0.5,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 16, lineHeight: 20 },
  qtyNum: { fontSize: 15, fontWeight: '500', minWidth: 20, textAlign: 'center' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 4,
  },
  totalLabel: { fontSize: 14 },
  totalAmount: { fontSize: 20, fontWeight: '600', color: GREEN },
  ctaWrap: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 12 },
  cta: {
    backgroundColor: GREEN, borderRadius: 12,
    padding: 16, alignItems: 'center',
  },
  ctaText: { color: GREEN_LIGHT, fontSize: 16, fontWeight: '500' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyIcon: { fontSize: 52, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
