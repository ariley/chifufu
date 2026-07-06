import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useThemeContext } from '../contexts/ThemeContext';
import { fetchProductByBarcode } from '../lib/api';
import { GroceryItem, RootStackParamList } from '../types';
import { useSavedContext } from '../App';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Scan'>;

function productToItem(code: string, details: Awaited<ReturnType<typeof fetchProductByBarcode>>): GroceryItem {
  const label = [details.brand, details.name].filter(Boolean).join(' ') || details.name || code;
  return {
    id: `barcode-${code}`,
    upc: details.code || code,
    name: details.name || label,
    brand: details.brand || '',
    productSize: details.productSize || null,
    size: details.productSize || '',
    price: null,
    priceValue: null,
    regularPrice: null,
    onSale: false,
    savings: null,
    imageUrl: details.imageUrl || null,
    ingredients: details.ingredients || null,
    calories: details.calories || null,
    nutrition: details.nutrition || null,
    detailQuery: label,
    badges: ['scanned'],
    source: details.source || 'Open Food Facts',
    isLivePrice: false,
  };
}

export default function BarcodeScannerScreen() {
  const navigation = useNavigation<Nav>();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const { bg, bgSec, text, textSec, textTer, border, accent, accentLight } = useThemeContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastCodeRef = useRef<string | null>(null);
  const { remember } = useSavedContext();

  const handleBarcode = useCallback(async (result: BarcodeScanningResult) => {
    const code = String(result.data || '').replace(/\D/g, '');
    if (code.length < 6 || scanning || lastCodeRef.current === code) return;

    lastCodeRef.current = code;
    setScanning(true);
    setError(null);
    try {
      const details = await fetchProductByBarcode(code);
      const item = productToItem(code, details);
      remember(item);
      navigation.replace('Detail', { item });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Product not found for this barcode');
      lastCodeRef.current = null;
    } finally {
      setScanning(false);
    }
  }, [navigation, remember, scanning]);

  if (!permission) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <View style={styles.center}>
          <ActivityIndicator color={accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <View style={[styles.nav, { borderBottomColor: border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back">
            <Text style={[styles.backChevron, { color: accent }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.navTitle, { color: text }]}>Scan Barcode</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.permissionWrap}>
          <Text style={[styles.permissionTitle, { color: text }]}>Camera access is needed</Text>
          <Text style={[styles.permissionText, { color: textSec }]}>
            Scan a package barcode to save the exact product and look up its label.
          </Text>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accent }]} onPress={requestPermission}>
            <Text style={[styles.primaryText, { color: accentLight }]}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <StatusBar style="light" />
      <View style={[styles.nav, { borderBottomColor: 'rgba(255,255,255,0.18)', backgroundColor: '#000' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Text style={[styles.backChevron, { color: '#fff' }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: '#fff' }]}>Scan Barcode</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.cameraWrap}>
        <CameraView
          style={styles.camera}
          facing="back"
          onBarcodeScanned={scanning ? undefined : handleBarcode}
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
          }}
        />
        <View style={styles.overlay}>
          <View style={[styles.scanBox, { borderColor: accent }]} />
          <View style={[styles.instructionCard, { backgroundColor: bgSec, borderColor: border }]}>
            {scanning ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={accent} />
                <Text style={[styles.instructionText, { color: text }]}>Looking up product...</Text>
              </View>
            ) : (
              <>
                <Text style={[styles.instructionText, { color: text }]}>
                  Center the UPC or EAN barcode inside the frame.
                </Text>
                {error ? <Text style={[styles.errorText, { color: '#FF3B30' }]}>{error}</Text> : null}
                <Text style={[styles.hintText, { color: textTer }]}>
                  Scanned products are saved to My Products.
                </Text>
              </>
            )}
          </View>
        </View>
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
  backChevron: { fontSize: 28, lineHeight: 32, marginRight: 8 },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  permissionWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  permissionTitle: { fontSize: 22, fontWeight: '700' },
  permissionText: { fontSize: 15, lineHeight: 22 },
  primaryBtn: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryText: { fontSize: 15, fontWeight: '700' },
  cameraWrap: { flex: 1, backgroundColor: '#000' },
  camera: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scanBox: {
    width: '86%',
    maxWidth: 340,
    aspectRatio: 1.8,
    borderWidth: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  instructionCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 28,
    borderRadius: 12,
    borderWidth: 0.5,
    padding: 14,
  },
  instructionText: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  hintText: { fontSize: 12, marginTop: 6 },
  errorText: { fontSize: 13, marginTop: 8, lineHeight: 18, fontWeight: '600' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
