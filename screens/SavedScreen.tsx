import React from 'react';
import {
  FlatList,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSavedContext } from '../App';
import { GroceryItem, RootStackParamList } from '../types';

const SALE_GREEN = '#1D9E75';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Saved'>;

export default function SavedScreen() {
  const navigation = useNavigation<Nav>();
  const { saved, remove, loaded } = useSavedContext();
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

  if (!loaded) return null;

  const header = (
    <View style={[styles.nav, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back">
        <Text style={[styles.backChevron, { color: SALE_GREEN }]}>‹</Text>
      </TouchableOpacity>
      <Text style={[styles.navTitle, { color: c.text }]}>My Products</Text>
      <View style={{ width: 28 }} />
    </View>
  );

  if (saved.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
        {header}
        <View style={[styles.empty, { backgroundColor: c.bg }]}>
          <Text style={styles.emptyIcon}>♡</Text>
          <Text style={[styles.emptyTitle, { color: c.text }]}>No saved products yet</Text>
          <Text style={[styles.emptySub, { color: c.textSec }]}>
            Scan a barcode or save a product from results to build your personal grocery list.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  function renderCard({ item }: { item: GroceryItem }) {
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: c.bg, borderColor: c.border }]}
        onPress={() => navigation.navigate('Detail', { item })}
        accessibilityRole="button"
      >
        <View style={styles.cardHeader}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.productImage} resizeMode="contain" />
          ) : (
            <View style={[styles.productImage, styles.productImagePlaceholder, { backgroundColor: c.bgSec }]}>
              <Text style={{ fontSize: 18 }}>▣</Text>
            </View>
          )}
          <View style={styles.cardMain}>
            <Text style={[styles.cardName, { color: c.text }]} numberOfLines={2}>
              {item.brand ? `${item.brand} ` : ''}{item.name}
            </Text>
            <Text style={[styles.cardSub, { color: c.textSec }]} numberOfLines={1}>
              {[item.productSize, item.storeName, item.source].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.cardPrice}>{item.price ?? 'Info'}</Text>
            <TouchableOpacity
              onPress={() => remove(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Remove from saved"
            >
              <Text style={styles.heartFilled}>♥</Text>
            </TouchableOpacity>
          </View>
        </View>
        {item.onSale && (
          <View style={styles.saleBadge}>
            <Text style={styles.saleBadgeText}>SALE</Text>
            {item.savings ? <Text style={styles.savingsText}>{item.savings}</Text> : null}
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      {header}
      <FlatList
        data={saved}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        contentContainerStyle={[styles.list, { backgroundColor: c.bg }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <Text style={[styles.sectionSep, { color: c.textTer }]}>
            {saved.length} SAVED {saved.length === 1 ? 'PRODUCT' : 'PRODUCTS'}
          </Text>
        }
      />
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
  navTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 8,
  },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  list: { padding: 16, paddingBottom: 24 },
  sectionSep: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1,
    paddingBottom: 10,
  },
  separator: { height: 10 },
  card: {
    borderRadius: 12,
    borderWidth: 0.5,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
    gap: 10,
  },
  productImage: { width: 48, height: 48, borderRadius: 8 },
  productImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardMain: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '600' },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardPrice: { fontSize: 16, fontWeight: '500', color: SALE_GREEN },
  heartFilled: { fontSize: 18, color: '#FF3B30' },
  cardSub: { fontSize: 12, marginBottom: 6 },
  saleBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  savingsText: { fontSize: 11, color: SALE_GREEN, fontWeight: '500' },
});
