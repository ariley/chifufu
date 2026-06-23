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
import { GroceryItem } from '../types';

const GREEN = '#1D9E75';

const FALLBACK_REGION: Region = {
  latitude: 37.8044,
  longitude: -122.2712,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

interface Props {
  results: GroceryItem[];
  locationName: string;
  storeLat?: number;
  storeLng?: number;
  onSelectItem: (item: GroceryItem) => void;
}

export default function ResultsMap({ results, locationName, storeLat, storeLng, onSelectItem }: Props) {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const mapRef = useRef<MapView>(null);

  const [region, setRegion] = useState<Region>(FALLBACK_REGION);
  const [locationReady, setLocationReady] = useState(false);

  useEffect(() => {
    initLocation();
  }, []);

  useEffect(() => {
    if (storeLat != null && storeLng != null && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: storeLat,
        longitude: storeLng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    }
  }, [storeLat, storeLng]);

  async function initLocation() {
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

    try {
      const [geo] = await Location.geocodeAsync(locationName);
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
        {storeLat != null && storeLng != null && (
          <Marker
            coordinate={{ latitude: storeLat, longitude: storeLng }}
            pinColor={GREEN}
          />
        )}
      </MapView>

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
