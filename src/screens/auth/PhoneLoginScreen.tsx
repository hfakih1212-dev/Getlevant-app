import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  return `${local.slice(0, 2)}***@${domain}`
}

export default function PhoneLoginScreen() {
  const [email,      setEmail]      = useState('')
  const [otpCode,    setOtpCode]    = useState('')
  const [isCodeSent, setIsCodeSent] = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [resending,  setResending]  = useState(false)
  const [resent,     setResent]     = useState(false)

  const codeInputRef = useRef<TextInput>(null)

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const handleSendCode = async () => {
    if (!emailValid) { setError('Enter a valid email address.'); return }
    setError(null)
    setLoading(true)
    try {
      const { error: apiError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      })
      if (apiError) throw apiError
      setIsCodeSent(true)
      setTimeout(() => codeInputRef.current?.focus(), 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (otpCode.length !== 6) return
    setError(null)
    setLoading(true)
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: 'email',
      })
      if (verifyError) throw verifyError
      // On success onAuthStateChange fires in useAuthStore — navigator switches automatically
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code. Try again.')
      setOtpCode('')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    setError(null)
    setResent(false)
    setOtpCode('')
    try {
      const { error: apiError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      })
      if (apiError) throw apiError
      setResent(true)
      setTimeout(() => codeInputRef.current?.focus(), 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend. Try again.')
    } finally {
      setResending(false)
    }
  }

  const handleChangeEmail = () => {
    setIsCodeSent(false)
    setOtpCode('')
    setError(null)
    setResent(false)
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
          <View style={styles.header}>
            <Text style={styles.title}>
              {isCodeSent ? 'Enter your code' : 'Welcome to Souk'}
            </Text>
            <Text style={styles.subtitle}>
              {isCodeSent
                ? `We sent a 6-digit code to\n`
                : 'Enter your email to sign in or create an account.'}
              {isCodeSent && (
                <Text style={styles.emailHighlight}>{maskEmail(email)}</Text>
              )}
            </Text>
          </View>

          {/* Stage 1 — Email input */}
          {!isCodeSent && (
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(t) => { setError(null); setEmail(t) }}
              placeholder="you@example.com"
              placeholderTextColor="#A89880"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="send"
              onSubmitEditing={handleSendCode}
            />
          )}

          {/* Stage 2 — OTP code input */}
          {isCodeSent && (
            <TextInput
              ref={codeInputRef}
              style={styles.codeInput}
              value={otpCode}
              onChangeText={(t) => {
                setError(null)
                setResent(false)
                setOtpCode(t.replace(/\D/g, '').slice(0, 6))
              }}
              keyboardType="number-pad"
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={handleVerifyCode}
              placeholder="000000"
              placeholderTextColor="#B0A090"
              textAlign="center"
            />
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {resent ? (
            <Text style={styles.resentText}>New code sent!</Text>
          ) : null}

          {/* Primary action button */}
          {!isCodeSent ? (
            <TouchableOpacity
              style={[styles.button, (!emailValid || loading) && styles.buttonMuted]}
              onPress={handleSendCode}
              disabled={!emailValid || loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#FAF7F2" />
                : <Text style={styles.buttonText}>Send Code</Text>
              }
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.button, (otpCode.length !== 6 || loading) && styles.buttonMuted]}
              onPress={handleVerifyCode}
              disabled={otpCode.length !== 6 || loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#FAF7F2" />
                : <Text style={styles.buttonText}>Confirm Code</Text>
              }
            </TouchableOpacity>
          )}

          {/* Stage 2 secondary actions */}
          {isCodeSent && (
            <View style={styles.secondaryRow}>
              <TouchableOpacity
                onPress={handleResend}
                disabled={resending}
                activeOpacity={0.7}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryText}>
                  {resending ? 'Sending…' : 'Resend code'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.dot}>·</Text>

              <TouchableOpacity
                onPress={handleChangeEmail}
                activeOpacity={0.7}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryText}>Change email</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#FAF7F2' },
  flex:      { flex: 1 },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 40,
  },
  header:    { marginBottom: 40 },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1C1612',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#7A6A5A',
  },
  emailHighlight: {
    color: '#1C1612',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#1C1612',
    minHeight: 56,
    marginBottom: 16,
  },
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
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  secondaryBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  secondaryText: {
    fontSize: 13,
    color: '#7A6A5A',
  },
  dot: {
    fontSize: 13,
    color: '#B0A090',
  },
})
