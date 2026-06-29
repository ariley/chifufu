import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
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
import { useBucketContext, useSavedRoutesContext } from '../App';
import { useThemeContext } from '../contexts/ThemeContext';
import { BucketItem } from '../types';

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
  storeId: string;
  storeAddress?: string;
  items: BucketItem[];
}

export default function BucketScreen() {
  const navigation = useNavigation();
  const { items, setQuantity, remove, clear, replaceAll, count } = useBucketContext();
  const { routes: savedRoutes, save: saveRoute, remove: removeSavedRoute } = useSavedRoutesContext();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const [showSaved, setShowSaved] = useState(false);

  const { bg, bgSec, text, textSec, textTer, border, accent, accentLight } = useThemeContext();

  // Group items by store
  const stores: StoreGroup[] = useMemo(() => {
    const map = new Map<string, StoreGroup>();
    for (const item of items) {
      const key = item.storeId ?? item.storeName ?? 'unknown';
      if (!map.has(key)) {
        map.set(key, {
          storeName: item.storeName ?? 'Store',
          storeId: key,
          storeAddress: item.storeAddress,
          items: [],
        });
      }
      map.get(key)!.items.push(item);
    }
    return Array.from(map.values());
  }, [items]);

  const total = items.reduce((sum, i) => sum + (i.priceValue ?? 0) * i.quantity, 0);

  async function buildRoute() {
    if (stores.length === 0) return;

    const withAddress = stores.filter((s) => s.storeAddress);
    if (withAddress.length === 0) {
      Alert.alert('No locations', 'None of your list items have store addresses.');
      return;
    }

    let orderedStores = withAddress;
    let userLat: number | null = null;
    let userLng: number | null = null;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
      } catch (_) {}
    }

    const encoded = orderedStores.map((s) => encodeURIComponent(s.storeAddress ?? s.storeName));
    const saddrCoord = userLat != null ? `${userLat},${userLng}` : '';

    function openGoogleMaps() {
      const appUrl = `comgooglemaps://?saddr=${saddrCoord}&daddr=${encoded.join('+to:')}&directionsmode=driving`;
      const webUrl = `https://www.google.com/maps/dir/${saddrCoord || 'My+Location'}/${encoded.join('/')}/`;
      Linking.canOpenURL(appUrl)
        .then((supported) => Linking.openURL(supported ? appUrl : webUrl))
        .catch(() => Linking.openURL(webUrl))
        .catch(() => Alert.alert('Could not open Google Maps'));
    }

    function openAppleMaps() {
      const saddrParam = saddrCoord ? `saddr=${saddrCoord}&` : '';
      Linking.openURL(`maps://?${saddrParam}daddr=${encoded[0]}&dirflg=d`).catch(() =>
        Alert.alert('Could not open Apple Maps'),
      );
    }

    if (Platform.OS === 'ios') {
      const subtitle =
        orderedStores.length > 1
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

  if (items.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <View style={[styles.nav, { borderBottomColor: border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back">
            <Text style={[styles.backChevron, { color: accent }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.navTitle, { color: text }]}>My List</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={[styles.emptyTitle, { color: text }]}>Your list is empty</Text>
          <Text style={[styles.emptySub, { color: textSec }]}>
            Search for groceries and tap "Add to list" to build your shopping list.
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
          <Text style={[styles.backChevron, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: text }]}>
          My List · {count} {count === 1 ? 'item' : 'items'}
        </Text>
        <TouchableOpacity
          onPress={() => {
            Alert.alert('Clear list?', 'This will remove all items.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: clear },
            ]);
          }}
        >
          <Text style={[styles.clearBtn, { color: '#FF3B30' }]}>Clear</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={stores}
        keyExtractor={(s) => s.storeId}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.storeSep} />}
        renderItem={({ item: store }) => (
          <View style={[styles.storeCard, { backgroundColor: bgSec, borderColor: border }]}>
            {/* Store header */}
            <View style={styles.storeHeader}>
              <Text style={styles.storeIcon}>🏪</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.storeName, { color: text }]}>{store.storeName}</Text>
                {store.storeAddress ? (
                  <Text style={[styles.storeAddress, { color: textTer }]} numberOfLines={1}>
                    {store.storeAddress}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Items in this store */}
            {store.items.map((item) => (
              <View key={item.id} style={[styles.itemRow, { borderTopColor: border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: text }]} numberOfLines={2}>
                    {item.brand ? `${item.brand} ` : ''}{item.name}
                  </Text>
                  <Text style={[styles.itemSize, { color: textTer }]} numberOfLines={1}>
                    {item.size}
                  </Text>
                  <Text style={[styles.itemPrice, { color: item.price ? accent : textTer }]}>
                    {item.price ? `${item.price} each` : 'Price unavailable'}
                  </Text>
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
            <Text style={[styles.totalAmount, { color: accent }]}>${total.toFixed(2)}</Text>
          </View>
        }
      />

      <View style={[styles.ctaWrap, { backgroundColor: bg }]}>
        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: border }]}
            onPress={() => {
              if (Platform.OS === 'ios') {
                Alert.prompt(
                  'Save List',
                  'Give this list a name',
                  (name) => {
                    if (name?.trim()) {
                      saveRoute(name, items);
                      Alert.alert('Saved!', `"${name.trim()}" saved.`);
                    }
                  },
                  'plain-text',
                  `List ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
                );
              } else {
                saveRoute(`List ${new Date().toLocaleDateString()}`, items);
                Alert.alert('Saved!', 'List saved.');
              }
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
          style={[styles.cta, { backgroundColor: accent }]}
          onPress={buildRoute}
          accessibilityRole="button"
        >
          <Text style={[styles.ctaText, { color: accentLight }]}>
            🗺️  Navigate — {stores.length} {stores.length === 1 ? 'stop' : 'stops'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Saved Lists modal */}
      <Modal
        visible={showSaved}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSaved(false)}
      >
        <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
          <View style={[styles.nav, { borderBottomColor: border }]}>
            <View style={{ width: 28 }} />
            <Text style={[styles.navTitle, { color: text }]}>Saved Lists</Text>
            <TouchableOpacity onPress={() => setShowSaved(false)}>
              <Text style={[styles.clearBtn, { color: accent }]}>Done</Text>
            </TouchableOpacity>
          </View>
          {savedRoutes.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={[styles.emptyTitle, { color: text }]}>No saved lists</Text>
              <Text style={[styles.emptySub, { color: textSec }]}>Tap Save to keep a list for later.</Text>
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
                        Alert.alert('Delete list?', `"${r.name}" will be removed.`, [
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
                        'Load list?',
                        'This will replace your current list.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Load', onPress: () => { replaceAll(r.items); setShowSaved(false); } },
                        ],
                      );
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>Load List</Text>
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
  itemName: { fontSize: 14, marginBottom: 1 },
  itemSize: { fontSize: 11, marginBottom: 2 },
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
