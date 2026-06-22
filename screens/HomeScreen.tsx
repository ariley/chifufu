import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { CategoryKey, RootStackParamList } from '../types';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { useThemeContext } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

type HomeCategory = Exclude<CategoryKey, 'under5' | 'under10'>;

interface Option {
  key: HomeCategory;
  title: string;
  description: string;
  icon: string;
  iconBg: string;
}

const OPTIONS: Option[] = [
  {
    key: 'grocery',
    title: 'Groceries',
    description: 'Cheapest items at stores near you',
    icon: '🛒',
    iconBg: '#EAF3DE',
  },
  {
    key: 'order-in',
    title: 'Order in',
    description: 'Delivery deals under your budget',
    icon: '🚲',
    iconBg: '#E6F1FB',
  },
  {
    key: 'go-out',
    title: 'Go out',
    description: 'Cheapest meals at nearby spots',
    icon: '🍽️',
    iconBg: '#FAECE7',
  },
  {
    key: 'pet-stores',
    title: 'Pet Stores',
    description: 'Cheapest pet food and supplies',
    icon: '🐾',
    iconBg: '#F3E8FB',
  },
];

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const { bg, bgSec, text, textSec, textTer, border, accent, accentLight } = useThemeContext();
  const { isAuthenticated } = useAuth();
  const [selected, setSelected] = useState<HomeCategory>('grocery');
  const [location, setLocation] = useState('');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const { history, push: pushHistory, remove: removeHistory } = useSearchHistory();

  useEffect(() => {
    detectLocation();
  }, []);

  async function detectLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocation('Oakland, CA');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (geo) {
        const city = geo.city ?? geo.subregion ?? geo.region ?? '';
        const state = geo.region ?? '';
        setLocation(city && state ? `${city}, ${state}` : city || state || 'My Location');
      } else {
        setLocation('My Location');
      }
    } catch {
      setLocation('Oakland, CA');
    } finally {
      setLocating(false);
    }
  }

  function handleLocationTap() {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Change Location',
        'Enter a city or zip code',
        (text) => {
          if (text?.trim()) setLocation(text.trim());
        },
        'plain-text',
        location,
      );
    } else {
      Alert.alert('Change Location', 'Tap OK and type a new city', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'OK' },
      ]);
    }
  }

  function navigate(query?: string, cat?: HomeCategory) {
    const q = (query ?? searchQuery).trim();
    const category = cat ?? selected;
    if (q) pushHistory(q, category, location);
    navigation.navigate('Results', {
      category,
      location,
      searchQuery: q || undefined,
      lat: gpsCoords?.lat,
      lng: gpsCoords?.lng,
    });
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.top}>
          <View style={styles.topRow}>
            <Text style={[styles.appLabel, { color: textTer }]}>CHIFUFU</Text>
            <View style={styles.topRowIcons}>
              <TouchableOpacity
                onPress={() => navigation.navigate(isAuthenticated ? 'Profile' : 'Auth')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={isAuthenticated ? 'View profile' : 'Sign in'}
                accessibilityRole="button"
              >
                <Text style={[styles.gearIcon, { color: textTer }]}>👤</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate('Settings')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Settings"
                accessibilityRole="button"
              >
                <Text style={[styles.gearIcon, { color: textTer }]}>⚙️</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={[styles.headline, { color: text }]}>
            {"What's the cheapest\noption near you?"}
          </Text>
          <Text style={[styles.subhead, { color: textSec }]}>
            We find the best value — every time.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.locationRow, { backgroundColor: bgSec, borderColor: border }]}
          onPress={handleLocationTap}
          accessibilityLabel={locating ? 'Detecting location' : `Current location: ${location}. Tap to change.`}
        >
          <Text style={styles.locationPin}>{locating ? '⌖' : '📍'}</Text>
          <Text style={[styles.locationLabel, { color: textSec }]}>Near</Text>
          <Text style={[styles.locationCity, { color: locating ? textTer : text }]}>
            {locating ? 'Detecting…' : location}
          </Text>
          {!locating && <Text style={[styles.chevron, { color: textTer }]}>›</Text>}
        </TouchableOpacity>

        {/* Search bar */}
        <View style={[styles.searchRow, { backgroundColor: bgSec, borderColor: border }]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            ref={searchInputRef}
            style={[styles.searchInput, { color: text }]}
            placeholder="Search for an item… e.g. avocados"
            placeholderTextColor={textTer}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={() => { if (searchQuery.trim()) navigate(); }}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: textTer, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Recent searches */}
        {history.length > 0 && !searchQuery.trim() && (
          <View style={styles.historySection}>
            <View style={styles.historyHeader}>
              <Text style={[styles.sectionLabel, { color: textTer, paddingHorizontal: 0 }]}>RECENT</Text>
              <TouchableOpacity onPress={() => {
                Alert.alert('Clear history?', '', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear', style: 'destructive', onPress: () => history.forEach(e => removeHistory(e.query)) },
                ]);
              }}>
                <Text style={[styles.clearHistoryBtn, { color: textTer }]}>Clear</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.historyChips}
            >
              {history.map((entry) => (
                <TouchableOpacity
                  key={entry.query + entry.timestamp}
                  style={[styles.historyChip, { backgroundColor: bgSec, borderColor: border }]}
                  onPress={() => navigate(entry.query, entry.category as HomeCategory)}
                >
                  <Text style={[styles.historyChipText, { color: textSec }]} numberOfLines={1}>
                    🕐 {entry.query}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: textTer }]}>
          {searchQuery.trim() ? 'OR BROWSE BY CATEGORY' : 'HOW DO YOU WANT TO EAT?'}
        </Text>

        <View style={styles.options}>
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.optionCard,
                  {
                    backgroundColor: bg,
                    borderColor: isSelected ? accent : border,
                    borderWidth: isSelected ? 2 : 0.5,
                  },
                ]}
                onPress={() => setSelected(opt.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
              >
                <View style={[styles.optionIcon, { backgroundColor: opt.iconBg }]}>
                  <Text style={styles.optionEmoji}>{opt.icon}</Text>
                </View>
                <View style={styles.optionText}>
                  <Text style={[styles.optionTitle, { color: text }]}>{opt.title}</Text>
                  <Text style={[styles.optionDesc, { color: textSec }]}>
                    {opt.description}
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: textTer }]}>›</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.ctaWrap, { backgroundColor: bg }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: accent }, locating && { opacity: 0.5 }]}
          disabled={locating}
          onPress={() => navigate()}
          accessibilityRole="button"
        >
          <Text style={[styles.ctaText, { color: accentLight }]}>
            {searchQuery.trim() ? `🔍  Search "${searchQuery.trim()}"` : '🔍  Find cheap food'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingBottom: 120 },
  top: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 16 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  topRowIcons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gearIcon: { fontSize: 20 },
  appLabel: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1,
  },
  headline: {
    fontSize: 26,
    fontWeight: '500',
    lineHeight: 32,
    marginBottom: 4,
  },
  subhead: { fontSize: 14 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 12,
    borderRadius: 12,
    padding: 12,
    borderWidth: 0.5,
    gap: 8,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15 },
  historySection: {
    marginHorizontal: 24,
    marginBottom: 16,
    gap: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearHistoryBtn: { fontSize: 12 },
  historyChips: { gap: 8, paddingRight: 4 },
  historyChip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 0.5,
    maxWidth: 180,
  },
  historyChipText: { fontSize: 13 },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 16,
    borderRadius: 12,
    padding: 12,
    borderWidth: 0.5,
  },
  locationPin: { fontSize: 16, marginRight: 8 },
  locationLabel: { fontSize: 14, flex: 1 },
  locationCity: { fontSize: 14, fontWeight: '500', marginRight: 4 },
  chevron: { fontSize: 18 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1,
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  options: { paddingHorizontal: 24, gap: 10 },
  optionCard: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  optionEmoji: { fontSize: 22 },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: '500', marginBottom: 2 },
  optionDesc: { fontSize: 13 },
  ctaWrap: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
  },
  cta: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontSize: 16, fontWeight: '500' },
});
