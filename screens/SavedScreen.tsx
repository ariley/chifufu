import React from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useSavedContext } from '../App';
import { GroceryItem } from '../types';

const SALE_GREEN = '#1D9E75';

interface Props {
  onSelectItem?: (item: GroceryItem) => void;
}

export default function SavedScreen({ onSelectItem }: Props) {
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

  if (saved.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: c.bg }]}>
        <Text style={styles.emptyIcon}>♡</Text>
        <Text style={[styles.emptyTitle, { color: c.text }]}>No saved items yet</Text>
        <Text style={[styles.emptySub, { color: c.textSec }]}>
          Tap the heart on any result to save it here.
        </Text>
      </View>
    );
  }

  function renderCard({ item }: { item: GroceryItem }) {
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: c.bg, borderColor: c.border }]}
        onPress={() => onSelectItem?.(item)}
        accessibilityRole="button"
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.cardName, { color: c.text }]} numberOfLines={1}>
            {item.brand ? `${item.brand} ` : ''}{item.name}
          </Text>
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
        <Text style={[styles.cardSub, { color: c.textSec }]} numberOfLines={1}>
          {item.size}
        </Text>
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
    <FlatList
      data={saved}
      keyExtractor={(item) => item.id}
      renderItem={renderCard}
      contentContainerStyle={[styles.list, { backgroundColor: c.bg }]}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={
        <Text style={[styles.sectionSep, { color: c.textTer }]}>
          {saved.length} SAVED {saved.length === 1 ? 'ITEM' : 'ITEMS'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
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
  },
  cardName: { fontSize: 15, fontWeight: '500', flex: 1, marginRight: 6 },
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
