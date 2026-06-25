import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import { AuthStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<AuthStackParamList, 'CheckEmail'>

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  return `${local.slice(0, 2)}***@${domain}`
}

// Pull a named param from a URL fragment or query string
function extractParam(url: string, key: string): string | null {
  // Fragment first (magic-link tokens land in the hash)
  const hashIdx = url.indexOf('#')
  const fragment = hashIdx !== -1 ? url.slice(hashIdx + 1) : ''
  const queryIdx = url.indexOf('?')
  const query = queryIdx !== -1 ? url.slice(queryIdx + 1, hashIdx !== -1 ? hashIdx : undefined) : ''

  for (const part of [fragment, query]) {
    const params = new URLSearchParams(part)
    const val = params.get(key)
    if (val) return val
  }
  return null
}

async function handleDeepLink(url: string): Promise<{ ok: boolean; error?: string }> {
  const access_token = extractParam(url, 'access_token')
  const refresh_token = extractParam(url, 'refresh_token')

  if (!access_token || !refresh_token) {
    return { ok: false, error: 'Invalid link — missing tokens.' }
  }

  const { error } = await supabase.auth.setSession({ access_token, refresh_token })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export default function CheckEmailScreen({ route, navigation }: Props) {
  const { email } = route.params
  const [status, setStatus] = useState<'waiting' | 'processing' | 'error'>('waiting')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const processUrl = async (url: string | null) => {
    if (!url) return
    // Only handle auth-callback URLs
    if (!url.includes('auth-callback')) return
    setStatus('processing')
    const result = await handleDeepLink(url)
    if (!result.ok) {
      setStatus('error')
      setErrorMsg(result.error ?? 'Something went wrong.')
    }
    // On success, onAuthStateChange in useAuthStore fires and navigator switches stack
  }

  useEffect(() => {
    // Web: supabase.auth detectSessionInUrl:true handles token extraction
    // automatically from the URL hash; onAuthStateChange in useAuthStore fires
    // and the navigator switches — no manual Linking needed here.
    if (Platform.OS === 'web') return

    // Native: intercept the deep-link when the OS hands the URL to the app
    Linking.getInitialURL().then(processUrl)
    const sub = Linking.addEventListener('url', ({ url }) => processUrl(url))
    return () => sub.remove()
  }, [])

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.iconWrap}>
          <Text style={styles.icon}>✉️</Text>
        </View>

        <Text style={styles.title}>Check your inbox</Text>
        <Text style={styles.subtitle}>
          We sent a sign-in link to{'\n'}
          <Text style={styles.emailHighlight}>{maskEmail(email)}</Text>
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {Platform.OS === 'web' ? 'Click the link in your email' : 'Open the email and tap the link'}
          </Text>
          <Text style={styles.cardBody}>
            {Platform.OS === 'web'
              ? 'Click "Sign In to Souk" in the email — this browser tab will sign you in automatically.'
              : 'Tap "Sign In to Souk" in the email — it will open directly in the app and log you in automatically.'}
          </Text>
        </View>

        {status === 'processing' && (
          <View style={styles.stateRow}>
            <ActivityIndicator color="#C8622A" />
            <Text style={styles.stateText}>Signing you in…</Text>
          </View>
        )}

        {status === 'error' && errorMsg && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity onPress={() => { setStatus('waiting'); setErrorMsg(null) }} activeOpacity={0.7}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={styles.resendBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.resendText}>Wrong email or didn't arrive? Go back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAF7F2' },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  backButton: {
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: 32,
    alignSelf: 'flex-start',
  },
  backText: { fontSize: 15, color: '#C8622A', fontWeight: '500' },
  iconWrap: { alignItems: 'center', marginBottom: 24 },
  icon: { fontSize: 64 },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1C1612',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#7A6A5A',
    textAlign: 'center',
    marginBottom: 40,
  },
  emailHighlight: { color: '#1C1612', fontWeight: '600' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    shadowColor: '#1C1612',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1612',
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#7A6A5A',
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 24,
  },
  stateText: { fontSize: 15, color: '#7A6A5A' },
  errorBox: {
    backgroundColor: '#FDF0EC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#C8622A',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 8,
  },
  retryText: { fontSize: 14, color: '#C8622A', fontWeight: '600' },
  resendBtn: {
    marginTop: 'auto',
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  resendText: { fontSize: 13, color: '#7A6A5A' },
})
