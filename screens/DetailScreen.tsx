import React from 'react';
import {
  Alert,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { BadgeKey, RootStackParamList } from '../types';
import { useSavedContext } from '../App';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Detail'>;
type Route = RouteProp<RootStackParamList, 'Detail'>;

const GREEN = '#1D9E75';
const GREEN_LIGHT = '#E1F5EE';

const BADGE_CONFIG: Record<BadgeKey, { bg: string; color: string; label: string }> = {
  deal: { bg: '#EAF3DE', color: '#3B6D11', label: 'Best deal' },
  fast: { bg: '#E6F1FB', color: '#185FA5', label: 'Fast' },
  close: { bg: '#FAEEDA', color: '#854F0B', label: 'Nearby' },
};

export default function DetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { item, location } = route.params;
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

  const { isSaved, toggle } = useSavedContext();
  const isDelivery = !!item.platform;
  const ctaLabel = isDelivery ? `Open ${item.platform}` : 'Get directions';
  const ctaIcon = isDelivery ? '🔗' : '🗺️';

  function handleCTA() {
    if (isDelivery) {
      Alert.alert(
        'Open App',
        `This would deep-link into ${item.platform} for this deal.`,
      );
    } else {
      const query = encodeURIComponent(`${item.name}${item.address ? ' ' + item.address : ' ' + location}`);
      Linking.openURL(`https://maps.apple.com/?q=${query}`).catch(() =>
        Alert.alert('Could not open Maps'),
      );
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />

      <View style={[styles.nav, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: c.text }]}>Details</Text>
        <TouchableOpacity
          onPress={() => toggle(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={isSaved(item.id) ? 'Unsave' : 'Save'}
        >
          <Text style={{ fontSize: 22, color: isSaved(item.id) ? '#FF3B30' : c.textTer }}>
            {isSaved(item.id) ? '♥' : '♡'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Inline map — only shown when coordinates are available */}
        {item.lat != null && item.lng != null && (
          <TouchableOpacity onPress={handleCTA} activeOpacity={0.9} accessibilityLabel="Open directions">
            <MapView
              style={styles.miniMap}
              initialRegion={{
                latitude: item.lat,
                longitude: item.lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
              pointerEvents="none"
            >
              <Marker
                coordinate={{ latitude: item.lat, longitude: item.lng }}
                pinColor={GREEN}
              />
            </MapView>
            <View style={styles.miniMapOverlay}>
              <Text style={styles.miniMapLabel}>{ctaIcon}  {ctaLabel}</Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={[styles.headerCard, { backgroundColor: c.bgSec, borderColor: c.border }]}>
          <View style={styles.headerTop}>
            <Text style={[styles.name, { color: c.text }]}>{item.name}</Text>
            <View style={styles.priceWrap}>
              <Text style={styles.price}>{item.price}</Text>
              <Text style={[styles.priceNote, { color: c.textTer }]}>est.</Text>
            </View>
          </View>
          <Text style={[styles.description, { color: c.textSec }]}>{item.description}</Text>
          {item.badges.length > 0 && (
            <View style={styles.badges}>
              {item.badges.map((b) => {
                const cfg = BADGE_CONFIG[b];
                return (
                  <View key={b} style={[styles.badge, { backgroundColor: cfg.bg }]}>
                    <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={[styles.infoCard, { backgroundColor: c.bgSec, borderColor: c.border }]}>
          {item.address ? (
            <View style={[styles.infoRow, { borderBottomColor: c.border, borderBottomWidth: 0.5 }]}>
              <Text style={styles.infoEmoji}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: c.textTer }]}>Address</Text>
                <Text style={[styles.infoValue, { color: c.text }]}>{item.address}</Text>
              </View>
            </View>
          ) : null}
          {item.platform ? (
            <View style={[styles.infoRow, { borderBottomColor: c.border, borderBottomWidth: 0.5 }]}>
              <Text style={styles.infoEmoji}>🚲</Text>
              <View>
                <Text style={[styles.infoLabel, { color: c.textTer }]}>Order via</Text>
                <Text style={[styles.infoValue, { color: c.text }]}>{item.platform}</Text>
              </View>
            </View>
          ) : null}
          <View style={styles.infoRow}>
            <Text style={styles.infoEmoji}>📏</Text>
            <View>
              <Text style={[styles.infoLabel, { color: c.textTer }]}>Distance</Text>
              <Text style={[styles.infoValue, { color: c.text }]}>{item.distance}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.ctaWrap, { backgroundColor: c.bg }]}>
        <TouchableOpacity style={styles.cta} onPress={handleCTA} accessibilityRole="button">
          <Text style={styles.ctaText}>{ctaIcon}  {ctaLabel}</Text>
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
  backChevron: { fontSize: 28, color: GREEN, lineHeight: 32 },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
  },
  navSpacer: { width: 24 },
  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12, paddingBottom: 32 },
  miniMap: { height: 180, borderRadius: 16, overflow: 'hidden', marginBottom: 0 },
  miniMapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    alignItems: 'center',
  },
  miniMapLabel: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  headerCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 0.5,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  name: { fontSize: 20, fontWeight: '600', flex: 1, marginRight: 8 },
  priceWrap: { alignItems: 'flex-end' },
  price: { fontSize: 22, fontWeight: '600', color: GREEN },
  priceNote: { fontSize: 10, marginTop: 1 },
  description: { fontSize: 14, marginBottom: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '500' },
  infoCard: {
    borderRadius: 16,
    borderWidth: 0.5,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  infoEmoji: { fontSize: 20, marginRight: 14 },
  infoLabel: { fontSize: 11, marginBottom: 2 },
  infoValue: { fontSize: 15 },
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
