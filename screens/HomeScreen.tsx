import React, { useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { CategoryKey, RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const GREEN = '#1D9E75';
const GREEN_LIGHT = '#E1F5EE';

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
];

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const [selected, setSelected] = useState<HomeCategory>('grocery');
  const [location, setLocation] = useState('Oakland, CA');
  const [searchQuery, setSearchQuery] = useState('');

  const c = {
    bg: dark ? '#000000' : '#FFFFFF',
    bgSec: dark ? '#1C1C1E' : '#F2F2F7',
    text: dark ? '#FFFFFF' : '#000000',
    textSec: dark ? '#ABABAB' : '#6C6C70',
    textTer: dark ? '#636366' : '#AEAEB2',
    border: dark ? '#38383A' : '#E5E5EA',
  };

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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <Text style={[styles.appLabel, { color: c.textTer }]}>CHEAP EATS</Text>
          <Text style={[styles.headline, { color: c.text }]}>
            {"What's the cheapest\noption near you?"}
          </Text>
          <Text style={[styles.subhead, { color: c.textSec }]}>
            We find the best value — every time.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.locationRow, { backgroundColor: c.bgSec, borderColor: c.border }]}
          onPress={handleLocationTap}
          accessibilityLabel={`Current location: ${location}. Tap to change.`}
        >
          <Text style={styles.locationPin}>📍</Text>
          <Text style={[styles.locationLabel, { color: c.textSec }]}>Near</Text>
          <Text style={[styles.locationCity, { color: c.text }]}>{location}</Text>
          <Text style={[styles.chevron, { color: c.textTer }]}>›</Text>
        </TouchableOpacity>

        {/* Search bar */}
        <View style={[styles.searchRow, { backgroundColor: c.bgSec, borderColor: c.border }]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder="Search for an item… e.g. avocados"
            placeholderTextColor={c.textTer}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (searchQuery.trim()) {
                navigation.navigate('Results', { category: selected, location, searchQuery: searchQuery.trim() });
              }
            }}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: c.textTer, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: c.textTer }]}>
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
                    backgroundColor: c.bg,
                    borderColor: isSelected ? GREEN : c.border,
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
                  <Text style={[styles.optionTitle, { color: c.text }]}>{opt.title}</Text>
                  <Text style={[styles.optionDesc, { color: c.textSec }]}>
                    {opt.description}
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: c.textTer }]}>›</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.ctaWrap, { backgroundColor: c.bg }]}>
        <TouchableOpacity
          style={styles.cta}
          onPress={() => navigation.navigate('Results', {
            category: selected,
            location,
            searchQuery: searchQuery.trim() || undefined,
          })}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>
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
  appLabel: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 6,
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
    marginBottom: 20,
    borderRadius: 12,
    padding: 12,
    borderWidth: 0.5,
    gap: 8,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15 },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 24,
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
    backgroundColor: GREEN,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: GREEN_LIGHT, fontSize: 16, fontWeight: '500' },
});
