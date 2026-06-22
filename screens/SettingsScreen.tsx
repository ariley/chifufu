import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useThemeContext, THEME_DEFS, ThemeKey } from '../contexts/ThemeContext';

const APP_VERSION = '1.0.0';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { bg, bgSec, text, textSec, textTer, border, accent, themeKey, setTheme } = useThemeContext();
  const dark = bg === '#000000' || bg.toLowerCase() === '#000000' || bg === '#0F0800';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />

      {/* Nav bar */}
      <View style={[styles.nav, { backgroundColor: bg, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Text style={[styles.backChevron, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: text }]}>Settings</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Appearance section */}
        <Text style={[styles.sectionHeader, { color: textTer }]}>APPEARANCE</Text>
        <View style={[styles.card, { backgroundColor: bgSec, borderColor: border }]}>
          {THEME_DEFS.map((def, index) => {
            const isActive = themeKey === def.key;
            const isLast = index === THEME_DEFS.length - 1;
            return (
              <React.Fragment key={def.key}>
                <TouchableOpacity
                  style={styles.themeRow}
                  onPress={() => setTheme(def.key as ThemeKey)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${def.label} theme`}
                >
                  {/* Color swatch */}
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: def.accent },
                    ]}
                  />
                  <Text style={[styles.themeLabel, { color: text }]}>{def.label}</Text>
                  {isActive && (
                    <Text style={[styles.checkmark, { color: accent }]}>✓</Text>
                  )}
                </TouchableOpacity>
                {!isLast && <View style={[styles.rowSep, { backgroundColor: border }]} />}
              </React.Fragment>
            );
          })}
        </View>

        {/* About section */}
        <Text style={[styles.sectionHeader, { color: textTer }]}>ABOUT</Text>
        <View style={[styles.card, { backgroundColor: bgSec, borderColor: border }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: textSec }]}>Version</Text>
            <Text style={[styles.infoValue, { color: text }]}>{APP_VERSION}</Text>
          </View>
          <View style={[styles.rowSep, { backgroundColor: border }]} />
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: textSec }]}>App</Text>
            <Text style={[styles.infoValue, { color: text }]}>Chifufu</Text>
          </View>
        </View>

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
  backChevron: { fontSize: 28, lineHeight: 32, marginRight: 8, width: 28 },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
  },
  scroll: { padding: 20, paddingBottom: 48 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 0.5,
    marginBottom: 28,
    overflow: 'hidden',
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  themeLabel: {
    flex: 1,
    fontSize: 16,
  },
  checkmark: {
    fontSize: 18,
    fontWeight: '600',
  },
  rowSep: {
    height: 0.5,
    marginLeft: 56,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoLabel: { fontSize: 15 },
  infoValue: { fontSize: 15 },
});
