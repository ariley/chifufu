import React from 'react';
import {
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../contexts/AuthContext';
import { RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Profile'>;

const GREEN = '#1D9E75';
const GREEN_LIGHT = '#E1F5EE';
const RED = '#E53935';

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const { user, isAuthenticated, signOut } = useAuth();

  const c = {
    bg: dark ? '#000000' : '#FFFFFF',
    bgSec: dark ? '#1C1C1E' : '#F2F2F7',
    text: dark ? '#FFFFFF' : '#000000',
    textSec: dark ? '#ABABAB' : '#6C6C70',
    textTer: dark ? '#636366' : '#AEAEB2',
    border: dark ? '#38383A' : '#E5E5EA',
  };

  function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            navigation.navigate('Home');
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backIcon, { color: GREEN }]}>‹</Text>
          <Text style={[styles.backText, { color: GREEN }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Profile</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.content}>
        {isAuthenticated && user ? (
          <>
            {/* Account section */}
            <Text style={[styles.sectionLabel, { color: c.textTer }]}>ACCOUNT</Text>
            <View style={[styles.card, { backgroundColor: c.bgSec, borderColor: c.border }]}>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: c.textSec }]}>Email</Text>
                <Text style={[styles.rowValue, { color: c.text }]} numberOfLines={1}>
                  {user.email}
                </Text>
              </View>
            </View>

            {/* Sign out button */}
            <TouchableOpacity
              style={[styles.signOutBtn, { borderColor: RED }]}
              onPress={handleSignOut}
              accessibilityRole="button"
            >
              <Text style={[styles.signOutText, { color: RED }]}>Sign Out</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Not signed in */}
            <View style={styles.guestContainer}>
              <Text style={styles.guestIcon}>👤</Text>
              <Text style={[styles.guestHeadline, { color: c.text }]}>
                Sign in to sync your data
              </Text>
              <Text style={[styles.guestSub, { color: c.textSec }]}>
                Save items and routes across all your devices.
              </Text>
              <TouchableOpacity
                style={styles.signInBtn}
                onPress={() => navigation.navigate('Auth')}
                accessibilityRole="button"
              >
                <Text style={styles.signInBtnText}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 60,
  },
  backIcon: { fontSize: 24, lineHeight: 28 },
  backText: { fontSize: 16 },
  title: { fontSize: 17, fontWeight: '600' },
  content: { paddingHorizontal: 24, paddingTop: 24 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 8,
  },
  card: {
    borderRadius: 12,
    borderWidth: 0.5,
    marginBottom: 24,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowLabel: { fontSize: 15, width: 60 },
  rowValue: { fontSize: 15, flex: 1, textAlign: 'right' },
  signOutBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: { fontSize: 16, fontWeight: '500' },
  guestContainer: {
    alignItems: 'center',
    paddingTop: 48,
    gap: 8,
  },
  guestIcon: { fontSize: 48, marginBottom: 8 },
  guestHeadline: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  guestSub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  signInBtn: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  signInBtnText: {
    color: GREEN_LIGHT,
    fontSize: 16,
    fontWeight: '500',
  },
});
