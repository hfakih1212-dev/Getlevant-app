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
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useT } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import type { ShopperStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<ShopperStackParamList, 'Login'>

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  return `${local.slice(0, 2)}***@${domain}`
}

export default function PhoneLoginScreen({ navigation }: Props) {
  const t = useT()
  const [email,      setEmail]      = useState('')
  const [otpCode,    setOtpCode]    = useState('')
  const [isCodeSent, setIsCodeSent] = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [resending,  setResending]  = useState(false)
  const [resent,     setResent]     = useState(false)
  // Only one input is visible per stage, so a single focus flag covers both
  const [inputFocused, setInputFocused] = useState(false)

  const codeInputRef = useRef<TextInput>(null)

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const handleSendCode = async () => {
    if (!emailValid) { setError(t('login.invalidEmail')); return }
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
      setError(err instanceof Error ? err.message : t('login.genericError'))
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
      // onAuthStateChange in useAuthStore picks up the session; pop back to
      // wherever the guest came from (vendors get re-rooted automatically)
      if (navigation.canGoBack()) navigation.goBack()
      else navigation.replace('MarketplaceFeed')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.invalidCode'))
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
      setError(err instanceof Error ? err.message : t('login.genericError'))
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
          {navigation.canGoBack() && (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
          )}
          <View style={styles.header}>
            <Text style={styles.title}>
              {isCodeSent ? t('login.enterCode') : t('login.welcome')}
            </Text>
            <Text style={styles.subtitle}>
              {isCodeSent
                ? t('login.sentCode')
                : t('login.subtitle')}
              {isCodeSent && (
                <Text style={styles.emailHighlight}>{maskEmail(email)}</Text>
              )}
            </Text>
          </View>

          {/* Stage 1 — Email input */}
          {!isCodeSent && (
            <TextInput
              style={[styles.input, inputFocused && styles.inputFocused]}
              value={email}
              onChangeText={(t) => { setError(null); setEmail(t) }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="you@example.com"
              placeholderTextColor="#B0A090"
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
              style={[styles.codeInput, inputFocused && styles.inputFocused]}
              value={otpCode}
              onChangeText={(t) => {
                setError(null)
                setResent(false)
                setOtpCode(t.replace(/\D/g, '').slice(0, 6))
              }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
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
            <Text style={styles.resentText}>{t('login.newCodeSent')}</Text>
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
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.buttonText}>{t('login.sendCode')}</Text>
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
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.buttonText}>{t('login.confirmCode')}</Text>
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
                  {resending ? t('login.resending') : t('login.resend')}
                </Text>
              </TouchableOpacity>

              <Text style={styles.dot}>·</Text>

              <TouchableOpacity
                onPress={handleChangeEmail}
                activeOpacity={0.7}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryText}>{t('login.changeEmail')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#FFFFFF' },
  flex:      { flex: 1 },
  container: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 40,
  },
  backBtn:   { width: 44, height: 44, justifyContent: 'center', marginBottom: 8 },
  backIcon:  { fontSize: 22, color: '#1C1612', lineHeight: 26 },
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
  inputFocused: {
    borderColor: '#D9552B',
  },
  errorBox: {
    backgroundColor: '#FDF0EC',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  errorText: {
    color: '#D9552B',
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
    backgroundColor: '#D9552B',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  buttonMuted: { opacity: 0.5 },
  buttonText: {
    color: '#FFFFFF',
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
