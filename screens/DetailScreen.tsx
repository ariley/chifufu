import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useThemeContext } from '../contexts/ThemeContext';
import { fetchProductDetails } from '../lib/api';
import { ProductDetails, RootStackParamList } from '../types';

type Route = RouteProp<RootStackParamList, 'Detail'>;

export default function DetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const { item } = route.params;
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const { bg, bgSec, text, textSec, textTer, border, accent } = useThemeContext();

  const [details, setDetails] = useState<ProductDetails | null>(() => ({
    query: item.detailQuery || item.name,
    name: item.name,
    brand: item.brand || null,
    productSize: item.productSize ?? null,
    imageUrl: item.imageUrl,
    ingredients: item.ingredients ?? null,
    calories: item.calories ?? null,
    nutrition: item.nutrition ?? null,
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetails = useCallback(async () => {
    const query = item.detailQuery || item.name;
    if (!query) return;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchProductDetails(query);
      setDetails({
        ...next,
        imageUrl: next.imageUrl || item.imageUrl,
        productSize: next.productSize || item.productSize || null,
        ingredients: next.ingredients || item.ingredients || null,
        calories: next.calories || item.calories || null,
        nutrition: next.nutrition || item.nutrition || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load product details');
    } finally {
      setLoading(false);
    }
  }, [item]);

  useEffect(() => {
    if (!item.ingredients || !item.calories || !item.imageUrl) {
      loadDetails();
    }
  }, [item.calories, item.imageUrl, item.ingredients, loadDetails]);

  const nutritionRows = [
    ['Calories', details?.nutrition?.calories || details?.calories],
    ['Serving', details?.nutrition?.servingSize],
    ['Fat', details?.nutrition?.fat],
    ['Saturated fat', details?.nutrition?.saturatedFat],
    ['Trans fat', details?.nutrition?.transFat],
    ['Cholesterol', details?.nutrition?.cholesterol],
    ['Carbs', details?.nutrition?.carbs],
    ['Sugars', details?.nutrition?.sugars],
    ['Fiber', details?.nutrition?.fiber],
    ['Protein', details?.nutrition?.protein],
    ['Sodium', details?.nutrition?.sodium],
    ['Calcium', details?.nutrition?.calcium],
    ['Iron', details?.nutrition?.iron],
    ['Potassium', details?.nutrition?.potassium],
    ['Nutri-Score', details?.nutrition?.nutriScore?.toUpperCase()],
  ].filter(([, value]) => !!value);

  const labelRows = [
    ['Package', details?.productSize],
    ['Allergens', details?.allergens?.join(', ')],
    ['Labels', details?.labels?.join(', ')],
    ['Source', details?.source],
  ].filter(([, value]) => !!value);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={[styles.nav, { borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Text style={[styles.backChevron, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: text }]}>Product Details</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: bgSec, borderColor: border }]}>
          {details?.imageUrl ? (
            <Image source={{ uri: details.imageUrl }} style={styles.image} resizeMode="contain" />
          ) : (
            <View style={[styles.imageFallback, { backgroundColor: bg }]}>
              <Text style={styles.fallbackIcon}>🛒</Text>
            </View>
          )}
        </View>

        <Text style={[styles.title, { color: text }]}>{details?.name || item.name}</Text>
        {!!details?.brand && <Text style={[styles.subtitle, { color: textSec }]}>{details.brand}</Text>}
        {!!details?.productSize && <Text style={[styles.subtitle, { color: textSec }]}>{details.productSize}</Text>}
        <Text style={[styles.storeLine, { color: textTer }]}>
          {item.storeName ? `${item.storeName} · ` : ''}{item.price ?? item.source ?? 'Product information'}
        </Text>

        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={accent} />
            <Text style={[styles.loadingText, { color: textSec }]}>Loading nutrition...</Text>
          </View>
        )}

        {!!error && (
          <View style={[styles.notice, { borderColor: border, backgroundColor: bgSec }]}>
            <Text style={[styles.noticeText, { color: textSec }]}>
              Product details are not available for this item yet.
            </Text>
            <TouchableOpacity onPress={loadDetails}>
              <Text style={[styles.retryText, { color: accent }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: text }]}>Nutrition</Text>
          {nutritionRows.length > 0 ? (
            <View style={[styles.nutritionCard, { borderColor: border, backgroundColor: bgSec }]}>
              {nutritionRows.map(([label, value]) => (
                <View key={label} style={[styles.nutritionRow, { borderBottomColor: border }]}>
                  <Text style={[styles.nutritionLabel, { color: textSec }]}>{label}</Text>
                  <Text style={[styles.nutritionValue, { color: text }]}>{value}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: textTer }]}>No nutrition data found.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: text }]}>Ingredients</Text>
          <Text style={[styles.ingredients, { color: details?.ingredients ? textSec : textTer }]}>
            {details?.ingredients || 'No ingredients listed.'}
          </Text>
        </View>

        {labelRows.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: text }]}>Label</Text>
            <View style={[styles.labelCard, { borderColor: border, backgroundColor: bgSec }]}>
              {labelRows.map(([label, value]) => (
                <View key={label} style={[styles.labelRow, { borderBottomColor: border }]}>
                  <Text style={[styles.labelName, { color: textSec }]}>{label}</Text>
                  <Text style={[styles.labelValue, { color: text }]}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
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
  navTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '500' },
  content: { padding: 20, paddingBottom: 36 },
  hero: {
    height: 210,
    borderRadius: 14,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  imageFallback: {
    width: 120,
    height: 120,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: { fontSize: 42 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 15, marginBottom: 4 },
  storeLine: { fontSize: 13, marginBottom: 16 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  loadingText: { fontSize: 13 },
  notice: {
    borderWidth: 0.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  noticeText: { fontSize: 13, lineHeight: 18 },
  retryText: { fontSize: 13, fontWeight: '600' },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  nutritionCard: { borderWidth: 0.5, borderRadius: 12, overflow: 'hidden' },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  nutritionLabel: { fontSize: 14 },
  nutritionValue: { fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  emptyText: { fontSize: 14 },
  ingredients: { fontSize: 14, lineHeight: 21 },
  labelCard: { borderWidth: 0.5, borderRadius: 12, overflow: 'hidden' },
  labelRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  labelName: { width: 86, fontSize: 14 },
  labelValue: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 19 },
});
