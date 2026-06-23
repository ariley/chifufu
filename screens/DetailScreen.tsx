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
import { useThemeContext } from '../contexts/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

// DetailScreen is no longer part of the main navigation flow.
// Kept as a placeholder to avoid compilation errors.
export default function DetailScreen() {
  const navigation = useNavigation();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const { bg, text, accent } = useThemeContext();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Text style={[styles.backChevron, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: text }]}>Details</Text>
        <View style={{ width: 28 }} />
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
  },
  backChevron: { fontSize: 28, lineHeight: 32 },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
  },
});
