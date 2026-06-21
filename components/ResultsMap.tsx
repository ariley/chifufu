import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import MapView, { Callout, Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { ResultItem } from '../types';

const GREEN = '#1D9E75';

// Oakland, CA fallback so the map always has a sensible center
const FALLBACK_REGION: Region = {
  latitude: 37.8044,
  longitude: -122.2712,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

interface Props {
  results: ResultItem[];
  location: string;
  onSelectItem: (item: ResultItem) => void;
}

export default function ResultsMap({ results, location, onSelectItem }: Props) {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const mapRef = useRef<MapView>(null);

  const [region, setRegion] = useState<Region>(FALLBACK_REGION);
  const [locationReady, setLocationReady] = useState(false);

  useEffect(() => {
    initLocation();
  }, []);

  // When results arrive with coordinates, fit the map to show all markers
  useEffect(() => {
    const pins = results.filter((r) => r.lat != null && r.lng != null);
    if (pins.length > 0 && mapRef.current) {
      mapRef.current.fitToCoordinates(
        pins.map((r) => ({ latitude: r.lat!, longitude: r.lng! })),
        { edgePadding: { top: 80, right: 40, bottom: 80, left: 40 }, animated: true },
      );
    }
  }, [results]);

  async function initLocation() {
    // 1. Try device GPS first
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setRegion({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        });
        setLocationReady(true);
        return;
      } catch (_) {}
    }

    // 2. Fall back to geocoding the location string
    try {
      const [geo] = await Location.geocodeAsync(location);
      if (geo) {
        setRegion({
          latitude: geo.latitude,
          longitude: geo.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        });
      }
    } catch (_) {}
    setLocationReady(true);
  }

  const c = {
    calloutBg: dark ? '#1C1C1E' : '#FFFFFF',
    calloutText: dark ? '#FFFFFF' : '#000000',
    calloutSub: dark ? '#ABABAB' : '#6C6C70',
    calloutBorder: dark ? '#38383A' : '#E5E5EA',
  };

  const pins = results.filter((r) => r.lat != null && r.lng != null);

  return (
    <View style={styles.container}>
      {!locationReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={GREEN} />
        </View>
      )}

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton={Platform.OS === 'android'}
        showsCompass
        loadingEnabled
        loadingIndicatorColor={GREEN}
      >
        {pins.map((item, index) => (
          <Marker
            key={item.id}
            coordinate={{ latitude: item.lat!, longitude: item.lng! }}
            pinColor={index === 0 ? GREEN : '#FF3B30'}
          >
            <Callout onPress={() => onSelectItem(item)} tooltip={false}>
              <View
                style={[
                  styles.callout,
                  { backgroundColor: c.calloutBg, borderColor: c.calloutBorder },
                ]}
              >
                <Text style={[styles.calloutName, { color: c.calloutText }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.calloutPrice}>{item.price}</Text>
                <Text style={[styles.calloutDesc, { color: c.calloutSub }]} numberOfLines={1}>
                  {item.description}
                </Text>
                <Text style={styles.calloutCta}>View details →</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {pins.length === 0 && locationReady && results.length > 0 && (
        <View style={styles.noCoordsBanner}>
          <Text style={styles.noCoordsText}>
            📍 Results loaded — no map pins yet (addresses couldn't be geocoded)
          </Text>
        </View>
      )}

      {/* Recenter button */}
      <TouchableOpacity
        style={[styles.recenterBtn, { backgroundColor: c.calloutBg, borderColor: c.calloutBorder }]}
        onPress={initLocation}
        accessibilityLabel="Re-center map"
      >
        <Text style={{ fontSize: 18 }}>⊕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  callout: {
    width: 200,
    padding: 10,
    borderRadius: 10,
    borderWidth: 0.5,
  },
  calloutName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  calloutPrice: { fontSize: 14, fontWeight: '600', color: GREEN, marginBottom: 2 },
  calloutDesc: { fontSize: 12, marginBottom: 6 },
  calloutCta: { fontSize: 12, color: GREEN, fontWeight: '500' },
  noCoordsBanner: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    padding: 10,
  },
  noCoordsText: { color: '#FFF', fontSize: 12, textAlign: 'center' },
  recenterBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
});
