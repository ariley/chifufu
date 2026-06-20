import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { BadgeKey, CategoryKey, ResultItem, RootStackParamList } from '../types';
import { fetchCheapFoodOptions } from '../utils/anthropic';
import ResultsMap from '../components/ResultsMap';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Results'>;
type Route = RouteProp<RootStackParamList, 'Results'>;

const GREEN = '#1D9E75';
const GREEN_LIGHT = '#E1F5EE';

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  'go-out': 'Go out',
  'order-in': 'Order in',
  'grocery': 'Groceries',
  'under5': 'Under $5',
  'under10': 'Under $10',
};

const BADGE_CONFIG: Record<BadgeKey, { bg: string; color: string; label: string }> = {
  deal: { bg: '#EAF3DE', color: '#3B6D11', label: 'Best deal' },
  fast: { bg: '#E6F1FB', color: '#185FA5', label: 'Fast' },
  close: { bg: '#FAEEDA', color: '#854F0B', label: 'Nearby' },
};

const CHIPS: { key: CategoryKey; label: string }[] = [
  { key: 'go-out', label: 'Go out' },
  { key: 'order-in', label: 'Order in' },
  { key: 'grocery', label: 'Groceries' },
  { key: 'under5', label: 'Under $5' },
  { key: 'under10', label: 'Under $10' },
];

type Tab = 'list' | 'map' | 'saved';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'list', label: 'List', icon: '☰' },
  { key: 'map', label: 'Map', icon: '🗺️' },
  { key: 'saved', label: 'Saved', icon: '♥' },
];

export default function ResultsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { category: initialCategory, location } = route.params;
  const scheme = useColorScheme();
  const dark = scheme === 'dark';

  const [activeCategory, setActiveCategory] = useState<CategoryKey>(initialCategory);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('list');

  const c = {
    bg: dark ? '#000000' : '#FFFFFF',
    bgSec: dark ? '#1C1C1E' : '#F2F2F7',
    text: dark ? '#FFFFFF' : '#000000',
    textSec: dark ? '#ABABAB' : '#6C6C70',
    textTer: dark ? '#636366' : '#AEAEB2',
    border: dark ? '#38383A' : '#E5E5EA',
  };

  const loadResults = useCallback(
    async (category: CategoryKey) => {
      setLoading(true);
      setResults([]);
      try {
        const items = await fetchCheapFoodOptions(location, category);
        setResults(items);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Something went wrong';
        Alert.alert('Could not load results', msg);
      } finally {
        setLoading(false);
      }
    },
    [location],
  );

  useEffect(() => {
    loadResults(activeCategory);
  }, [activeCategory, loadResults]);

  function renderCard({ item, index }: { item: ResultItem; index: number }) {
    const isTop = index === 0;
    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: c.bg,
            borderColor: isTop ? GREEN : c.border,
            borderWidth: isTop ? 2 : 0.5,
          },
        ]}
        onPress={() => navigation.navigate('Detail', { item, location })}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.price}`}
      >
        {isTop && (
          <View style={styles.topPickBadge}>
            <Text style={styles.topPickText}>Top pick</Text>
          </View>
        )}
        <View style={styles.cardHeader}>
          <Text style={[styles.cardName, { color: c.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.cardPrice}>{item.price}</Text>
        </View>
        <Text style={[styles.cardSub, { color: c.textSec }]} numberOfLines={1}>
          {item.description}
        </Text>
        <View style={styles.cardMeta}>
          {item.badges.map((b) => {
            const cfg = BADGE_CONFIG[b];
            if (!cfg) return null;
            return (
              <View key={b} style={[styles.badge, { backgroundColor: cfg.bg }]}>
                <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            );
          })}
          <Text style={[styles.dist, { color: c.textTer }]}>📍 {item.distance}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />

      {/* Nav bar */}
      <View style={[styles.nav, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <View style={styles.navCenter}>
          <Text style={[styles.navTitle, { color: c.text }]}>
            {CATEGORY_LABELS[activeCategory]}
          </Text>
          <Text style={[styles.navSub, { color: c.textTer }]}>
            {location} · sorted by price
          </Text>
        </View>
        <TouchableOpacity accessibilityLabel="Filters">
          <Text style={[styles.filterIcon, { color: c.textSec }]}>⚙</Text>
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      <View style={[styles.chipRow, { backgroundColor: c.bg }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipContent}
        >
          {CHIPS.map((chip) => {
            const active = chip.key === activeCategory;
            return (
              <TouchableOpacity
                key={chip.key}
                style={[
                  styles.chip,
                  {
                    borderColor: active ? GREEN : c.border,
                    backgroundColor: active ? GREEN : c.bg,
                  },
                ]}
                onPress={() => setActiveCategory(chip.key)}
              >
                <Text style={[styles.chipText, { color: active ? GREEN_LIGHT : c.textSec }]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Results list or map */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={GREEN} />
          <Text style={[styles.loadingText, { color: c.textSec }]}>
            Finding cheap options near you…
          </Text>
        </View>
      ) : activeTab === 'map' ? (
        <ResultsMap
          results={results}
          location={location}
          onSelectItem={(item) => navigation.navigate('Detail', { item, location })}
        />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            results.length > 0 ? (
              <Text style={[styles.sectionSep, { color: c.textTer }]}>CHEAPEST FIRST</Text>
            ) : null
          }
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: c.textSec }]}>
              No results found. Try a different category.
            </Text>
          }
        />
      )}

      {/* Bottom tab bar */}
      <View style={[styles.tabBar, { backgroundColor: c.bg, borderTopColor: c.border }]}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tab}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabIcon, { color: active ? GREEN : c.textTer }]}>
                {tab.icon}
              </Text>
              <Text style={[styles.tabLabel, { color: active ? GREEN : c.textTer }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
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
  navCenter: { flex: 1 },
  navTitle: { fontSize: 16, fontWeight: '500' },
  navSub: { fontSize: 12 },
  filterIcon: { fontSize: 20 },
  chipRow: { paddingVertical: 12 },
  chipContent: { paddingHorizontal: 16, gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 0.5,
  },
  chipText: { fontSize: 12, fontWeight: '500' },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { fontSize: 14 },
  listContent: { padding: 16, paddingBottom: 24 },
  sectionSep: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1,
    paddingBottom: 10,
  },
  separator: { height: 10 },
  card: {
    borderRadius: 12,
    padding: 14,
  },
  topPickBadge: {
    alignSelf: 'flex-start',
    backgroundColor: GREEN_LIGHT,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 6,
  },
  topPickText: { fontSize: 10, fontWeight: '500', color: '#0F6E56' },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardName: { fontSize: 15, fontWeight: '500', flex: 1, marginRight: 6 },
  cardPrice: { fontSize: 16, fontWeight: '500', color: GREEN },
  cardSub: { fontSize: 12, marginBottom: 6 },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11 },
  dist: { fontSize: 11 },
  emptyText: { textAlign: 'center', marginTop: 48, fontSize: 14 },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: 0.5,
  },
  tab: { alignItems: 'center', gap: 3 },
  tabIcon: { fontSize: 18 },
  tabLabel: { fontSize: 10 },
});
