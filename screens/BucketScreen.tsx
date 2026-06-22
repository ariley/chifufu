import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useBucketContext, useSavedRoutesContext } from '../App';
import { useThemeContext } from '../contexts/ThemeContext';
import { BucketItem } from '../types';
import { shareCart } from '../utils/anthropic';

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
  const { items, setQuantity, remove, clear, replaceAll, count } = useBucketContext();
  const { routes: savedRoutes, save: saveRoute, remove: removeSavedRoute } = useSavedRoutesContext();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const [sharing, setSharing] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const { bg, bgSec, text, textSec, textTer, border, accent, accentLight } = useThemeContext();

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
      Alert.alert('No locations', 'None of your route stops have addresses for navigation.');
      return;
    }

    let orderedStores = withAddress.length > 0 ? withAddress : withCoords;
    let userLat: number | null = null;
    let userLng: number | null = null;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        const remaining = [...orderedStores.filter((s) => s.lat != null && s.lng != null)];
        const sorted: StoreGroup[] = [];
        let curLat = userLat, curLng = userLng;

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

        const noCoords = orderedStores.filter((s) => s.lat == null || s.lng == null);
        orderedStores = [...sorted, ...noCoords];
      } catch (_) {}
    }

    const encoded = orderedStores.map((s) => encodeURIComponent(s.address ?? s.storeName));
    const saddrCoord = userLat != null ? `${userLat},${userLng}` : '';

    function openGoogleMaps() {
      const appUrl = `comgooglemaps://?saddr=${saddrCoord}&daddr=${encoded.join('+to:')}&directionsmode=driving`;
      const webUrl = `https://www.google.com/maps/dir/${saddrCoord || 'My+Location'}/${encoded.join('/')}/`;
      Linking.canOpenURL(appUrl).then((supported) => {
        Linking.openURL(supported ? appUrl : webUrl).catch(() =>
          Alert.alert('Could not open Google Maps'),
        );
      });
    }

    function openAppleMaps() {
      const saddrParam = saddrCoord ? `saddr=${saddrCoord}&` : '';
      Linking.openURL(`maps://?${saddrParam}daddr=${encoded[0]}&dirflg=d`).catch(() =>
        Alert.alert('Could not open Apple Maps'),
      );
    }

    if (Platform.OS === 'ios') {
      const subtitle = orderedStores.length > 1
        ? 'Google Maps supports all stops. Apple Maps navigates to the first stop only.'
        : '';
      Alert.alert('Navigate with…', subtitle, [
        { text: 'Google Maps', onPress: openGoogleMaps },
        { text: 'Apple Maps', onPress: openAppleMaps },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      openGoogleMaps();
    }
  }

  async function handleShare() {
    if (items.length === 0) return;
    setSharing(true);
    try {
      const { webUrl, code } = await shareCart(items);

      // Build a readable text list
      const lines: string[] = ['🗺️ My Chifufu route:\n'];
      for (const store of stores) {
        lines.push(`🏪 ${store.storeName}`);
        for (const item of store.items) {
          lines.push(`  • ${item.description} ×${item.quantity} — ${item.price} each`);
        }
        lines.push('');
      }
      const total = stores.flatMap(s => s.items).reduce((sum, i) => sum + i.priceValue * i.quantity, 0);
      lines.push(`Estimated total: $${total.toFixed(2)}`);
      lines.push(`\nOpen in Chifufu app: ${webUrl}`);

      await Share.share({ message: lines.join('\n'), url: webUrl });
    } catch {
      Alert.alert('Could not share', 'Make sure you are connected to the internet and try again.');
    } finally {
      setSharing(false);
    }
  }

  if (items.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <View style={[styles.nav, { borderBottomColor: border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back">
            <Text style={[styles.backChevron, { color: accent }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.navTitle, { color: text }]}>My Route</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🗺️</Text>
          <Text style={[styles.emptyTitle, { color: text }]}>Your route is empty</Text>
          <Text style={[styles.emptySub, { color: textSec }]}>
            Tap + on any result to add stops, then navigate to all stores in one trip.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />

      <View style={[styles.nav, { backgroundColor: bg, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: text }]}>
          My Route · {count} {count === 1 ? 'item' : 'items'}
        </Text>
        <TouchableOpacity onPress={() => {
          Alert.alert('Clear route?', 'This will remove all stops.', [
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
          <View style={[styles.storeCard, { backgroundColor: bgSec, borderColor: border }]}>
            {/* Store header */}
            <View style={styles.storeHeader}>
              <Text style={styles.storeIcon}>🏪</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.storeName, { color: text }]}>{store.storeName}</Text>
                {store.address && (
                  <Text style={[styles.storeAddress, { color: textTer }]} numberOfLines={1}>
                    {store.address}
                  </Text>
                )}
              </View>
            </View>

            {/* Items in this store */}
            {store.items.map((item) => (
              <View key={item.id} style={[styles.itemRow, { borderTopColor: border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: text }]} numberOfLines={1}>{item.description}</Text>
                  <Text style={[styles.itemPrice, { color: accent }]}>{item.price} each</Text>
                </View>
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    style={[styles.qtyBtn, { borderColor: border }]}
                    onPress={() => setQuantity(item.id, item.quantity - 1)}
                  >
                    <Text style={[styles.qtyBtnText, { color: text }]}>−</Text>
                  </TouchableOpacity>
                  <Text style={[styles.qtyNum, { color: text }]}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={[styles.qtyBtn, { borderColor: border }]}
                    onPress={() => setQuantity(item.id, item.quantity + 1)}
                  >
                    <Text style={[styles.qtyBtnText, { color: accent }]}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
        ListFooterComponent={
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: textSec }]}>Estimated total</Text>
            <Text style={[styles.totalAmount, { color: accent }]}>
              ${stores.flatMap(s => s.items).reduce((sum, i) => sum + i.priceValue * i.quantity, 0).toFixed(2)}
            </Text>
          </View>
        }
      />

      <View style={[styles.ctaWrap, { backgroundColor: bg }]}>
        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: border }]}
            onPress={() => {
              Alert.prompt(
                'Save Route',
                'Give this route a name',
                (name) => {
                  if (name?.trim()) {
                    saveRoute(name, items);
                    Alert.alert('Saved!', `"${name.trim()}" saved to your routes.`);
                  }
                },
                'plain-text',
                `Route ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
              );
            }}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryBtnText, { color: textSec }]}>💾  Save</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: border }]}
            onPress={() => setShowSaved(true)}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryBtnText, { color: textSec }]}>
              📂  Saved{savedRoutes.length > 0 ? ` (${savedRoutes.length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.shareBtn, { borderColor: accent }]}
          onPress={handleShare}
          disabled={sharing}
          accessibilityRole="button"
        >
          {sharing
            ? <ActivityIndicator size="small" color={accent} />
            : <Text style={[styles.shareBtnText, { color: accent }]}>↑  Share Route with a Friend</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity style={[styles.cta, { backgroundColor: accent }]} onPress={buildRoute} accessibilityRole="button">
          <Text style={[styles.ctaText, { color: accentLight }]}>🗺️  Navigate — {stores.length} {stores.length === 1 ? 'stop' : 'stops'}</Text>
        </TouchableOpacity>
      </View>

      {/* Saved Routes modal */}
      <Modal visible={showSaved} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSaved(false)}>
        <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
          <View style={[styles.nav, { borderBottomColor: border }]}>
            <View style={{ width: 28 }} />
            <Text style={[styles.navTitle, { color: text }]}>Saved Routes</Text>
            <TouchableOpacity onPress={() => setShowSaved(false)}>
              <Text style={[styles.clearBtn, { color: accent }]}>Done</Text>
            </TouchableOpacity>
          </View>
          {savedRoutes.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={[styles.emptyTitle, { color: text }]}>No saved routes</Text>
              <Text style={[styles.emptySub, { color: textSec }]}>Tap 💾 Save to keep a route for later.</Text>
            </View>
          ) : (
            <FlatList
              data={savedRoutes}
              keyExtractor={(r) => r.id}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              renderItem={({ item: r }) => (
                <View style={[styles.savedRouteCard, { backgroundColor: bgSec, borderColor: border }]}>
                  <View style={styles.savedRouteHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.savedRouteName, { color: text }]}>{r.name}</Text>
                      <Text style={[styles.savedRouteMeta, { color: textTer }]}>
                        {r.items.length} item{r.items.length !== 1 ? 's' : ''} · {new Date(r.savedAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert('Delete route?', `"${r.name}" will be removed.`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => removeSavedRoute(r.id) },
                        ]);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ color: '#FF3B30', fontSize: 13 }}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[styles.loadRouteBtn, { backgroundColor: accent }]}
                    onPress={() => {
                      Alert.alert(
                        'Load route?',
                        'This will replace your current route.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Load', onPress: () => { replaceAll(r.items); setShowSaved(false); } },
                        ],
                      );
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>Load Route</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
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
  backChevron: { fontSize: 28, lineHeight: 32, marginRight: 8 },
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
  itemPrice: { fontSize: 12, fontWeight: '500' },
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
  totalAmount: { fontSize: 20, fontWeight: '600' },
  ctaWrap: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 12, gap: 10 },
  ctaRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1, borderRadius: 12, padding: 13,
    alignItems: 'center', borderWidth: 0.5,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '500' },
  savedRouteCard: {
    borderRadius: 14, borderWidth: 0.5, padding: 14, gap: 10,
  },
  savedRouteHeader: { flexDirection: 'row', alignItems: 'center' },
  savedRouteName: { fontSize: 15, fontWeight: '600' },
  savedRouteMeta: { fontSize: 12, marginTop: 2 },
  loadRouteBtn: {
    borderRadius: 10, paddingVertical: 9, alignItems: 'center',
  },
  shareBtn: {
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    minHeight: 48,
    justifyContent: 'center',
  },
  shareBtnText: { fontSize: 15, fontWeight: '500' },
  cta: {
    borderRadius: 12,
    padding: 16, alignItems: 'center',
  },
  ctaText: { fontSize: 16, fontWeight: '500' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyIcon: { fontSize: 52, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
