import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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

export default function CheckEmailScreen({ route, navigation }: Props) {
  const { email } = route.params

  const [code,      setCode]      = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [resent,    setResent]    = useState(false)

  const handleVerify = async () => {
    if (code.length !== 6) return
    setLoading(true)
    setError(null)

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    })

    setLoading(false)
    if (verifyError) {
      setError(verifyError.message)
      setCode('')
    }
    // On success onAuthStateChange in useAuthStore fires — navigator switches automatically
  }

  const handleResend = async () => {
    setResending(true)
    setError(null)
    setResent(false)
    await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    setResending(false)
    setResent(true)
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
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

          <Text style={styles.title}>Enter your code</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to{'\n'}
            <Text style={styles.emailHighlight}>{maskEmail(email)}</Text>
          </Text>

          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(t) => {
              setError(null)
              setResent(false)
              setCode(t.replace(/\D/g, '').slice(0, 6))
            }}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleVerify}
            placeholder="000000"
            placeholderTextColor="#B0A090"
            textAlign="center"
          />

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {resent ? (
            <Text style={styles.resentText}>New code sent!</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.button, (code.length !== 6 || loading) && styles.buttonMuted]}
            onPress={handleVerify}
            disabled={code.length !== 6 || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FAF7F2" />
            ) : (
              <Text style={styles.buttonText}>Verify</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resendBtn}
            onPress={handleResend}
            disabled={resending}
            activeOpacity={0.7}
          >
            <Text style={styles.resendText}>
              {resending ? 'Sending…' : "Didn't receive a code? Resend"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAF7F2' },
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
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
    marginBottom: 32,
  },
  emailHighlight: { color: '#1C1612', fontWeight: '600' },
  codeInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    borderRadius: 12,
    paddingVertical: 20,
    fontSize: 32,
    fontWeight: '700',
    color: '#1C1612',
    letterSpacing: 12,
    minHeight: 72,
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: '#FDF0EC',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  errorText: {
    color: '#C8622A',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  resentText: {
    fontSize: 13,
    color: '#065F46',
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#C8622A',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  buttonMuted: { opacity: 0.5 },
  buttonText: {
    color: '#FAF7F2',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  resendBtn: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  resendText: { fontSize: 13, color: '#7A6A5A' },
})
