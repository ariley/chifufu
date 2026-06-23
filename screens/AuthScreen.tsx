import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
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
import { useAuth } from '../contexts/AuthContext';
import { RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Auth'>;

const GREEN = '#1D9E75';
const GREEN_LIGHT = '#E1F5EE';
const RED = '#E53935';

export default function AuthScreen() {
  const navigation = useNavigation<Nav>();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const { signIn, signUp } = useAuth();

  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verifyMessage, setVerifyMessage] = useState(false);

  const c = {
    bg: dark ? '#000000' : '#FFFFFF',
    bgSec: dark ? '#1C1C1E' : '#F2F2F7',
    text: dark ? '#FFFFFF' : '#000000',
    textSec: dark ? '#ABABAB' : '#6C6C70',
    textTer: dark ? '#636366' : '#AEAEB2',
    border: dark ? '#38383A' : '#E5E5EA',
  };

  function resetForm() {
    setError('');
    setVerifyMessage(false);
  }

  function switchTab(next: 'signin' | 'signup') {
    setTab(next);
    resetForm();
  }

  async function handleSubmit() {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setError('');
    setVerifyMessage(false);

    if (tab === 'signin') {
      const { error: authError } = await signIn(trimmedEmail, trimmedPassword);
      setLoading(false);
      if (authError) {
        setError(authError);
      } else {
        navigation.navigate('Home');
      }
    } else {
      const { error: authError } = await signUp(trimmedEmail, trimmedPassword);
      setLoading(false);
      if (authError) {
        setError(authError);
      } else {
        setVerifyMessage(true);
      }
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Back"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[styles.backChevron, { color: GREEN }]}>‹</Text>
          </TouchableOpacity>

          <Text style={[styles.appLabel, { color: c.textTer }]}>CHIFUFU</Text>
          <Text style={[styles.headline, { color: c.text }]}>
            {tab === 'signin' ? 'Welcome back' : 'Create account'}
          </Text>
          <Text style={[styles.subhead, { color: c.textSec }]}>
            {tab === 'signin'
              ? 'Sign in to sync your saved items and routes.'
              : 'Save your items and routes across devices.'}
          </Text>

          <View style={[styles.tabs, { backgroundColor: c.bgSec, borderColor: c.border }]}>
            <TouchableOpacity
              style={[styles.tab, tab === 'signin' && styles.tabActive]}
              onPress={() => switchTab('signin')}
            >
              <Text style={[styles.tabText, { color: tab === 'signin' ? GREEN : c.textSec }]}>
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === 'signup' && styles.tabActive]}
              onPress={() => switchTab('signup')}
            >
              <Text style={[styles.tabText, { color: tab === 'signup' ? GREEN : c.textSec }]}>
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>

          {verifyMessage && (
            <View style={styles.verifyBox}>
              <Text style={styles.verifyIcon}>✉️</Text>
              <Text style={styles.verifyText}>
                Check your email to verify your account, then sign in.
              </Text>
            </View>
          )}

          {!!error && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          <View style={[styles.inputWrap, { backgroundColor: c.bgSec, borderColor: c.border }]}>
            <TextInput
              style={[styles.input, { color: c.text, borderBottomColor: c.border }]}
              placeholder="Email"
              placeholderTextColor={c.textTer}
              value={email}
              onChangeText={(t) => { setEmail(t); setError(''); }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
            />
            <TextInput
              style={[styles.input, styles.inputLast, { color: c.text }]}
              placeholder="Password"
              placeholderTextColor={c.textTer}
              value={password}
              onChangeText={(t) => { setPassword(t); setError(''); }}
              secureTextEntry
              textContentType={tab === 'signup' ? 'newPassword' : 'password'}
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color={GREEN_LIGHT} />
            ) : (
              <Text style={styles.btnText}>
                {tab === 'signin' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.guestBtn}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={[styles.guestText, { color: c.textSec }]}>Continue as guest</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  backBtn: { marginBottom: 8, alignSelf: 'flex-start' },
  backChevron: { fontSize: 36, lineHeight: 40, fontWeight: '300' },
  appLabel: { fontSize: 12, fontWeight: '500', letterSpacing: 1, marginBottom: 8 },
  headline: { fontSize: 26, fontWeight: '600', marginBottom: 6 },
  subhead: { fontSize: 14, marginBottom: 28, lineHeight: 20 },
  tabs: { flexDirection: 'row', borderRadius: 10, borderWidth: 0.5, marginBottom: 20, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tabText: { fontSize: 14, fontWeight: '500' },
  verifyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E1F5EE',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  verifyIcon: { fontSize: 18, marginTop: 1 },
  verifyText: { flex: 1, fontSize: 14, color: '#1D9E75', lineHeight: 20 },
  errorText: { color: RED, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  inputWrap: { borderRadius: 12, borderWidth: 0.5, marginBottom: 16, overflow: 'hidden' },
  input: { fontSize: 15, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  inputLast: { borderBottomWidth: 0 },
  btn: {
    backgroundColor: GREEN,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    minHeight: 52,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: GREEN_LIGHT, fontSize: 16, fontWeight: '500' },
  guestBtn: { alignItems: 'center', paddingVertical: 12 },
  guestText: { fontSize: 14 },
});
