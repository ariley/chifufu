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
import { RootStackParamList } from '../types';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { useThemeContext } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const QUICK_SEARCHES = ['Milk', 'Eggs', 'Bread', 'Chicken'];

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const { bg, bgSec, text, textSec, textTer, border, accent, accentLight } = useThemeContext();
  const { isAuthenticated } = useAuth();
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
        (t) => {
          if (t?.trim()) setLocation(t.trim());
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

  function handleSearch(query: string) {
    const q = query.trim();
    if (!q) return;
    const lat = gpsCoords?.lat ?? 37.8044;
    const lng = gpsCoords?.lng ?? -122.2712;
    pushHistory(q);
    navigation.navigate('Results', { query: q, lat, lng });
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top bar */}
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
                <Text style={[styles.iconBtn, { color: textTer }]}>👤</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate('Settings')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Settings"
                accessibilityRole="button"
              >
                <Text style={[styles.iconBtn, { color: textTer }]}>⚙️</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={[styles.headline, { color: text }]}>
            {"Find the best\ngrocery prices"}
          </Text>
        </View>

        {/* Location row */}
        <TouchableOpacity
          style={[styles.locationRow, { backgroundColor: bgSec, borderColor: border }]}
          onPress={handleLocationTap}
          accessibilityLabel={locating ? 'Detecting location' : `Near ${location}. Tap to change.`}
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
            placeholder="Search groceries… e.g. avocados"
            placeholderTextColor={textTer}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={() => handleSearch(searchQuery)}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ color: textTer, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick search chips */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: textTer }]}>QUICK SEARCH</Text>
          <View style={styles.chipWrap}>
            {QUICK_SEARCHES.map((q) => (
              <TouchableOpacity
                key={q}
                style={[styles.chip, { backgroundColor: bgSec, borderColor: border }]}
                onPress={() => handleSearch(q)}
                accessibilityRole="button"
                accessibilityLabel={`Search for ${q}`}
              >
                <Text style={[styles.chipText, { color: textSec }]}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Recent searches */}
        {history.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: textTer }]}>RECENT</Text>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert('Clear history?', '', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Clear',
                      style: 'destructive',
                      onPress: () => history.forEach((e) => removeHistory(e.query)),
                    },
                  ]);
                }}
              >
                <Text style={[styles.clearBtn, { color: textTer }]}>Clear</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentChips}
            >
              {history.map((entry) => (
                <TouchableOpacity
                  key={entry.query + entry.timestamp}
                  style={[styles.recentChip, { backgroundColor: bgSec, borderColor: border }]}
                  onPress={() => handleSearch(entry.query)}
                >
                  <Text style={[styles.recentChipText, { color: textSec }]} numberOfLines={1}>
                    🕐 {entry.query}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Search CTA */}
      <View style={[styles.ctaWrap, { backgroundColor: bg }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: accent }, (locating || !searchQuery.trim()) && styles.ctaDisabled]}
          disabled={locating || !searchQuery.trim()}
          onPress={() => handleSearch(searchQuery)}
          accessibilityRole="button"
        >
          <Text style={[styles.ctaText, { color: accentLight }]}>
            {searchQuery.trim() ? `Search "${searchQuery.trim()}"` : 'Type something to search'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingBottom: 120 },
  top: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 20 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  topRowIcons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: { fontSize: 20 },
  appLabel: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1,
  },
  headline: {
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 34,
  },
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
  locationLabel: { fontSize: 14, marginRight: 4 },
  locationCity: { fontSize: 14, fontWeight: '500', flex: 1 },
  chevron: { fontSize: 18 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 24,
    borderRadius: 12,
    padding: 12,
    borderWidth: 0.5,
    gap: 8,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15 },
  section: { paddingHorizontal: 24, marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 10,
  },
  clearBtn: { fontSize: 12 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 0.5,
  },
  chipText: { fontSize: 14, fontWeight: '500' },
  recentChips: { gap: 8, paddingRight: 4 },
  recentChip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 0.5,
    maxWidth: 180,
  },
  recentChipText: { fontSize: 13 },
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
  ctaDisabled: { opacity: 0.5 },
  ctaText: { fontSize: 16, fontWeight: '500' },
});
